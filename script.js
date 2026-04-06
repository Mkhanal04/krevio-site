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

// ─── Inquiry Form ─────────────────────────────────────────────────────────────
const form = document.getElementById('inquiry-form');
const formWrap = document.getElementById('inquiry-form-wrap');
const successEl = document.getElementById('form-success');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors
    document.querySelectorAll('.form-error').forEach((el) => el.classList.remove('visible'));

    const nameVal = form.name.value.trim();
    const emailVal = form.email.value.trim();
    const industryVal = form.industry.value;

    // Client-side validation
    let hasError = false;
    if (!nameVal) {
      document.getElementById('name-error')?.classList.add('visible');
      hasError = true;
    }
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      document.getElementById('email-error')?.classList.add('visible');
      hasError = true;
    }
    if (!industryVal) {
      document.getElementById('industry-error')?.classList.add('visible');
      hasError = true;
    }
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
        // Show a general error near the submit button
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
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });
