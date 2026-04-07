// ─── Scroll Reveal ───────────────────────────────────────────────────────────
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// ─── Theme Toggle ────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('krevio-theme', theme);
  // Toggle sun/moon icons
  const sun = themeToggle.querySelector('.icon-sun');
  const moon = themeToggle.querySelector('.icon-moon');
  if (sun && moon) {
    sun.style.display = theme === 'dark' ? 'none' : 'block';
    moon.style.display = theme === 'dark' ? 'block' : 'none';
  }
}
// Initialize icon state
setTheme(getTheme());
themeToggle.addEventListener('click', () => {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

// ─── Language Toggle ─────────────────────────────────────────────────────────
const langToggle = document.getElementById('lang-toggle');
let currentLang = localStorage.getItem('krevio-lang') || 'en';

// Check URL param
const urlLang = new URLSearchParams(window.location.search).get('lang');
if (urlLang === 'es' || urlLang === 'en') currentLang = urlLang;

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('krevio-lang', lang);
  document.documentElement.setAttribute('lang', lang);
  // Update toggle UI
  const spans = langToggle.querySelectorAll('span');
  spans.forEach(s => {
    s.classList.toggle('active', s.textContent.trim() === lang.toUpperCase());
  });
  // Swap text for all [data-en][data-es] elements
  document.querySelectorAll('[data-en][data-es]').forEach(el => {
    const text = el.getAttribute(`data-${lang}`);
    if (text) {
      // For elements with child HTML (like hero title with <br>), use innerHTML for simple cases
      if (el.children.length === 0 || el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'LABEL' || el.tagName === 'P' || el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'DIV') {
        el.textContent = text;
      }
    }
  });
}
applyLanguage(currentLang);
langToggle.addEventListener('click', () => {
  applyLanguage(currentLang === 'en' ? 'es' : 'en');
});

// ─── Inquiry Form ─────────────────────────────────────────────────────────────
const form = document.getElementById('inquiry-form');
const formWrap = document.getElementById('inquiry-form-wrap');
const successEl = document.getElementById('form-success');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.querySelectorAll('.form-error').forEach((el) => el.classList.remove('visible'));

    const nameVal = form.name.value.trim();
    const emailVal = form.email.value.trim();
    const industryVal = form.industry.value;

    let hasError = false;
    if (!nameVal) { document.getElementById('name-error')?.classList.add('visible'); hasError = true; }
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) { document.getElementById('email-error')?.classList.add('visible'); hasError = true; }
    if (!industryVal) { document.getElementById('industry-error')?.classList.add('visible'); hasError = true; }
    if (hasError) return;

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    const payload = {
      name: nameVal,
      email: emailVal,
      phone: form.phone.value.trim(),
      businessName: form.business.value.trim(),
      industry: industryVal,
      additionalNotes: form.message.value.trim(),
    };

    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const firstName = nameVal.split(' ')[0];
        const heading = document.getElementById('success-heading');
        if (heading) heading.textContent = `Thanks, ${firstName}! We'll reach out within 24 hours.`;
        if (formWrap) formWrap.style.display = 'none';
        if (successEl) successEl.classList.add('visible');
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = "Let's Talk →";
        alert(json.message || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Let's Talk →";
      alert('Network error. Please check your connection and try again.');
    }
  });
}

// ─── Quote Flow Stepper ──────────────────────────────────────────────────────
const quoteCta = document.getElementById('quote-cta');
const quoteStepper = document.getElementById('quote-stepper');
let quoteIndustry = '';
let quoteServices = ['Custom website', 'AI chatbot', 'Owner dashboard', 'GEO/SEO optimization', 'Communication automation'];

