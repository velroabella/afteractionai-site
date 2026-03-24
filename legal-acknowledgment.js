/* ============================================================
   PHASE 3.5 — Legal Acknowledgment Gate + Logging
   Depends on: Supabase client (window.supabase already loaded)
   ============================================================ */

(function () {
  'use strict';

  /* ---------- CONSTANTS ---------- */

  const LEGAL_FORM_TYPES = [
    'general-power-of-attorney',
    'durable-power-of-attorney',
    'medical-power-of-attorney',
    'living-will',
    'last-will-and-testament',
    'hipaa-authorization-form'
  ];

  const ACKNOWLEDGMENT_ITEMS = [
    'I understand this is a template, not legal advice.',
    'I understand this document may not be legally valid without professional review.',
    'I am responsible for reviewing and modifying this document before use.',
    'I understand laws vary by state and this template may not meet my state\'s requirements.'
  ];

  /* ---------- STATE ---------- */

  let _pendingCallback = null;   // function to call after acknowledgment
  let _pendingFormType = null;   // which form is being generated

  /* ---------- DOM CREATION ---------- */

  function createModal() {
    if (document.getElementById('legalAckModal')) return;

    const modal = document.createElement('div');
    modal.id = 'legalAckModal';
    modal.className = 'legal-modal';
    modal.innerHTML = `
      <div class="legal-modal__box">
        <button class="legal-modal__close" aria-label="Close">&times;</button>

        <div class="legal-modal__header">
          <div class="legal-modal__icon">&#9878;</div>
          <h2 class="legal-modal__title">Important Notice</h2>
          <p class="legal-modal__subtitle">Please read and acknowledge before continuing</p>
        </div>

        <div class="legal-modal__notice">
          <strong>&#9888; Template Disclaimer</strong>
          This tool generates document templates for informational purposes only.
          It does not provide legal advice. Generated documents may not meet the
          legal requirements of your state or jurisdiction. Always consult a
          qualified attorney before using any legal document.
        </div>

        <div class="legal-modal__checks" id="legalChecks">
          ${ACKNOWLEDGMENT_ITEMS.map((text, i) => `
            <label class="legal-modal__check">
              <input type="checkbox" id="legalCheck${i}" data-index="${i}">
              <span>${text}</span>
            </label>
          `).join('')}
        </div>

        <div class="legal-modal__actions">
          <button class="legal-modal__btn legal-modal__btn--cancel" id="legalCancelBtn">Cancel</button>
          <button class="legal-modal__btn legal-modal__btn--continue" id="legalContinueBtn" disabled>
            Continue &rarr;
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    bindEvents(modal);
  }

  /* ---------- EVENT BINDING ---------- */

  function bindEvents(modal) {
    modal.querySelector('.legal-modal__close').addEventListener('click', closeModal);
    document.getElementById('legalCancelBtn').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });
    modal.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', updateContinueState);
    });
    document.getElementById('legalContinueBtn').addEventListener('click', handleContinue);
  }

  function openModal(formType, callback) {
    createModal();
    _pendingFormType = formType;
    _pendingCallback = callback;
    const modal = document.getElementById('legalAckModal');
    modal.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
    document.getElementById('legalContinueBtn').disabled = true;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modal = document.getElementById('legalAckModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
    _pendingCallback = null;
    _pendingFormType = null;
  }

  function updateContinueState() {
    const boxes = document.querySelectorAll('#legalChecks input[type="checkbox"]');
    const allChecked = Array.from(boxes).every(function (cb) { return cb.checked; });
    document.getElementById('legalContinueBtn').disabled = !allChecked;
  }

  async function handleContinue() {
    const btn = document.getElementById('legalContinueBtn');
    btn.disabled = true;
    btn.textContent = 'Logging…';
    try { await logAcknowledgment(_pendingFormType); } catch (err) { console.warn('[LegalAck] Logging failed:', err.message); }
    btn.textContent = 'Continue →';
    closeModal();
    if (typeof _pendingCallback === 'function') { _pendingCallback(_pendingFormType); }
  }

  async function logAcknowledgment(formType) {
    const sb = window.AAAI && window.AAAI.supabase;
    if (!sb) { console.warn('[LegalAck] Supabase client not available'); return; }
    let userId = null;
    try { const { data } = await sb.auth.getUser(); userId = data && data.user ? data.user.id : null; } catch (_) {}
    const record = { user_id: userId, form_type: formType, acknowledgment: true, acknowledged_at: new Date().toISOString(), items_accepted: ACKNOWLEDGMENT_ITEMS };
    const { error } = await sb.from('legal_acknowledgments').insert([record]);
    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        await sb.from('template_outputs').insert([{ user_id: userId, form_type: formType, output: JSON.stringify({ acknowledgment: true, items: ACKNOWLEDGMENT_ITEMS }), meta: 'legal_acknowledgment_log', created_at: new Date().toISOString() }]);
      } else { throw error; }
    }
  }

  function isLegalForm(formType) {
    if (!formType) return false;
    return LEGAL_FORM_TYPES.includes(formType.toLowerCase().replace(/[\s_]+/g, '-'));
  }

  function requireAcknowledgment(formType, callback) {
    if (isLegalForm(formType)) { openModal(formType, callback); }
    else { if (typeof callback === 'function') callback(formType); }
  }

  window.AAAI = window.AAAI || {};
  window.AAAI.legal = { requireAcknowledgment, isLegalForm, LEGAL_FORM_TYPES, _openModal: openModal, _closeModal: closeModal, _logAcknowledgment: logAcknowledgment };

})();
