// js/chat-widget.js
// Centralized voice & chat UI logic for all Krevio pages.
// Each page provides a CONFIG object; this widget handles streaming chat,
// chunked TTS playback, STT, and voice UI.

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
// Voice on by default — chat and voice should feel like one bot turn.
// Persisted in localStorage so the user's choice survives page reloads.
let voiceMode = (() => {
  try {
    const v = window.localStorage?.getItem('krevio.voiceMode');
    return v === null ? true : v === '1';
  } catch { return true; }
})();

let recognition = null;
let isRecording = false;
let micSendTimer = null;
let ttsAudio = new Audio();
let audioUnlocked = false;

// Sentence-level audio queue
const audioQueue = [];
let isPlayingQueue = false;
let currentQueueAudio = null;
let queueGeneration = 0; // bumped on barge-in / mode change to invalidate inflight chunks

// Debug logs off by default. Enable in DevTools with: window.__KREVIO_CHAT_DEBUG = true
const _dbg = (...args) => { if (typeof window !== 'undefined' && window.__KREVIO_CHAT_DEBUG) console.log('[chat-widget]', ...args); };

/* ═══════════════════════════════════════════
   AUTOPLAY UNLOCK
   Browsers require a user gesture before Audio.play().
   We attach a one-time listener on the FIRST click/touch
   anywhere on the page to play a silent snippet.
═══════════════════════════════════════════ */
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  _dbg('Unlocking audio element via user gesture');
  ttsAudio.src = 'data:audio/mpeg;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  ttsAudio.play().then(() => {
    _dbg('Audio unlocked successfully');
  }).catch(e => {
    _dbg('Unlock play promise caught:', e.message);
  });
  ttsAudio.pause();
}

/* ═══════════════════════════════════════════
   TOAST NOTIFICATION
═══════════════════════════════════════════ */
function _widgetShowToast(msg) {
  if (typeof showToast === 'function') { showToast(msg); return; }
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '10px 20px',
    borderRadius: '8px', fontSize: '14px', zIndex: '9999',
    fontFamily: 'var(--font-body, system-ui, sans-serif)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'opacity 0.3s'
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

/* ═══════════════════════════════════════════
   TEXT CLEANING
═══════════════════════════════════════════ */
function cleanForSpeech(text) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[✓✅⚠↔●○🏠🔑📊★·→←]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 800);
}

/* ═══════════════════════════════════════════
   SENTENCE BOUNDARY DETECTION
   Walks the running buffer and slices off complete
   sentences. Skips abbreviations so "Mr. Smith"
   doesn't break early. Handles ., !, ?, ¡, ¿.
═══════════════════════════════════════════ */
const SENTENCE_ABBREVIATIONS = new Set([
  'Mr','Mrs','Ms','Dr','Sr','Jr','St','Ave','Blvd','Rd',
  'Inc','Ltd','Co','Corp','vs','etc','approx','est',
  'Jan','Feb','Mar','Apr','Jun','Jul','Aug','Sep','Sept','Oct','Nov','Dec',
  'No','Ph','i.e','e.g','a.m','p.m','U.S','U.K'
]);

function extractSentences(text) {
  const sentences = [];
  let lastEnd = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '.' || c === '!' || c === '?') {
      // Look ahead — must be end-of-buffer OR followed by whitespace
      const next = text[i + 1];
      if (next !== undefined && !/\s/.test(next)) {
        // Mid-token punctuation (e.g. "3.5", "U.S.A"). Skip.
        i++;
        continue;
      }
      // For '.', check if the preceding word is an abbreviation
      if (c === '.') {
        let wordStart = i;
        while (wordStart > lastEnd && /[\w]/.test(text[wordStart - 1])) wordStart--;
        const word = text.slice(wordStart, i);
        if (SENTENCE_ABBREVIATIONS.has(word)) { i++; continue; }
      }
      // It's a sentence boundary. We need to know that the *next* non-space
      // character actually exists, otherwise the sentence might still be
      // growing (e.g., "Hello." right at the end of the current chunk where
      // a space hasn't arrived yet). Only commit if there is at least one
      // visible character after the whitespace, OR if the buffer ends here.
      let scan = i + 1;
      while (scan < text.length && /\s/.test(text[scan])) scan++;
      if (scan >= text.length && next === undefined) {
        // End of buffer with no trailing space yet — wait for more.
        break;
      }
      const sentence = text.slice(lastEnd, i + 1).trim();
      if (sentence) sentences.push(sentence);
      lastEnd = scan;
      i = scan;
    } else {
      i++;
    }
  }
  return { sentences, remaining: text.slice(lastEnd) };
}

