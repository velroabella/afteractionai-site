/* ============================================================
   PHASE 3.5 — Legal Form Integration Layer
   Wires: acknowledgment gate + docx generator + existing system
   Depends on:
     - js/legal-acknowledgment.js  (AAAI.legal)
     - js/legal-docx-generator.js  (AAAI.legalDocx)
     - js/action-engine.js         (AAAI.actions — existing)
     - js/app.js                   (existing)
   ============================================================ */

(function () {
  'use strict';

  /* ---------- MAPPING: action-engine keys → docx form types ---------- */

  const ENGINE_TO_FORM = {
    /* action-engine flow IDs (from ISSUE_TO_TEMPLATES) */
    'general-power-of-attorney':  'general-power-of-attorney',
    'durable-power-of-attorney':  'durable-power-of-attorney',
    'medical-power-of-attorney':  'medical-power-of-attorney',
    'living-will':                'living-will',
    'last-will-and-testament':    'last-will-and-testament',
    'hipaa-authorization-form':   'hipaa-authorization-form',

    /* action-engine engine IDs */
    'poa':        'general-power-of-attorney',
    'will':       'last-will-and-testament',
    'living_will':'living-will',
    'hipaa_auth': 'hipaa-authorization-form'
  };

  /* ---------- CONTENT-BASED DETECTION ---------- */

  /**
   * Detects legal form type from AI-generated report text.
   * Used at the PDF download button click handler in app.js
   * where only reportText is available (no template ID).
   */
  const CONTENT_PATTERNS = [
    { pattern: /general\s+power\s+of\s+attorney/i,          formType: 'general-power-of-attorney' },
    { pattern: /durable\s+power\s+of\s+attorney/i,          formType: 'durable-power-of-attorney' },
    { pattern: /medical\s+power\s+of\s+attorney/i,          formType: 'medical-power-of-attorney' },
    { pattern: /health\s*care\s+(power|proxy|agent)/i,       formType: 'medical-power-of-attorney' },
    { pattern: /living\s+will|advance\s+directive/i,         formType: 'living-will' },
    { pattern: /last\s+will\s+and\s+testament/i,             formType: 'last-will-and-testament' },
    { pattern: /hipaa\s+authorization/i,                     formType: 'hipaa-authorization-form' },
    { pattern: /release\s+of\s+health\s+information/i,       formType: 'hipaa-authorization-form' },
  ];

  /**
   * Scans reportText for legal form patterns.
   * Returns the matching formType string, or null if not a legal form.
   */
  function detectLegalFormType(reportText) {
    if (!reportText || typeof reportText !== 'string') return null;
    for (var i = 0; i < CONTENT_PATTERNS.length; i++) {
      if (CONTENT_PATTERNS[i].pattern.test(reportText)) {
        return CONTENT_PATTERNS[i].formType;
      }
    }
    return null;
  }

  /**
   * ONE-LINE INTEGRATION for app.js PDF button handler.
   *
   * Returns true if legal form was detected and handled (caller should skip PDF).
   * Returns false if not a legal form (caller should proceed with PDF).
   *
   * Usage in app.js:
   *   pdfBtn.addEventListener('click', function() {
   *     if (AAAI.legalIntegration.detectAndHandle(reportText)) return;
   *     generateReportPDF(reportText);
   *   });
   */
  function detectAndHandle(reportText) {
    var formType = detectLegalFormType(reportText);
    if (!formType) return false;

    handleLegalGeneration(formType);
    return true;
  }

  /* ---------- TEMPLATE-ID BASED DETECTION ---------- */

  function isLegalTemplate(templateId) {
    if (!templateId) return false;
    const normalized = templateId.toLowerCase().replace(/[\s]+/g, '-');
    return normalized in ENGINE_TO_FORM;
  }

  function handleLegalGeneration(templateId, userData) {
    const normalized = templateId.toLowerCase().replace(/[\s]+/g, '-');
    // Accept both template IDs (mapped via ENGINE_TO_FORM) and direct form type strings
    const formType = ENGINE_TO_FORM[normalized] || (AAAI.legalDocx && AAAI.legalDocx.SUPPORTED_TYPES.indexOf(normalized) !== -1 ? normalized : null);

    if (!formType) {
      console.error('[LegalIntegration] Unknown template:', templateId);
      return;
    }

    // Show acknowledgment gate → on confirm → generate docx
    AAAI.legal.requireAcknowledgment(formType, async function (confirmedFormType) {
      try {
        const fileName = await AAAI.legalDocx.generate(confirmedFormType, userData);
        showSuccess(fileName, confirmedFormType);
      } catch (err) {
        console.error('[LegalIntegration] Generation failed:', err);
        showError(err.message);
      }
    });
  }

  /* ---------- UI FEEDBACK ---------- */

  function showSuccess(fileName, formType) {
    // Use existing showToast if available
    if (typeof window.showToast === 'function') {
      window.showToast('Document downloaded: ' + fileName, 'success');
    } else if (typeof AAAI.app !== 'undefined' && typeof AAAI.app.showToast === 'function') {
      AAAI.app.showToast('Document downloaded: ' + fileName, 'success');
    } else {
      // Fallback inline toast
      inlineToast('Document downloaded: ' + fileName);
    }
  }

  function showError(message) {
    if (typeof window.showToast === 'function') {
      window.showToast('Error generating document: ' + message, 'error');
    } else {
      inlineToast('Error: ' + message);
    }
  }

  function inlineToast(text) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#212529;color:#fff;padding:12px 24px;border-radius:8px;z-index:99999;' +
      'font-family:Inter,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  /* ---------- EXPOSE ON AAAI NAMESPACE ---------- */

  window.AAAI = window.AAAI || {};
  window.AAAI.legalIntegration = {
    isLegalTemplate:        isLegalTemplate,
    handleLegalGeneration:  handleLegalGeneration,
    detectLegalFormType:    detectLegalFormType,
    detectAndHandle:        detectAndHandle,
    ENGINE_TO_FORM:         ENGINE_TO_FORM,
    CONTENT_PATTERNS:       CONTENT_PATTERNS
  };

})();
