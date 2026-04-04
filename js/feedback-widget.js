/* ══════════════════════════════════════════════════════════
   AfterAction AI — Feedback Widget
   Self-contained: injects its own HTML + CSS into the page.
   Saves to Supabase table "feedback" + storage "feedback_screenshots".
   Works for both authenticated and anonymous users.
   ══════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  // Supabase config — same public anon key used everywhere
  var SUPABASE_URL  = 'https://gdnnoehxezkrihrcqosr.supabase.co';
  var SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdkbm5vZWh4ZXprcmlocmNxb3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5NjMsImV4cCI6MjA4OTUxOTk2M30.jHVUOd5ZijF_Y9PlVrYuWAmWEN3PUgXY6SfX8lJZqXg';
  var BUCKET        = 'feedback_screenshots';
  var MAX_FILES     = 5;
  var MAX_FILE_MB   = 5;

  var _db = null;
  function getDb() {
    if (_db) return _db;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return _db;
  }

  // ── Inject CSS ──────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    /* Floating button */
    '#aaai-feedback-btn{',
      'position:fixed;bottom:24px;right:24px;z-index:9999;',
      'background:linear-gradient(135deg,#1a365d 0%,#2a4a7f 100%);',
      'color:#fff;border:2px solid #c6a135;border-radius:12px;',
      'padding:12px 20px;font-size:0.95rem;font-weight:600;',
      'cursor:pointer;display:flex;align-items:center;gap:8px;',
      'box-shadow:0 4px 16px rgba(0,0,0,0.3);',
      'transition:transform 0.15s,box-shadow 0.15s;',
      'font-family:inherit;line-height:1.2;',
    '}',
    '#aaai-feedback-btn:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,0,0,0.4);}',
    '#aaai-feedback-btn svg{flex-shrink:0;}',

    /* Modal overlay */
    '#aaai-fb-overlay{',
      'position:fixed;inset:0;z-index:10000;',
      'background:rgba(0,0,0,0.6);',
      'display:none;align-items:center;justify-content:center;',
      'padding:16px;',
    '}',
    '#aaai-fb-overlay.active{display:flex;}',

    /* Modal */
    '#aaai-fb-modal{',
      'background:#fff;border-radius:12px;width:100%;max-width:520px;',
      'max-height:90vh;overflow-y:auto;',
      'box-shadow:0 12px 48px rgba(0,0,0,0.4);',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    '}',
    '#aaai-fb-modal *{box-sizing:border-box;}',

    /* Header */
    '.aaai-fb-header{',
      'background:linear-gradient(135deg,#1a365d 0%,#2a4a7f 100%);',
      'color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;',
      'display:flex;align-items:center;justify-content:space-between;',
    '}',
    '.aaai-fb-header h3{margin:0;font-size:1.1rem;font-weight:700;}',
    '.aaai-fb-close{',
      'background:none;border:none;color:#fff;font-size:1.5rem;',
      'cursor:pointer;padding:0 4px;line-height:1;opacity:0.8;',
    '}',
    '.aaai-fb-close:hover{opacity:1;}',

    /* Body */
    '.aaai-fb-body{padding:20px;}',

    /* Category */
    '.aaai-fb-label{',
      'display:block;font-size:0.85rem;font-weight:600;color:#374151;',
      'margin-bottom:6px;',
    '}',
    '#aaai-fb-category{',
      'width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;',
      'font-size:0.95rem;margin-bottom:16px;background:#fff;',
      'color:#1f2937;appearance:auto;',
    '}',

    /* Textarea */
    '#aaai-fb-message{',
      'width:100%;min-height:120px;padding:12px;',
      'border:1px solid #d1d5db;border-radius:8px;',
      'font-size:0.95rem;font-family:inherit;resize:vertical;',
      'margin-bottom:16px;color:#1f2937;',
    '}',
    '#aaai-fb-message:focus,#aaai-fb-category:focus{',
      'outline:none;border-color:#2a4a7f;box-shadow:0 0 0 3px rgba(42,74,127,0.15);',
    '}',
    '#aaai-fb-message::placeholder{color:#9ca3af;}',

    /* Drop zone */
    '.aaai-fb-dropzone{',
      'border:2px dashed #d1d5db;border-radius:8px;padding:20px;',
      'text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s;',
      'margin-bottom:16px;',
    '}',
    '.aaai-fb-dropzone.dragover{border-color:#2a4a7f;background:rgba(42,74,127,0.05);}',
    '.aaai-fb-dropzone p{margin:0 0 8px;color:#6b7280;font-size:0.9rem;}',
    '.aaai-fb-dropzone-btn{',
      'display:inline-block;background:#f3f4f6;color:#374151;',
      'padding:8px 16px;border-radius:6px;font-size:0.85rem;font-weight:600;',
      'border:1px solid #d1d5db;cursor:pointer;',
    '}',
    '.aaai-fb-dropzone-btn:hover{background:#e5e7eb;}',

    /* Thumbnails */
    '.aaai-fb-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;}',
    '.aaai-fb-thumb{',
      'position:relative;width:72px;height:72px;border-radius:6px;overflow:hidden;',
      'border:1px solid #d1d5db;',
    '}',
    '.aaai-fb-thumb img{width:100%;height:100%;object-fit:cover;}',
    '.aaai-fb-thumb-rm{',
      'position:absolute;top:2px;right:2px;width:20px;height:20px;',
      'background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;',
      'font-size:12px;line-height:20px;text-align:center;cursor:pointer;padding:0;',
    '}',

    /* Submit */
    '#aaai-fb-submit{',
      'width:100%;padding:12px;background:linear-gradient(135deg,#1a365d,#2a4a7f);',
      'color:#fff;border:2px solid #c6a135;border-radius:8px;',
      'font-size:1rem;font-weight:700;cursor:pointer;',
      'transition:opacity 0.2s;',
    '}',
    '#aaai-fb-submit:hover{opacity:0.9;}',
    '#aaai-fb-submit:disabled{opacity:0.5;cursor:not-allowed;}',

    /* Thank you */
    '.aaai-fb-thanks{text-align:center;padding:40px 20px;}',
    '.aaai-fb-thanks svg{margin-bottom:12px;}',
    '.aaai-fb-thanks h3{color:#1a365d;margin:0 0 8px;font-size:1.2rem;}',
    '.aaai-fb-thanks p{color:#6b7280;margin:0 0 20px;font-size:0.95rem;}',
    '.aaai-fb-thanks button{',
      'background:#f3f4f6;color:#374151;border:1px solid #d1d5db;',
      'padding:10px 24px;border-radius:8px;font-size:0.95rem;',
      'font-weight:600;cursor:pointer;',
    '}',

    /* Error */
    '.aaai-fb-error{color:#dc2626;font-size:0.85rem;margin-bottom:12px;display:none;}',

    /* Hide on chat screen to avoid overlapping voice controls */
    '.chat-active #aaai-feedback-btn{display:none;}'
  ].join('\n');
  document.head.appendChild(css);

  // ── Inject HTML ─────────────────────────────────────────
  var wrapper = document.createElement('div');
  wrapper.innerHTML =
    // Floating button
    '<button id="aaai-feedback-btn" type="button" aria-label="Give Feedback">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>' +
      'Report Issue or Suggestion' +
    '</button>' +

    // Modal overlay
    '<div id="aaai-fb-overlay" role="dialog" aria-modal="true" aria-label="Feedback form">' +
      '<div id="aaai-fb-modal">' +
        '<div class="aaai-fb-header">' +
          '<h3>Report Issue or Suggestion</h3>' +
          '<button class="aaai-fb-close" aria-label="Close" type="button">&times;</button>' +
        '</div>' +
        '<div class="aaai-fb-body" id="aaai-fb-form-body">' +
          '<label class="aaai-fb-label" for="aaai-fb-category">Category</label>' +
          '<select id="aaai-fb-category">' +
            '<option value="bug">Bug / Something Broken</option>' +
            '<option value="suggestion">Suggestion / Feature Request</option>' +
            '<option value="va_claim">VA Claim Issue</option>' +
            '<option value="usability">Hard to Use / Confusing</option>' +
            '<option value="other">Other</option>' +
          '</select>' +
          '<label class="aaai-fb-label" for="aaai-fb-message">Describe the issue or suggestion</label>' +
          '<textarea id="aaai-fb-message" placeholder="Tell us what happened or what you\'d like to see improved..."></textarea>' +
          '<div class="aaai-fb-dropzone" id="aaai-fb-dropzone">' +
            '<p>Drag &amp; drop screenshots here, or:</p>' +
            '<span class="aaai-fb-dropzone-btn">Choose Files</span>' +
            '<input type="file" id="aaai-fb-fileinput" accept="image/*" multiple hidden>' +
          '</div>' +
          '<div class="aaai-fb-thumbs" id="aaai-fb-thumbs"></div>' +
          '<div class="aaai-fb-error" id="aaai-fb-error"></div>' +
          '<button id="aaai-fb-submit" type="button">Submit Feedback</button>' +
        '</div>' +
        '<div class="aaai-fb-thanks" id="aaai-fb-thanks" style="display:none;">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
          '<h3>Thank you!</h3>' +
          '<p>Your feedback has been received. We review every submission.</p>' +
          '<button type="button" id="aaai-fb-done">Close</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Append when DOM is ready
  function mount() {
    document.body.appendChild(wrapper);
    init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // ── State ───────────────────────────────────────────────
  var _files = []; // Array of { file, url }

  // ── Init ────────────────────────────────────────────────
  function init() {
    var btn       = document.getElementById('aaai-feedback-btn');
    var overlay   = document.getElementById('aaai-fb-overlay');
    var closeBtn  = overlay.querySelector('.aaai-fb-close');
    var dropzone  = document.getElementById('aaai-fb-dropzone');
    var fileInput = document.getElementById('aaai-fb-fileinput');
    var thumbs    = document.getElementById('aaai-fb-thumbs');
    var submitBtn = document.getElementById('aaai-fb-submit');
    var doneBtn   = document.getElementById('aaai-fb-done');
    var errEl     = document.getElementById('aaai-fb-error');

    // Open
    btn.addEventListener('click', function() {
      overlay.classList.add('active');
      document.getElementById('aaai-fb-form-body').style.display = '';
      document.getElementById('aaai-fb-thanks').style.display = 'none';
      errEl.style.display = 'none';
    });

    // Close
    function close() {
      overlay.classList.remove('active');
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.classList.contains('active')) close();
    });

    // Done (thank-you screen)
    doneBtn.addEventListener('click', function() {
      close();
      resetForm();
    });

    // Dropzone click → file input
    dropzone.addEventListener('click', function() { fileInput.click(); });

    // Drag & drop
    dropzone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function() {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      addFiles(e.dataTransfer.files);
    });

    // File input change
    fileInput.addEventListener('change', function() {
      addFiles(fileInput.files);
      fileInput.value = '';
    });

    // Add files with validation
    function addFiles(fileList) {
      for (var i = 0; i < fileList.length; i++) {
        if (_files.length >= MAX_FILES) {
          showError('Maximum ' + MAX_FILES + ' files allowed.');
          break;
        }
        var f = fileList[i];
        if (!f.type.startsWith('image/')) {
          showError(f.name + ' is not an image file.');
          continue;
        }
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
          showError(f.name + ' exceeds ' + MAX_FILE_MB + 'MB limit.');
          continue;
        }
        _files.push({ file: f, url: URL.createObjectURL(f) });
      }
      renderThumbs();
    }

    function renderThumbs() {
      thumbs.innerHTML = '';
      _files.forEach(function(item, idx) {
        var div = document.createElement('div');
        div.className = 'aaai-fb-thumb';
        div.innerHTML =
          '<img src="' + item.url + '" alt="Screenshot ' + (idx + 1) + '">' +
          '<button class="aaai-fb-thumb-rm" type="button" data-idx="' + idx + '" aria-label="Remove">&times;</button>';
        div.querySelector('.aaai-fb-thumb-rm').addEventListener('click', function() {
          URL.revokeObjectURL(_files[idx].url);
          _files.splice(idx, 1);
          renderThumbs();
        });
        thumbs.appendChild(div);
      });
    }

    function showError(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      setTimeout(function() { errEl.style.display = 'none'; }, 5000);
    }

    function resetForm() {
      document.getElementById('aaai-fb-message').value = '';
      document.getElementById('aaai-fb-category').selectedIndex = 0;
      _files.forEach(function(f) { URL.revokeObjectURL(f.url); });
      _files = [];
      renderThumbs();
      errEl.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Feedback';
    }

    // Submit
    submitBtn.addEventListener('click', async function() {
      var message = document.getElementById('aaai-fb-message').value.trim();
      if (!message) {
        showError('Please describe the issue or suggestion.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      errEl.style.display = 'none';

      try {
        var db = getDb();
        if (!db) throw new Error('Supabase not available');

        // Upload screenshots
        var screenshotPaths = [];
        for (var i = 0; i < _files.length; i++) {
          var f = _files[i].file;
          var ts = Date.now();
          var safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          var path = 'feedback/' + ts + '_' + safeName;
          var uploadResult = await db.storage.from(BUCKET).upload(path, f, {
            cacheControl: '3600',
            upsert: false
          });
          if (uploadResult.error) {
            console.warn('[Feedback] upload error for ' + f.name + ':', uploadResult.error.message);
          } else {
            screenshotPaths.push(path);
          }
        }

        // Get user ID if logged in
        var userId = null;
        try {
          if (window.AAAI && window.AAAI.auth && window.AAAI.auth.getUser) {
            var u = window.AAAI.auth.getUser();
            if (u && u.id) userId = u.id;
          }
          if (!userId) {
            var session = await db.auth.getSession();
            if (session && session.data && session.data.session && session.data.session.user) {
              userId = session.data.session.user.id;
            }
          }
        } catch (_) { /* anonymous is fine */ }

        // Insert feedback row
        var category = document.getElementById('aaai-fb-category').value;
        var insertResult = await db.from('feedback').insert({
          user_id:          userId,
          page_url:         window.location.href,
          category:         category,
          message:          message,
          screenshot_paths: screenshotPaths,
          status:           'new'
        });

        if (insertResult.error) {
          throw new Error(insertResult.error.message || 'Failed to save feedback');
        }

        // Show thank-you
        document.getElementById('aaai-fb-form-body').style.display = 'none';
        document.getElementById('aaai-fb-thanks').style.display = '';
        console.log('[Feedback] submitted — screenshots:', screenshotPaths.length);

      } catch (err) {
        showError('Something went wrong: ' + (err.message || 'Please try again.'));
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Feedback';
        console.error('[Feedback] submit error:', err);
      }
    });
  }

})();