/* ═══════════════════════════════════════════
   STREAMING CHAT HELPER
   Centralizes the SSE parser so each demo's sendChat is
   ~10 lines. Callbacks fire in order:
   - onToken(chunk, fullSoFar)  — every text fragment
   - onSentence(sentence)       — when a complete sentence lands
   - onDone(fullText)           — stream finished cleanly
   - onError({fallback,reason}) — Gemini error or transport failure
═══════════════════════════════════════════ */
async function streamChat({ message, history, businessType, signal, onToken, onSentence, onDone, onError }) {
  const endpoint = (typeof CONFIG !== 'undefined' && CONFIG.chatEndpoint) || '/api/demos/chat';
  let fullText = '';
  let buffer = '';
  let sawFallback = null;
  let res;

  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, businessType }),
      signal
    });
  } catch (err) {
    if (onError) onError({ fallback: true, reason: 'transport: ' + (err && err.message) });
    return;
  }

  if (!res.ok || !res.body) {
    if (onError) onError({ fallback: true, reason: 'http: ' + res.status });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let frameBuf = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      frameBuf += decoder.decode(value, { stream: true });

      // Split into SSE frames (separator: blank line)
      let idx;
      while ((idx = frameBuf.indexOf('\n\n')) !== -1) {
        const frame = frameBuf.slice(0, idx);
        frameBuf = frameBuf.slice(idx + 2);
        const dataLine = frame.split('\n').find(l => l.startsWith('data:'));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(5).trim();
        if (!jsonStr) continue;
        let obj;
        try { obj = JSON.parse(jsonStr); } catch { continue; }
        if (obj.fallback) { sawFallback = obj; continue; }
        if (obj.done) continue;
        if (obj.text) {
          fullText += obj.text;
          buffer += obj.text;
          if (onToken) onToken(obj.text, fullText);
          const { sentences, remaining } = extractSentences(buffer);
          buffer = remaining;
          for (const s of sentences) {
            if (onSentence) onSentence(s);
          }
        }
      }
    }
  } catch (err) {
    if (onError) onError({ fallback: true, reason: 'stream: ' + (err && err.message) });
    return;
  }

  // Flush trailing buffer (final sentence without terminal punctuation)
  const trailing = buffer.trim();
  if (trailing && onSentence) onSentence(trailing);

  if (sawFallback) {
    if (onError) onError(sawFallback);
  } else if (onDone) {
    onDone(fullText);
  }
}

/* ═══════════════════════════════════════════
   AUDIO QUEUE — sentence-level TTS playback
   speakChunk() pushes a sentence to the queue and
   starts the player if it isn't already running.
═══════════════════════════════════════════ */
function speakChunk(text) {
  if (!voiceMode) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;
  const gen = queueGeneration;
  audioQueue.push({ text: clean, gen });
  if (!isPlayingQueue) {
    isPlayingQueue = true;
    _playNextChunk();
  }
}

