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

/* ═══════════════════════════════════════════
   AUTOPLAY UNLOCK
   Browsers require a user gesture before Audio.play().
   We attach a one-time listener on the FIRST click/touch
   anywhere on the page to play a silent snippet.
═══════════════════════════════════════════ */
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  console.log('[TTS] Unlocking audio element via user gesture...');
  ttsAudio.src = 'data:audio/mpeg;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  ttsAudio.play().then(() => {
    console.log('[TTS] Audio unlocked successfully.');
  }).catch(e => {
    console.log('[TTS] Unlock play promise caught:', e.message);
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
   TTS — CLOUD FIRST, BROWSER FALLBACK
═══════════════════════════════════════════ */
async function speakText(text) {
  console.log('[TTS] speakText called. Voice Mode:', voiceMode);
  if (!voiceMode) return;

  // Stop any current playback
  if (ttsAudio) { try { ttsAudio.pause(); } catch(e) {} }
  window.speechSynthesis?.cancel();

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
    console.log('[TTS] Fetching from', ttsEndpoint);
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
    console.log('[TTS] Cloud playback started.');
  } catch (err) {
    console.error('[TTS] Cloud TTS failed:', err);
    const statusEl = document.querySelector('.chat-header-status-text');
    if (statusEl && statusEl.dataset._orig) statusEl.textContent = statusEl.dataset._orig;
    resetVoiceUI();

    // Fallback to browser TTS with user notification
    if (!window.speechSynthesis) return;
    _widgetShowToast('Using basic voice \u2014 check connection');
    console.log('[TTS] Falling back to browser speechSynthesis...');
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.05; u.pitch = 1.0;
    const voices = speechSynthesis.getVoices();
    const preferred = ['Samantha', 'Google US English', 'Microsoft Aria'];
    for (const name of preferred) {
      const v = voices.find(x => x.name.includes(name));
      if (v) { u.voice = v; break; }
    }
    speechSynthesis.speak(u);
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
  console.log('[TTS] Warmup fired.');
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

  // Preload browser voices as fallback
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
});