if (quoteCta && quoteStepper) {
  quoteCta.addEventListener('click', () => {
    quoteStepper.classList.add('active');
    quoteStepper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Step 1: Industry pills (single select)
  const industryPills = document.getElementById('quote-industry-pills');
  const nextBtn1 = document.getElementById('quote-next-1');
  industryPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.quote-pill');
    if (!pill) return;
    industryPills.querySelectorAll('.quote-pill').forEach(p => p.classList.remove('selected'));
    pill.classList.add('selected');
    quoteIndustry = pill.dataset.value;
    nextBtn1.disabled = false;
  });

  // Step 2: Service pills (multi-select, checkbox style)
  const servicePills = document.getElementById('quote-service-pills');
  servicePills.addEventListener('click', (e) => {
    const pill = e.target.closest('.quote-pill');
    if (!pill) return;
    pill.classList.toggle('selected');
    quoteServices = Array.from(servicePills.querySelectorAll('.quote-pill.selected')).map(p => p.dataset.value);
  });

  // Navigation
  function showQuoteStep(n) {
    document.querySelectorAll('.quote-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`quote-step-${n}`)?.classList.add('active');
  }
  document.getElementById('quote-next-1')?.addEventListener('click', () => showQuoteStep(2));
  document.getElementById('quote-back-2')?.addEventListener('click', () => showQuoteStep(1));
  document.getElementById('quote-next-2')?.addEventListener('click', () => showQuoteStep(3));
  document.getElementById('quote-back-3')?.addEventListener('click', () => showQuoteStep(2));

  // Submit
  document.getElementById('quote-submit')?.addEventListener('click', async () => {
    const name = document.getElementById('quote-name').value.trim();
    const email = document.getElementById('quote-email').value.trim();
    const phone = document.getElementById('quote-phone').value.trim();

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter your name and a valid email.');
      return;
    }

    const submitBtn = document.getElementById('quote-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone,
          industry: quoteIndustry,
          source: 'krevio-quote-flow',
          additionalNotes: JSON.stringify({ services: quoteServices, industry: quoteIndustry }),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const firstName = name.split(' ')[0];
        const heading = document.getElementById('quote-success-heading');
        if (heading) heading.textContent = `Thanks, ${firstName}! We'll send your custom quote within 24 hours.`;
        showQuoteStep('success');
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Get My Quote →';
        alert(json.message || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Get My Quote →';
      alert('Network error. Please try again.');
    }
  });
}

// ─── Smooth Scroll for anchor CTAs ───────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ─── Nav shadow on scroll ─────────────────────────────────────────────────────
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ─── Chat Widget ─────────────────────────────────────────────────────────────
const chatTrigger = document.getElementById('chat-trigger');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatClose = document.getElementById('chat-close');
const chatMic = document.getElementById('chat-mic');
const voiceToggle = document.getElementById('voice-toggle');
const chatVoiceLabel = document.getElementById('chat-voice-label');
const pricingChatLink = document.getElementById('pricing-chat-link');

let chatHistory = [];
let chatOpen = false;
let chatWelcomed = false;
let voiceMode = false;
let chatSessionId = 'krevio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
let chatStartTime = null;
let chatLeadCaptured = false;
let conversationLogged = false;
let idleTimer = null;

// Restore session
try {
  const saved = sessionStorage.getItem('krevio-chat');
  if (saved) {
    const parsed = JSON.parse(saved);
    chatHistory = parsed.history || [];
    chatWelcomed = parsed.welcomed || false;
  }
} catch (e) { /* ignore */ }

function saveChatSession() {
  try {
    sessionStorage.setItem('krevio-chat', JSON.stringify({
      history: chatHistory.slice(-20),
      welcomed: chatWelcomed
    }));
  } catch (e) { /* ignore */ }
}

function toggleChat() {
  chatOpen = !chatOpen;
  chatPanel.classList.toggle('open', chatOpen);
  chatTrigger.classList.toggle('open', chatOpen);
  if (chatOpen && !chatWelcomed) {
    chatWelcomed = true;
    // Restore previous messages if any
    if (chatHistory.length > 0) {
      chatHistory.forEach(msg => addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot', false));
    } else {
      const welcome = "Hey! I'm Krevio's AI assistant. I can tell you about our services, show you demos, or help you get a custom quote. What's your business about?";
      addMessage(welcome, 'bot', false);
    }
    saveChatSession();
  }
  if (chatOpen) chatInput.focus();
}

chatTrigger.addEventListener('click', toggleChat);
chatClose.addEventListener('click', toggleChat);
if (pricingChatLink) {
  pricingChatLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (!chatOpen) toggleChat();
  });
}

