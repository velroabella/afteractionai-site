/* ══════════════════════════════════════════════════════════
   AIOS — Quick-Trigger Chips  (Phase 14)
   Wires the chip tray buttons into the existing text-chat
   send flow without touching app.js.

   Strategy:
   - Text chips set userInput.value + click btnSend
     → flows through sendTextMessage() → sendToAI() as normal
   - Upload chip clicks fileInput directly
     → flows through existing file-upload handler in app.js
   - Chips tray hides after first chip click OR first manual send
     → session-scoped; refreshing the page resets it

   No parallel logic, no duplicate routing, no voice changes.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var _hidden = false;

  function _el(id) { return document.getElementById(id); }

  /* ── Hide the entire chip tray ──────────────────────── */
  function hide() {
    if (_hidden) return;
    var tray = _el('aiosChips');
    if (tray) {
      tray.style.display = 'none';
      _hidden = true;
    }
  }

  /* ── Send a text chip through the existing send flow ── */
  function send(text) {
    var input   = _el('userInput');
    var sendBtn = _el('btnSend');
    if (!input || !sendBtn) return;

    hide();

    // Populate the textarea and fire an 'input' event so
    // app.js auto-resize listener updates the height correctly.
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Delegate entirely to the existing sendTextMessage() path.
    sendBtn.click();
  }

  /* ── Trigger file upload dialog ─────────────────────── */
  function upload() {
    var fileInput = _el('fileInput');
    if (!fileInput) return;
    hide();
    fileInput.click();
  }

  /* ── Auto-hide on manual send ───────────────────────── */
  // Watches for the user pressing Send or Enter themselves,
  // so the tray disappears after their first typed message.
  function _watchManualSend() {
    var sendBtn = _el('btnSend');
    var input   = _el('userInput');

    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        if (input && input.value.trim().length > 0) hide();
      });
    }

    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey && input.value.trim().length > 0) {
          hide();
        }
      });
    }
  }

  function _init() {
    _watchManualSend();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ── Public API ─────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.Chips = { send: send, upload: upload, hide: hide };

})();
