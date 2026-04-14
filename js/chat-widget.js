// js/chat-widget.js
// Centralized voice & chat UI logic for all Krevio pages.
// Each page provides a CONFIG object; this widget handles TTS, STT, and voice UI.

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let voiceMode = false;
let recognition = null;
let isRecording = false;
let micSendTimer = null;
let ttsAudio = new Audio();
let audioUnlocked = false;
let ttsFailCount = 0;        // consecutive Cloud TTS failures — circuit breaker
const TTS_FAIL_THRESHOLD = 3; // auto-disable voice after this many consecutive failures

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
   Shows a brief non-blocking message. Pages may
   define their own showToast(); we only define a
   fallback if none exists.
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
   ─────────────────────────────────────────
   TTS latency scales with character count.
   Speaking only the first 1–2 sentences keeps
   synthesis under ~1s. The user reads the rest
   in the chat bubble. Hard cap at 160 chars as
   a safety net — even if sentence detection
   fails, the TTS call stays fast.
═══════════════════════════════════════════ */
const TTS_CHAR_CAP = 280; // 250–280 is the industry sweet spot for <1s TTS latency

function cleanForSpeech(text) {
  const stripped = text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[✓✅⚠↔●○🏠🔑📊★·→←]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Extract first 1–2 sentences. Split on sentence-ending punctuation
  // followed by a space or end-of-string, but NOT on abbreviations
  // like "Dr." or "St." (single uppercase letter + period).
  const sentences = stripped.match(/[^.!?]*(?:[.!?](?:\s|$))/g);
  if (sentences && sentences.length) {
    let spoken = sentences[0].trim();
    for (let i = 1; i < sentences.length; i++) {
      const next = sentences[i].trim();
      if (spoken.length + 1 + next.length > TTS_CHAR_CAP) break;
      spoken += ' ' + next;
    }
    return spoken;
  }

  // No sentence boundary found — take the whole thing, capped
  return stripped.slice(0, TTS_CHAR_CAP);
}

/* ═══════════════════════════════════════════
   TTS — CLOUD ONLY, NO BROWSER FALLBACK
   ─────────────────────────────────────────
   "Really bad" = Cloud TTS is persistently broken
   (invalid key, API disabled, quota exhausted, or
   network down). The circuit breaker auto-disables
   voice after TTS_FAIL_THRESHOLD consecutive failures
   so the user isn't stuck tapping a broken button.
   A single success resets the counter.
   Browser speechSynthesis is NEVER used — its robotic
   output is worse than silence for a product demo.
═══════════════════════════════════════════ */
async function speakText(text) {
  _dbg('speakText called; voiceMode=', voiceMode);
  if (!voiceMode) return;

  // Stop any current playback
  if (ttsAudio) { try { ttsAudio.pause(); } catch(e) {} }

  const clean = cleanForSpeech(text);
  if (!clean) return;

  // UI: show voice-active state
  const header = document.querySelector('.chat-header');
  if (header) header.classList.add('voice-active');
  const toggleBtn = document.getElementById('voiceToggle');
  if (toggleBtn) { toggleBtn.classList.add('playing'); toggleBtn.textContent = '■'; }

  const ttsEndpoint = (typeof CONFIG !== 'undefined' && CONFIG.ttsEndpoint) || '/api/demos/tts';
  const langCode = (typeof CONFIG !== 'undefined' && CONFIG.lang) || 'en-US';

  try {
    _dbg('Fetching from', ttsEndpoint);
    const statusEl = document.querySelector('.chat-header-status-text');
    if (statusEl) { statusEl.dataset._orig = statusEl.textContent; statusEl.textContent = 'Getting response\u2026'; }

    const res = await fetch(ttsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, lang: langCode }),
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) throw new Error('tts-api-error: ' + res.status);

    const blob = await res.blob();
    if (blob.size < 100) throw new Error('tts-api-error: empty or malformed audio');

    const url = URL.createObjectURL(blob);
    ttsAudio.src = url;
    ttsAudio.onended = () => { URL.revokeObjectURL(url); resetVoiceUI(); };

    if (statusEl) statusEl.textContent = statusEl.dataset._orig || '';

    await ttsAudio.play();
    ttsFailCount = 0; // success — reset circuit breaker
    _dbg('Cloud playback started');
  } catch (err) {
    _dbg('Cloud TTS failed:', err && err.message);
    const statusEl = document.querySelector('.chat-header-status-text');
    if (statusEl && statusEl.dataset._orig) statusEl.textContent = statusEl.dataset._orig;
    resetVoiceUI();

    ttsFailCount++;
    _dbg('TTS fail count:', ttsFailCount, '/', TTS_FAIL_THRESHOLD);

    if (ttsFailCount >= TTS_FAIL_THRESHOLD) {
      // Circuit breaker tripped — auto-disable voice mode
      voiceMode = false;
      ttsFailCount = 0;
      const btn = document.getElementById('voiceToggle');
      if (btn) { btn.classList.remove('active'); btn.textContent = '🔇'; }
      _widgetShowToast('Voice turned off \u2014 service issue');
      _dbg('Circuit breaker tripped — voice auto-disabled');
    } else {
      _widgetShowToast('Voice unavailable right now');
    }
    // NO browser speechSynthesis fallback — silence is better than robotic
  }
}

/* ═══════════════════════════════════════════
   VOICE UI HELPERS
═══════════════════════════════════════════ */
function resetVoiceUI() {
  const header = document.querySelector('.chat-header');
  if (header) header.classList.remove('voice-active');
  const toggleBtn = document.getElementById('voiceToggle');
  if (toggleBtn) { toggleBtn.classList.remove('playing'); toggleBtn.textContent = '🔊'; }
}

function toggleVoiceMode() {
  const toggleBtn = document.getElementById('voiceToggle');
  // If currently playing, treat click as stop
  if (toggleBtn && toggleBtn.classList.contains('playing')) {
    if (ttsAudio) { try { ttsAudio.pause(); } catch(e) {} }
    window.speechSynthesis?.cancel();
    resetVoiceUI();
    return;
  }

  voiceMode = !voiceMode;
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', voiceMode);
    toggleBtn.textContent = voiceMode ? '🔊' : '🔇';
  }

  if (voiceMode) {
    unlockAudio();
    warmupTTS(); // fire immediately so the function is warm before the first reply
    _widgetShowToast('Voice responses ON');
  } else {
    if (ttsAudio) { try { ttsAudio.pause(); } catch(e) {} }
    window.speechSynthesis?.cancel();
    resetVoiceUI();
    _widgetShowToast('Voice responses OFF');
  }
}

function stopVoicePlayback() {
  if (ttsAudio) { try { ttsAudio.pause(); } catch(e) {} }
  window.speechSynthesis?.cancel();
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
    unlockAudio();
    warmupTTS(); // warm the function before the mic response arrives
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

  // Browser speechSynthesis is NOT used for TTS playback (robotic voice
  // is worse than silence). The cancel() calls elsewhere are defensive
  // cleanup only — they stop any stale utterance from a previous session.
});