function addMessage(text, type, save = true) {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${type}`;
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (save && type === 'user') {
    if (!chatStartTime) chatStartTime = Date.now();
    chatHistory.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    saveChatSession();
    resetIdleTimer();
  }
  return msg;
}

function addTyping() {
  const typing = document.createElement('div');
  typing.className = 'chat-typing';
  typing.id = 'chat-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  chatMessages.appendChild(typing);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return typing;
}

function removeTyping() {
  document.getElementById('chat-typing')?.remove();
}

function addDemoCard(industry) {
  const demos = {
    landscaping: { url: 'https://milankhanal.com/demos/landscaping/', name: 'Landscaping Demo', desc: 'Booking, seasonal follow-ups, before/after gallery' },
    realestate: { url: 'https://milankhanal.com/demos/realestate/', name: 'Real Estate Demo', desc: 'Project portfolios, multi-service booking' },
    plumbing: { url: 'https://milankhanal.com/demos/plumbing/', name: 'Plumbing Demo', desc: 'Emergency routing, 24/7 service, priority booking' },
    hvac: { url: 'https://milankhanal.com/demos/hvac/', name: 'HVAC Demo', desc: 'System tracking, maintenance plans, seasonal campaigns' }
  };
  const demo = demos[industry];
  if (!demo) return;
  const card = document.createElement('a');
  card.className = 'chat-demo-card';
  card.href = demo.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.innerHTML = `<div class="card-title">${demo.name}</div><div class="card-desc">${demo.desc} → Click to explore</div>`;
  chatMessages.appendChild(card);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addLeadCard() {
  const card = document.createElement('div');
  card.className = 'chat-lead-card';
  card.id = 'chat-lead-card';
  card.innerHTML = `
    <div class="lead-label">Your Name</div>
    <input type="text" id="chat-lead-name" placeholder="Maria Garcia" autocomplete="name" />
    <div class="lead-label">Email</div>
    <input type="email" id="chat-lead-email" placeholder="maria@example.com" autocomplete="email" />
    <div class="lead-label">Industry</div>
    <select id="chat-lead-industry">
      <option value="">Select…</option>
      <option value="Landscaping">Landscaping</option>
      <option value="Real Estate">Real Estate</option>
      <option value="Plumbing">Plumbing</option>
      <option value="HVAC">HVAC</option>
      <option value="Painting">Painting</option>
      <option value="Electrical">Electrical</option>
      <option value="Roofing">Roofing</option>
      <option value="Other">Other</option>
    </select>
    <button onclick="submitChatLead()">Send →</button>
  `;
  chatMessages.appendChild(card);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.submitChatLead = async function() {
  const card = document.getElementById('chat-lead-card');
  const name = document.getElementById('chat-lead-name').value.trim();
  const email = document.getElementById('chat-lead-email').value.trim();
  const industry = document.getElementById('chat-lead-industry').value;

  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter your name and a valid email.');
    return;
  }

  const btn = card.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, industry: industry || 'Not specified', source: 'krevio-chatbot' }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      card.classList.add('submitted');
      btn.textContent = '✓ Sent';
      chatLeadCaptured = true;
      const firstName = name.split(' ')[0];
      addMessage(`Got it, ${firstName}! We'll reach out within 24 hours.`, 'bot');
      chatHistory.push({ role: 'model', content: `Got it, ${firstName}! We'll reach out within 24 hours.`, timestamp: new Date().toISOString() });
      saveChatSession();
    } else {
      btn.disabled = false;
      btn.textContent = 'Send →';
      alert(json.message || 'Something went wrong.');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Send →';
    alert('Network error. Please try again.');
  }
};

async function sendMessage(text) {
  if (!text.trim()) return;
  addMessage(text, 'user');
  chatInput.value = '';

  const typing = addTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(-20),
        sessionId: chatSessionId
      }),
    });

    removeTyping();
    const json = await res.json();
    const reply = json.reply || "Sorry, I couldn't process that. Try again?";

    const botMsg = addMessage(reply, 'bot');
    chatHistory.push({ role: 'model', content: reply, timestamp: new Date().toISOString() });
    saveChatSession();
    resetIdleTimer();

    // Handle actions
    if (json.action) {
      if (json.action === 'collect_lead') {
        addLeadCard();
      } else if (json.action.startsWith('show_demo:')) {
        const industry = json.action.split(':')[1];
        addDemoCard(industry);
      }
    }

    // Voice mode: speak the response
    if (voiceMode && window.speechSynthesis) {
      speakText(reply, botMsg);
    }
  } catch (err) {
    removeTyping();
    addMessage("I'm having trouble connecting. Please try again or use the contact form below.", 'bot');
  }
}

