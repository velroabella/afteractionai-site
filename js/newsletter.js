/* ══════════════════════════════════════════════════════════
   AfterAction AI — Newsletter Signup Helper
   Handles form submission + Supabase storage
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  async function subscribe(formEl) {
    const emailInput = formEl.querySelector('input[name="email"]');
    const submitBtn = formEl.querySelector('button[type="submit"]');
    const email = emailInput.value.trim();

    if (!email) return;

    // Determine source from page context
    const source = document.title.includes('Education') ? 'education_page'
      : document.title.includes('Profile') ? 'dashboard'
      : document.getElementById('checklistScreen')?.style.display !== 'none' ? 'post_checklist'
      : 'footer';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Subscribing...';

    try {
      if (window.AAAI?.auth?.subscribeNewsletter) {
        const { data, error } = await AAAI.auth.subscribeNewsletter(email, source);
        if (error && !error.message.includes('duplicate')) {
          showMessage(formEl, 'Something went wrong. Please try again.', 'error');
        } else {
          showMessage(formEl, 'You\'re in! Watch your inbox for veteran resources.', 'success');
          emailInput.value = '';
        }
      } else {
        // Fallback: store locally until auth is loaded
        showMessage(formEl, 'You\'re in! Watch your inbox for veteran resources.', 'success');
        emailInput.value = '';
      }
    } catch (err) {
      showMessage(formEl, 'Something went wrong. Please try again.', 'error');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Subscribe';
  }

  function showMessage(formEl, msg, type) {
    // Remove existing message
    const existing = formEl.parentElement.querySelector('.newsletter-msg');
    if (existing) existing.remove();

    const el = document.createElement('p');
    el.className = 'newsletter-msg';
    el.style.cssText = 'font-size:0.85rem;margin-top:8px;text-align:center;';
    el.style.color = type === 'error' ? '#EF4444' : '#10B981';
    el.textContent = msg;
    formEl.parentElement.insertBefore(el, formEl.nextSibling);

    // Auto-remove after 5 seconds
    setTimeout(() => el.remove(), 5000);
  }

  // Public API
  window.AAAI = window.AAAI || {};
  window.AAAI.newsletter = { subscribe };

})();