async function _playNextChunk() {
  const item = audioQueue.shift();
  if (!item) {
    isPlayingQueue = false;
    resetVoiceUI();
    return;
  }
  // Drop stale chunks if the user barged in / cleared the queue
  if (item.gen !== queueGeneration) { _playNextChunk(); return; }

  // Voice-active UI on
  const header = document.querySelector('.chat-header');
  if (header) header.classList.add('voice-active');
  const toggleBtn = document.getElementById('voiceToggle');
  if (toggleBtn) { toggleBtn.classList.add('playing'); toggleBtn.textContent = '■'; }

  const ttsEndpoint = (typeof CONFIG !== 'undefined' && CONFIG.ttsEndpoint) || '/api/demos/tts';
  const langCode = (typeof CONFIG !== 'undefined' && CONFIG.lang) || 'en-US';

  try {
    const res = await fetch(ttsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: item.text, lang: langCode }),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error('tts ' + res.status);
    const blob = await res.blob();
    if (blob.size < 100) throw new Error('tts empty');
    if (item.gen !== queueGeneration) { _playNextChunk(); return; } // barged in while fetching

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentQueueAudio = audio;
    audio.onended = () => { URL.revokeObjectURL(url); currentQueueAudio = null; _playNextChunk(); };
    audio.onerror = () => { URL.revokeObjectURL(url); currentQueueAudio = null; _playNextChunk(); };
    await audio.play();
  } catch (err) {
    _dbg('chunk TTS failed, falling back to speechSynthesis for this chunk:', err && err.message);
    if (window.speechSynthesis && item.gen === queueGeneration) {
      const u = new SpeechSynthesisUtterance(item.text);
      u.rate = 1.05; u.pitch = 1.0;
      u.onend = () => _playNextChunk();
      u.onerror = () => _playNextChunk();
      try { speechSynthesis.speak(u); } catch { _playNextChunk(); }
    } else {
      _playNextChunk();
    }
  }
}

function clearAudioQueue() {
  queueGeneration++;
  audioQueue.length = 0;
  if (currentQueueAudio) { try { currentQueueAudio.pause(); } catch(e) {} currentQueueAudio = null; }
  window.speechSynthesis?.cancel();
  isPlayingQueue = false;
}

/* ═══════════════════════════════════════════
   TTS — LEGACY (full-message) PATH
   Kept for any caller still passing a complete reply.
   Internally just queues the whole text as one chunk.
═══════════════════════════════════════════ */
async function speakText(text) {
  _dbg('speakText called; voiceMode=', voiceMode);
  if (!voiceMode) return;
  speakChunk(text);
}

/* ═══════════════════════════════════════════
   VOICE UI HELPERS
═══════════════════════════════════════════ */
function resetVoiceUI() {
  const header = document.querySelector('.chat-header');
  if (header) header.classList.remove('voice-active');
  const toggleBtn = document.getElementById('voiceToggle');
  if (toggleBtn) {
    toggleBtn.classList.remove('playing');
    toggleBtn.textContent = voiceMode ? '🔊' : '🔇';
  }
}

function _persistVoiceMode() {
  try { window.localStorage?.setItem('krevio.voiceMode', voiceMode ? '1' : '0'); } catch {}
}

function toggleVoiceMode() {
  const toggleBtn = document.getElementById('voiceToggle');
  // If currently playing, treat click as stop (barge-in)
  if (toggleBtn && toggleBtn.classList.contains('playing')) {
    clearAudioQueue();
    resetVoiceUI();
    return;
  }

  voiceMode = !voiceMode;
  _persistVoiceMode();
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', voiceMode);
    toggleBtn.textContent = voiceMode ? '🔊' : '🔇';
  }

  if (voiceMode) {
    unlockAudio();
    _widgetShowToast('Voice responses ON');
  } else {
    clearAudioQueue();
    resetVoiceUI();
    _widgetShowToast('Voice responses OFF');
  }
}

function stopVoicePlayback() {
  clearAudioQueue();
  resetVoiceUI();
  if (!isRecording) {
    document.querySelector('.voice-active-panel')?.classList.remove('active');
    document.querySelector('.chat-input-wrapper')?.classList.remove('hidden');
  }
}

