/* ══════════════════════════════════════════════════════════
   AIOS Inspector  (Phase 20)
   Developer-only floating panel showing routing state,
   memory summary, mission summary, and suggestion state.

   OFF by default — zero impact on production.

   Enable:
     localStorage.setItem('aios_dev','1')  then reload
     OR add ?aios_dev=1 to the URL
     OR open console and run: AIOS.Inspector.enable()

   Disable:
     AIOS.Inspector.disable()

   Toggle panel:
     Ctrl+`  (Ctrl + backtick)

   Console helpers:
     AIOS.Inspector.show()     — open panel
     AIOS.Inspector.hide()     — close panel
     AIOS.Inspector.refresh()  — force data refresh
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var _panel    = null;   // The floating div
  var _toggle   = null;   // The ⚙ toggle button
  var _visible  = false;  // Panel open?
  var _pollTimer = null;  // 2s refresh timer (only when panel is open)
  var _lastMeta  = null;  // Captured from buildAIOSRequest() return value
  var _hooked    = false; // Has RequestBuilder been wrapped?

  // ── Enable check ───────────────────────────────────────
  function _isEnabled() {
    try {
      return localStorage.getItem('aios_dev') === '1' ||
             /[?&]aios_dev=1/.test(window.location.search);
    } catch(e) { return false; }
  }

  // ── Wrap RequestBuilder (non-destructive) ──────────────
  // Intercepts the return value of buildAIOSRequest to capture
  // the meta object (intent, skill, confidence, lengths, flags).
  // The original function runs and returns unchanged.
  function _hookRequestBuilder() {
    if (_hooked) return;
    try {
      if (!window.AIOS || !window.AIOS.RequestBuilder) return;
      var _orig = window.AIOS.RequestBuilder.buildAIOSRequest;
      window.AIOS.RequestBuilder.buildAIOSRequest = function(opts) {
        var result = _orig.call(this, opts);
        if (result && result.meta) {
          _lastMeta = result.meta;
          // Refresh panel immediately on new AIOS request (if open)
          if (_visible) { try { _refresh(); } catch(e) {} }
        }
        return result;  // identical return — behavior unchanged
      };
      _hooked = true;
      console.log('[AIOS][INSPECTOR] RequestBuilder hooked');
    } catch(e) {
      console.warn('[AIOS][INSPECTOR] hook failed:', e.message);
    }
  }

  // ── Injected CSS (self-contained — no changes to styles.css) ──
  var _CSS = [
    // Toggle button — small gear, bottom-right, above any nav
    '#aiosInspToggle{',
    '  position:fixed;bottom:72px;right:12px;z-index:9998;',
    '  width:28px;height:28px;border-radius:7px;',
    '  background:rgba(197,165,90,0.16);border:1px solid rgba(197,165,90,0.42);',
    '  color:#C5A55A;font-size:14px;cursor:pointer;',
    '  display:flex;align-items:center;justify-content:center;',
    '  font-family:monospace;line-height:1;',
    '  transition:background 0.15s,opacity 0.15s;',
    '  box-shadow:0 2px 8px rgba(0,0,0,0.45);',
    '  outline:none;',
    '}',
    '#aiosInspToggle:hover{background:rgba(197,165,90,0.28);}',

    // Panel
    '#aiosInspector{',
    '  position:fixed;bottom:108px;right:12px;z-index:9999;',
    '  width:284px;border-radius:10px;',
    '  background:rgba(12,12,12,0.97);',
    '  border:1px solid rgba(197,165,90,0.38);',
    '  font-family:"SF Mono","Fira Mono","Consolas",monospace;',
    '  font-size:11px;line-height:1.5;',
    '  box-shadow:0 4px 24px rgba(0,0,0,0.65);',
    '  overflow:hidden;',
    '  user-select:text;',
    '}',

    // Header bar
    '#aiosInspector .ai-h{',
    '  display:flex;align-items:center;justify-content:space-between;',
    '  padding:5px 10px;',
    '  background:rgba(197,165,90,0.11);',
    '  border-bottom:1px solid rgba(197,165,90,0.22);',
    '}',
    '#aiosInspector .ai-h-title{',
    '  color:#C5A55A;font-weight:700;font-size:10px;',
    '  letter-spacing:0.04em;text-transform:uppercase;',
    '}',
    '#aiosInspector .ai-h-btns{display:flex;gap:2px;}',
    '#aiosInspector .ai-h-btns button{',
    '  background:none;border:none;color:#C5A55A;',
    '  cursor:pointer;font-size:13px;padding:1px 4px;',
    '  line-height:1;font-family:monospace;',
    '  opacity:0.6;transition:opacity 0.12s;border-radius:4px;',
    '}',
    '#aiosInspector .ai-h-btns button:hover{opacity:1;background:rgba(197,165,90,0.12);}',

    // Body
    '#aiosInspector .ai-body{padding:7px 10px 8px;}',

    // Section headers
    '#aiosInspector .ai-sec{',
    '  color:rgba(197,165,90,0.48);font-size:9px;',
    '  text-transform:uppercase;letter-spacing:0.07em;',
    '  margin:6px 0 2px;padding-top:5px;',
    '  border-top:1px solid rgba(255,255,255,0.05);',
    '}',
    '#aiosInspector .ai-sec:first-child{margin-top:0;padding-top:0;border-top:none;}',

    // Rows
    '#aiosInspector .ai-row{',
    '  display:flex;gap:6px;margin-bottom:2px;',
    '}',
    '#aiosInspector .ai-lbl{',
    '  color:rgba(197,165,90,0.62);min-width:58px;',
    '  font-size:10px;padding-top:1px;flex-shrink:0;',
    '}',
    '#aiosInspector .ai-val{',
    '  color:#d8d8d8;word-break:break-word;flex:1;',
    '}',

    // Value state colours
    '#aiosInspector .v-ok{color:#6ee7b7;}',      // green — active/present
    '#aiosInspector .v-warn{color:#fbbf24;}',     // amber — partial/low confidence
    '#aiosInspector .v-dim{color:rgba(160,160,160,0.38);}', // grey — absent

    // Timestamp
    '#aiosInspector .ai-ts{',
    '  color:rgba(160,160,160,0.28);font-size:9px;',
    '  margin-top:5px;display:block;',
    '}',

    // Hide on mobile when panel is closed (no layout impact)
    '@media(max-width:480px){',
    '  #aiosInspector{width:calc(100vw - 24px);right:12px;}',
    '}'
  ].join('');

  function _injectCSS() {
    if (document.getElementById('aiosInspCSS')) return;
    var s = document.createElement('style');
    s.id = 'aiosInspCSS';
    s.textContent = _CSS;
    document.head.appendChild(s);
  }

  // ── Build panel & toggle button ─────────────────────────
  function _buildPanel() {
    if (document.getElementById('aiosInspector')) return;

    // ── Toggle button ──
    _toggle = document.createElement('button');
    _toggle.id    = 'aiosInspToggle';
    _toggle.title = 'AIOS Inspector (Ctrl+`)';
    _toggle.setAttribute('aria-label', 'Toggle AIOS Inspector');
    _toggle.textContent = '⚙';
    _toggle.addEventListener('click', function() { _togglePanel(); });
    document.body.appendChild(_toggle);

    // ── Panel ──
    _panel = document.createElement('div');
    _panel.id = 'aiosInspector';
    _panel.setAttribute('aria-label', 'AIOS Developer Inspector');
    _panel.style.display = 'none';
    _panel.innerHTML =
      '<div class="ai-h">' +
        '<span class="ai-h-title">⚙ AIOS Inspector</span>' +
        '<div class="ai-h-btns">' +
          '<button id="aiosInspRefresh" title="Refresh (auto every 2s)">↻</button>' +
          '<button id="aiosInspClose"   title="Close">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="ai-body" id="aiosInspBody">' +
        '<div class="ai-row"><span class="ai-lbl">Status</span>' +
        '<span class="ai-val v-dim" id="aiosInspStatus">waiting for first request...</span></div>' +
      '</div>';
    document.body.appendChild(_panel);

    document.getElementById('aiosInspRefresh').addEventListener('click', _refresh);
    document.getElementById('aiosInspClose').addEventListener('click', function() {
      _togglePanel(false);
    });
  }

  // ── HTML escape ──────────────────────────────────────────
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Classify confidence value ────────────────────────────
  function _confClass(c) {
    if (typeof c !== 'number') return 'v-dim';
    if (c >= 0.8) return 'v-ok';
    if (c >= 0.4) return 'v-warn';
    return 'v-dim';
  }

  // ── Refresh panel data ───────────────────────────────────
  // Reads from existing AIOS state — never creates parallel state.
  // Safe to call at any time; errors are swallowed.
  function _refresh() {
    if (!_panel) return;
    var body = document.getElementById('aiosInspBody');
    if (!body) return;

    try {
      var rows = [];
      var now  = new Date().toLocaleTimeString();

      // ══ ROUTING ════════════════════════════════════════
      rows.push('<div class="ai-sec">Routing</div>');

      var intent  = (_lastMeta && _lastMeta.intent)      || null;
      var skill   = (_lastMeta && _lastMeta.skill)       || null;
      var conf    = (_lastMeta && typeof _lastMeta.confidence === 'number')
                    ? _lastMeta.confidence : null;
      var sysLen  = (_lastMeta && _lastMeta.systemPromptLength > 0)
                    ? _lastMeta.systemPromptLength : null;
      var hasMem  = _lastMeta ? _lastMeta.hasMemory  : null;
      var hasMis  = _lastMeta ? _lastMeta.hasMission : null;

      var intentClass = !intent                       ? 'v-dim'
                      : intent === 'GENERAL_QUESTION' ? 'v-warn'
                      : 'v-ok';
      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Intent</span>' +
        '<span class="ai-val ' + intentClass + '">' + _esc(intent || '—') + '</span></div>'
      );
      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Skill</span>' +
        '<span class="ai-val ' + (skill ? 'v-ok' : 'v-dim') + '">' + _esc(skill || '—') + '</span></div>'
      );
      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Confidence</span>' +
        '<span class="ai-val ' + _confClass(conf) + '">' + (conf !== null ? conf : '—') + '</span></div>'
      );
      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Sys len</span>' +
        '<span class="ai-val ' + (sysLen ? 'v-ok' : 'v-dim') + '">' +
        (sysLen ? sysLen + ' chars' : '—') + '</span></div>'
      );

      // ══ MEMORY ═════════════════════════════════════════
      rows.push('<div class="ai-sec">Memory</div>');

      var memSummary = '';
      var memCount   = 0;
      try {
        if (window.AIOS && window.AIOS.Memory) {
          var prof = window.AIOS.Memory.getProfile();
          // Count non-null profile fields
          var fieldKeys = ['branch','serviceEra','dischargeStatus','vaRating',
                           'state','employmentStatus','currentGoals','activeMissions'];
          for (var fi = 0; fi < fieldKeys.length; fi++) {
            var fv = prof[fieldKeys[fi]];
            if (fv !== null && fv !== undefined && fv !== '') memCount++;
          }
          memSummary = window.AIOS.Memory.buildMemorySummary(prof) || '';
          // Strip "Veteran profile — " prefix for compactness
          memSummary = memSummary.replace(/^Veteran profile\s*[—\-]\s*/i, '');
          // Strip trailing period
          memSummary = memSummary.replace(/\.\s*$/, '');
        }
      } catch(e) {}

      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Fields</span>' +
        '<span class="ai-val ' + (memCount > 0 ? 'v-ok' : 'v-dim') + '">' +
        memCount + ' known' + '</span></div>'
      );
      if (memSummary) {
        // Show up to 140 chars, split on " | " for readability
        var memParts = memSummary.split(' | ');
        var memLine1 = memParts.slice(0, 3).join(' | ');
        var memLine2 = memParts.slice(3).join(' | ');
        rows.push(
          '<div class="ai-row"><span class="ai-lbl">Profile</span>' +
          '<span class="ai-val v-ok">' + _esc(memLine1) + '</span></div>'
        );
        if (memLine2) {
          rows.push(
            '<div class="ai-row"><span class="ai-lbl"></span>' +
            '<span class="ai-val v-ok">' + _esc(memLine2) + '</span></div>'
          );
        }
      } else {
        rows.push(
          '<div class="ai-row"><span class="ai-lbl">Profile</span>' +
          '<span class="ai-val v-dim">empty</span></div>'
        );
      }
      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Injected</span>' +
        '<span class="ai-val ' + (hasMem === null ? 'v-dim' : hasMem ? 'v-ok' : 'v-warn') + '">' +
        (hasMem === null ? '—' : hasMem ? 'yes' : 'no') + '</span></div>'
      );

      // ══ MISSION ════════════════════════════════════════
      rows.push('<div class="ai-sec">Mission</div>');

      var missionActive = false;
      var misName   = '';
      var misStatus = '';
      var misStep   = '';
      var misNext   = '';
      var misBlocks = '';
      try {
        if (window.AIOS && window.AIOS.Mission && window.AIOS.Mission.current) {
          var mc    = window.AIOS.Mission.current;
          missionActive = true;
          misName   = mc.name   || mc.type  || '';
          misStatus = mc.status || '';
          misStep   = mc.currentStep || '';
          misNext   = mc.nextStep    || '';
          if (Array.isArray(mc.blockers) && mc.blockers.length > 0) {
            misBlocks = mc.blockers.join('; ');
          }
        }
      } catch(e) {}

      if (missionActive) {
        rows.push(
          '<div class="ai-row"><span class="ai-lbl">Name</span>' +
          '<span class="ai-val v-ok">' + _esc(misName) + '</span></div>'
        );
        rows.push(
          '<div class="ai-row"><span class="ai-lbl">Status</span>' +
          '<span class="ai-val ' + (misStatus === 'active' ? 'v-ok' : 'v-warn') + '">' +
          _esc(misStatus) + '</span></div>'
        );
        if (misStep) {
          rows.push(
            '<div class="ai-row"><span class="ai-lbl">Step</span>' +
            '<span class="ai-val">' + _esc(misStep.substring(0, 60)) + '</span></div>'
          );
        }
        if (misNext) {
          rows.push(
            '<div class="ai-row"><span class="ai-lbl">Next</span>' +
            '<span class="ai-val">' + _esc(misNext.substring(0, 60)) + '</span></div>'
          );
        }
        rows.push(
          '<div class="ai-row"><span class="ai-lbl">Blockers</span>' +
          '<span class="ai-val ' + (misBlocks ? 'v-warn' : 'v-dim') + '">' +
          _esc(misBlocks || 'none') + '</span></div>'
        );
      } else {
        rows.push(
          '<div class="ai-row"><span class="ai-lbl">Mission</span>' +
          '<span class="ai-val v-dim">none</span></div>'
        );
      }
      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Injected</span>' +
        '<span class="ai-val ' + (hasMis === null ? 'v-dim' : hasMis ? 'v-ok' : 'v-warn') + '">' +
        (hasMis === null ? '—' : hasMis ? 'yes' : 'no') + '</span></div>'
      );

      // ══ SUGGESTION ═════════════════════════════════════
      rows.push('<div class="ai-sec">Suggestion</div>');

      var suggEl      = document.getElementById('aiosSuggestion');
      var suggShowing = !!(suggEl && suggEl.style.display !== 'none');
      var suggContent = '';
      if (suggShowing && suggEl) {
        // Extract visible text only — strip button content
        var tmp = document.createElement('div');
        tmp.innerHTML = suggEl.innerHTML;
        var btnEls = tmp.querySelectorAll('button');
        for (var bi = 0; bi < btnEls.length; bi++) { btnEls[bi].remove(); }
        suggContent = (tmp.textContent || tmp.innerText || '')
          .trim().replace(/\s+/g, ' ').substring(0, 80);
      }

      rows.push(
        '<div class="ai-row"><span class="ai-lbl">Active</span>' +
        '<span class="ai-val ' + (suggShowing ? 'v-warn' : 'v-dim') + '">' +
        (suggShowing ? 'yes' : 'no') + '</span></div>'
      );
      if (suggContent) {
        rows.push(
          '<div class="ai-row"><span class="ai-lbl">Text</span>' +
          '<span class="ai-val">' + _esc(suggContent) + '</span></div>'
        );
      }

      // ══ LINKS (Phase 26) ═══════════════════════════════
      rows.push('<div class="ai-sec">Links</div>');

      try {
        var LV = window.AIOS && window.AIOS.LinkValidator;
        if (LV) {
          var lsum = LV.getSummary();
          var lClass = lsum.broken > 0 ? 'v-warn' : (lsum.total > 0 ? 'v-ok' : 'v-dim');
          var lText = lsum.reachable + ' ok';
          if (lsum.broken  > 0) lText += ' / ' + lsum.broken  + ' broken';
          if (lsum.unknown > 0) lText += ' / ' + lsum.unknown + ' unknown';
          if (lsum.pending > 0) lText += ' / ' + lsum.pending + ' pending';
          if (lsum.total === 0) lText = 'collecting…';
          rows.push(
            '<div class="ai-row"><span class="ai-lbl">Status</span>' +
            '<span class="ai-val ' + lClass + '">' + _esc(lText) + '</span></div>'
          );
          // Show up to 3 broken URLs (path portion only for compactness)
          var brokenUrls = LV.getBroken();
          for (var li = 0; li < brokenUrls.length && li < 3; li++) {
            var bDisplay = brokenUrls[li].replace(/^https?:\/\/[^\/]+/, '') || brokenUrls[li];
            if (bDisplay.length > 48) bDisplay = bDisplay.substring(0, 47) + '…';
            rows.push(
              '<div class="ai-row"><span class="ai-lbl">⚠ broken</span>' +
              '<span class="ai-val v-warn">' + _esc(bDisplay) + '</span></div>'
            );
          }
        } else {
          rows.push(
            '<div class="ai-row"><span class="ai-lbl">Status</span>' +
            '<span class="ai-val v-dim">not loaded</span></div>'
          );
        }
      } catch (e) { /* swallow — inspector must never crash */ }

      // ══ TIMESTAMP ══════════════════════════════════════
      rows.push('<span class="ai-ts">Refreshed ' + now + ' · Ctrl+` to toggle</span>');

      body.innerHTML = rows.join('');

    } catch(e) {
      console.warn('[AIOS][INSPECTOR] refresh error:', e.message || e);
    }
  }

  // ── Toggle panel visibility ──────────────────────────────
  function _togglePanel(forceState) {
    if (!_panel) return;
    _visible = (forceState !== undefined) ? Boolean(forceState) : !_visible;
    _panel.style.display = _visible ? 'block' : 'none';
    if (_visible) {
      _refresh();
      _startPoll();
    } else {
      _stopPoll();
    }
  }

  // ── 2-second auto-refresh (only when panel is open) ──────
  function _startPoll() {
    _stopPoll();
    _pollTimer = setInterval(function() {
      if (_visible) _refresh();
      else          _stopPoll();  // self-cleanup guard
    }, 2000);
  }

  function _stopPoll() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  // ── Keyboard shortcut: Ctrl+` ────────────────────────────
  function _wireKeyboard() {
    document.addEventListener('keydown', function(e) {
      // Ctrl + ` (backtick — keyCode 192 on most keyboards)
      if (e.ctrlKey && !e.shiftKey && !e.altKey &&
          (e.key === '`' || e.keyCode === 192)) {
        e.preventDefault();
        _togglePanel();
      }
    }, false);
  }

  // ── Destroy (disable) ────────────────────────────────────
  function _destroy() {
    _stopPoll();
    _visible = false;
    if (_panel)  { try { _panel.remove();  } catch(e) {} _panel  = null; }
    if (_toggle) { try { _toggle.remove(); } catch(e) {} _toggle = null; }
    var cssEl = document.getElementById('aiosInspCSS');
    if (cssEl) try { cssEl.remove(); } catch(e) {}
    // Note: RequestBuilder wrap remains until page reload — it is read-only capture,
    // does not change behavior, and removing it would require storing the original reference
    // across disable/re-enable cycles (not worth the complexity for a dev tool).
    console.log('[AIOS][INSPECTOR] disabled — reload to fully remove RequestBuilder hook');
  }

  // ── Init ─────────────────────────────────────────────────
  function _init() {
    if (!_isEnabled()) return;

    function _setup() {
      _injectCSS();
      _buildPanel();
      _hookRequestBuilder();
      _wireKeyboard();
      console.log(
        '[AIOS][INSPECTOR] ready\n' +
        '  Toggle:  Ctrl+`\n' +
        '  Disable: AIOS.Inspector.disable()\n' +
        '  Refresh: AIOS.Inspector.refresh()'
      );
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _setup);
    } else {
      // Defer one tick so AIOS modules and app.js are fully initialised
      setTimeout(_setup, 0);
    }
  }

  // ── Public API ───────────────────────────────────────────
  window.AIOS = window.AIOS || {};
  window.AIOS.Inspector = {
    /**
     * Enable inspector and persist preference.
     * Reloads page to ensure all hooks are applied from start.
     */
    enable: function() {
      try { localStorage.setItem('aios_dev', '1'); } catch(e) {}
      window.location.reload();
    },
    /**
     * Disable inspector and remove all DOM elements.
     */
    disable: function() {
      try { localStorage.removeItem('aios_dev'); } catch(e) {}
      _destroy();
    },
    /**
     * Force a data refresh (also auto-refreshes every 2s when open).
     */
    refresh: _refresh,
    /**
     * Open the inspector panel.
     */
    show: function() { _togglePanel(true); },
    /**
     * Close the inspector panel.
     */
    hide: function() { _togglePanel(false); }
  };

  // Auto-init on script load
  _init();

})();