chatSend.addEventListener('click', () => sendMessage(chatInput.value));
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(chatInput.value);
  }
});

// ─── Voice: Text-to-Speech ───────────────────────────────────────────────────
function speakText(text, msgEl) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';

  // Prefer natural voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes('Google US English')) ||
                    voices.find(v => v.lang.startsWith('en') && v.localService) ||
                    voices[0];
  if (preferred) utterance.voice = preferred;

  if (msgEl) {
    utterance.onstart = () => msgEl.classList.add('speaking');
    utterance.onend = () => msgEl.classList.remove('speaking');
  }
  window.speechSynthesis.speak(utterance);
}

// ─── Voice: Speech-to-Text ───────────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognition) {
  chatMic.style.display = 'flex';
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        chatInput.value = transcript;
        chatInput.style.color = '';
        stopRecording();
        sendMessage(transcript);
      } else {
        chatInput.value = transcript;
        chatInput.style.color = 'var(--krevio-gray)';
      }
    }
  };

  recognition.onerror = (event) => {
    console.warn('[Voice] Recognition error:', event.error);
    stopRecording();
  };

  recognition.onend = () => {
    if (isRecording) stopRecording();
  };
}

function startRecording() {
  if (!recognition) return;
  isRecording = true;
  chatMic.classList.add('recording');
  chatVoiceLabel.textContent = 'Listening…';
  chatVoiceLabel.style.display = 'block';
  chatInput.value = '';
  recognition.start();
}

function stopRecording() {
  isRecording = false;
  chatMic.classList.remove('recording');
  chatVoiceLabel.style.display = 'none';
  chatInput.style.color = '';
  try { recognition?.stop(); } catch (e) { /* ignore */ }
}

chatMic.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Voice mode toggle
voiceToggle.addEventListener('click', () => {
  voiceMode = !voiceMode;
  voiceToggle.classList.toggle('voice-active', voiceMode);
  if (!voiceMode && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
});

// Load voices (needed for some browsers)
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ─── Conversation Logging ────────────────────────────────────────────────────
function extractSignals(messages) {
  const industries = ['landscaping', 'plumbing', 'hvac', 'real estate', 'painting', 'electrical', 'roofing'];
  const demos = ['landscaping', 'realestate', 'plumbing', 'hvac'];
  const fullText = messages.map(m => m.content).join(' ').toLowerCase();
  return {
    industryMentioned: industries.find(i => fullText.includes(i)) || null,
    demoRequested: demos.find(d => fullText.includes(d)) || null
  };
}

function chatHasUserMessages() {
  return chatHistory.some(m => m.role === 'user');
}

function logConversation() {
  if (conversationLogged) return;
  if (!chatHasUserMessages()) return;
  conversationLogged = true;
  clearTimeout(idleTimer);

  const signals = extractSignals(chatHistory);
  const payload = {
    sessionId: chatSessionId,
    messages: chatHistory,
    messageCount: chatHistory.filter(m => m.role === 'user').length,
    industryMentioned: signals.industryMentioned,
    demoRequested: signals.demoRequested,
    leadCaptured: chatLeadCaptured,
    language: localStorage.getItem('krevio-lang') || 'en',
    durationSeconds: chatStartTime ? Math.round((Date.now() - chatStartTime) / 1000) : 0
  };

  // Use sendBeacon with Blob for correct Content-Type
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  navigator.sendBeacon('/api/log-conversation', blob);
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (chatHasUserMessages()) {
      logConversation();
    }
  }, 3 * 60 * 1000); // 3 minutes idle
}

// Log on chat close
chatClose.addEventListener('click', () => {
  if (chatOpen && chatHasUserMessages()) {
    logConversation();
  }
});

// Log on page unload
window.addEventListener('beforeunload', () => {
  if (chatHasUserMessages()) {
    logConversation();
  }
});

// Reset logged flag if user sends a new message after logging
const originalSendMessage = sendMessage;
sendMessage = async function(text) {
  if (conversationLogged && text.trim()) {
    // New message after log — reset for re-logging
    conversationLogged = false;
  }
  return originalSendMessage(text);
};

// Remove pulse animation after it plays
chatTrigger.addEventListener('animationend', () => {
  chatTrigger.classList.remove('pulse');
});