/* ═══════════════════════════════════════════
   STT — SPEECH RECOGNITION
═══════════════════════════════════════════ */
function initSpeechRecognition() {
  if (typeof CONFIG === 'undefined' || CONFIG.hasVoice === false) return;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  const micBtn = document.getElementById('chatMic');
  if (micBtn) micBtn.style.display = 'flex';

  recognition = new SpeechRec();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = (typeof CONFIG !== 'undefined' && CONFIG.lang) || 'en-US';

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
    document.getElementById('chatInput').value = transcript;
    clearTimeout(micSendTimer);
    const lastResult = event.results[event.results.length - 1];
    if (lastResult.isFinal) {
      warmupTTS();
      micSendTimer = setTimeout(() => {
        if (isRecording && document.getElementById('chatInput').value.trim()) {
          stopMic();
          if (typeof sendChat === 'function') sendChat();
        }
      }, 2000);
    }
  };

  recognition.onerror = (e) => { if (e.error !== 'no-speech') stopMic(); };

  recognition.onend = () => {
    if (isRecording) {
      const input = document.getElementById('chatInput').value.trim();
      if (input) {
        clearTimeout(micSendTimer);
        micSendTimer = setTimeout(() => {
          if (isRecording) { stopMic(); if (typeof sendChat === 'function') sendChat(); }
        }, 1500);
      } else stopMic();
    }
  };
}

function toggleMic() {
  if (isRecording) { stopMic(); return; }

  const toggleBtn = document.getElementById('voiceToggle');
  if (toggleBtn && toggleBtn.classList.contains('playing')) stopVoicePlayback();

  if (!recognition) return;
  isRecording = true;

  // Auto-enable voice mode when using mic
  if (!voiceMode) {
    voiceMode = true;
    _persistVoiceMode();
    unlockAudio();
    if (toggleBtn) { toggleBtn.classList.add('active'); toggleBtn.textContent = '🔊'; }
  }

  document.querySelector('.chat-input-wrapper')?.classList.add('hidden');
  document.querySelector('.voice-active-panel')?.classList.add('active');

  const micBtn = document.getElementById('chatMic');
  const label = document.getElementById('chatVoiceLabel');
  if (micBtn) micBtn.classList.add('recording');
  if (label) { label.textContent = 'Listening...'; label.style.display = 'block'; }

  try { recognition.start(); } catch(e) { stopMic(); }
}

function stopMic() {
  isRecording = false;
  clearTimeout(micSendTimer);
  const micBtn = document.getElementById('chatMic');
  const label = document.getElementById('chatVoiceLabel');
  if (micBtn) micBtn.classList.remove('recording');
  if (label) label.style.display = 'none';
  try { recognition?.stop(); } catch(e) {}

  const header = document.querySelector('.chat-header');
  if (!header || !header.classList.contains('voice-active')) {
    document.querySelector('.voice-active-panel')?.classList.remove('active');
    document.querySelector('.chat-input-wrapper')?.classList.remove('hidden');
  }
}

/* ═══════════════════════════════════════════
   TTS WARMUP — eliminates Vercel cold start
═══════════════════════════════════════════ */
function warmupTTS() {
  if (!voiceMode) return;
  const ttsEndpoint = (typeof CONFIG !== 'undefined' && CONFIG.ttsEndpoint) || '/api/demos/tts';
  fetch(ttsEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hi', lang: 'en-US' }),
    signal: AbortSignal.timeout(6000)
  }).catch(() => {});
  _dbg('Warmup fired');
}

/* ═══════════════════════════════════════════
   INIT — runs on DOMContentLoaded
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Reflect persisted voice state on the toggle button
  const toggleBtn = document.getElementById('voiceToggle');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', voiceMode);
    toggleBtn.textContent = voiceMode ? '🔊' : '🔇';
  }

  // Unlock audio on first user interaction (any click/touch anywhere)
  const unlockOnce = () => { unlockAudio(); document.removeEventListener('click', unlockOnce); document.removeEventListener('touchstart', unlockOnce); };
  document.addEventListener('click', unlockOnce);
  document.addEventListener('touchstart', unlockOnce);

  // Initialize STT
  initSpeechRecognition();

  // Pre-warm TTS on page load (fire-and-forget, silent)
  warmupTTS();

  // Hook warmup into submit gestures
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && voiceMode) {
      const chatInput = document.getElementById('chatInput');
      if (chatInput && document.activeElement === chatInput) warmupTTS();
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (voiceMode && e.target.closest('.chat-send-btn, .chat-send, #chatSend')) warmupTTS();
  }, true);

  // Preload browser voices as fallback
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
});
