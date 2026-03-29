/* ══════════════════════════════════════════════════════════
   AIOS — Admin Panel  (Phase 27)
   Gated admin/review tool for internal QA and testing.

   Gate: localStorage.getItem('aios_admin') === '1'
   Enable: localStorage.setItem('aios_admin','1') and reload
   Disable: localStorage.removeItem('aios_admin') and reload

   Keyboard shortcut: Ctrl+Shift+` (distinct from Inspector Ctrl+`)

   Displays (read-only, no write actions):
     1. Safety      — escalation tier, crisis/AT_RISK banner state
     2. Routing     — intent, skill, confidence, matched phrase, tier
     3. Memory      — all 8 profile fields
     4. Eligibility — all 7 category scores
     5. Mission     — full untruncated mission details
     6. Chain       — pending chain state
     7. Links       — link validator summary

   Position: bottom-left (distinct from Inspector's bottom-right)
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Gate ────────────────────────────────────────────── */

  function _isEnabled() {
    try { return localStorage.getItem('aios_admin') === '1'; } catch (e) { return false; }
  }

  if (!_isEnabled()) return;

  /* ── Config ──────────────────────────────────────────── */

  var POLL_INTERVAL_MS = 2000;   // refresh rate when panel is open
  var PANEL_ID         = 'aiosAdminPanel';
  var TOGGLE_ID        = 'aiosAdminToggle';
  var STYLE_ID         = 'aiosAdminStyles';

  /* ── State ───────────────────────────────────────────── */

  var _panel      = null;
  var _toggle     = null;
  var _pollTimer  = null;
  var _isOpen     = false;
  var _lastMeta   = null;  // most recent meta captured from buildAIOSRequest

  /* ── CSS ─────────────────────────────────────────────── */

  var _CSS = [
    '#' + TOGGLE_ID + ' {',
    '  position:fixed; bottom:72px; left:12px; z-index:99998;',
    '  background:#1a1a2e; color:#e0e0e0; border:1px solid #444; border-radius:4px;',
    '  padding:4px 10px; font:bold 11px/1 monospace; cursor:pointer;',
    '  opacity:0.85; letter-spacing:.04em;',
    '}',
    '#' + TOGGLE_ID + ':hover { opacity:1; background:#2a2a4e; }',
    '#' + PANEL_ID + ' {',
    '  position:fixed; bottom:108px; left:12px; z-index:99997;',
    '  width:340px; max-height:520px; overflow-y:auto;',
    '  background:#0d0d1a; color:#d0d0d0; border:1px solid #444; border-radius:6px;',
    '  font:12px/1.5 monospace; padding:10px 12px; box-sizing:border-box;',
    '  display:none;',
    '}',
    '#' + PANEL_ID + ' .adm-head {',
    '  color:#7ec8e3; font-weight:bold; font-size:11px;',
    '  letter-spacing:.08em; text-transform:uppercase;',
    '  border-bottom:1px solid #333; margin:8px 0 4px; padding-bottom:2px;',
    '}',
    '#' + PANEL_ID + ' .adm-head:first-child { margin-top:0; }',
    '#' + PANEL_ID + ' .adm-row { display:flex; justify-content:space-between; margin:2px 0; }',
    '#' + PANEL_ID + ' .adm-label { color:#888; flex-shrink:0; margin-right:8px; }',
    '#' + PANEL_ID + ' .adm-val { color:#e8e8e8; text-align:right; word-break:break-all; }',
    '#' + PANEL_ID + ' .adm-val.ok   { color:#4caf50; }',
    '#' + PANEL_ID + ' .adm-val.warn { color:#ff9800; }',
    '#' + PANEL_ID + ' .adm-val.crit { color:#f44336; font-weight:bold; }',
    '#' + PANEL_ID + ' .adm-val.dim  { color:#555; }',
    '#' + PANEL_ID + ' .adm-block {',
    '  background:#111128; border-radius:3px; padding:4px 6px;',
    '  margin:3px 0; font-size:11px; word-break:break-word; color:#c0c0c0;',
    '}',
    '#' + PANEL_ID + ' .adm-ts { color:#444; font-size:10px; text-align:right; margin-top:6px; }'
  ].join('\n');

  /* ── Hook buildAIOSRequest ───────────────────────────── */

  /**
   * Wraps window.AIOS.RequestBuilder.buildAIOSRequest to capture the
   * meta object each time a request is built. Non-destructive — original
   * function always called, return value always passed through.
   */
  function _hookRequestBuilder() {
    try {
      var RB = window.AIOS && window.AIOS.RequestBuilder;
      if (!RB || !RB.buildAIOSRequest || RB.__adminHooked) return;

      var _orig = RB.buildAIOSRequest;
      RB.buildAIOSRequest = function() {
        var result = _orig.apply(this, arguments);
        try {
          if (result && result.meta) { _lastMeta = result.meta; }
        } catch (e) {}
        return result;
      };
      RB.__adminHooked = true;
    } catch (e) {}
  }

  /* ── Helpers ─────────────────────────────────────────── */

  function _esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _row(label, value, cls) {
    var c = cls ? ' class="adm-val ' + cls + '"' : ' class="adm-val"';
    return '<div class="adm-row"><span class="adm-label">' + _esc(label) + '</span>' +
           '<span' + c + '>' + _esc(value !== undefined && value !== null ? value : '—') + '</span></div>';
  }

  function _head(text) {
    return '<div class="adm-head">' + _esc(text) + '</div>';
  }

  function _block(text) {
    return '<div class="adm-block">' + _esc(text) + '</div>';
  }

  function _tierClass(tier) {
    if (!tier) return '';
    if (tier === 'CRISIS')   return 'crit';
    if (tier === 'AT_RISK')  return 'warn';
    return 'ok';
  }

  function _scoreClass(score) {
    if (typeof score !== 'number') return 'dim';
    if (score >= 0.72) return 'ok';
    if (score >= 0.50) return 'warn';
    return '';
  }

  /* ── Refresh (builds inner HTML) ─────────────────────── */

  function _refresh() {
    if (!_panel || !_isOpen) return;

    var html = '';

    /* ── 1. SAFETY ──────────────────────────────────── */
    html += _head('Safety');

    var tier = (_lastMeta && _lastMeta.escalationTier) ? _lastMeta.escalationTier : null;

    // Live DOM checks for banner visibility
    var crisisBanner = document.getElementById('crisisBanner');
    var crisisActive = !!(crisisBanner && crisisBanner.style.display !== 'none');
    var atRiskEl     = document.querySelector('#chatMessages .message--at-risk');
    var atRiskActive = !!atRiskEl;

    var displayTier = tier || (crisisActive ? 'CRISIS' : (atRiskActive ? 'AT_RISK' : 'STANDARD'));

    html += _row('Tier',         displayTier,                _tierClass(displayTier));
    html += _row('Crisis banner', crisisActive ? 'VISIBLE' : 'hidden', crisisActive ? 'crit' : 'dim');
    html += _row('AT_RISK msg',  atRiskActive ? 'VISIBLE' : 'hidden',  atRiskActive ? 'warn' : 'dim');

    /* ── 2. ROUTING ─────────────────────────────────── */
    html += _head('Routing');

    if (_lastMeta) {
      html += _row('Intent',      _lastMeta.intent      || '—');
      html += _row('Skill',       _lastMeta.skill       || '—');
      html += _row('Confidence',  typeof _lastMeta.confidence === 'number'
                                  ? (_lastMeta.confidence * 100).toFixed(0) + '%' : '—');
      html += _row('Matched',     _lastMeta.matched     || '—');
      html += _row('Tier',        _lastMeta.escalationTier || '—', _tierClass(_lastMeta.escalationTier));
      html += _row('Has eligibility', _lastMeta.hasEligibilityContext ? 'yes' : 'no',
                   _lastMeta.hasEligibilityContext ? 'ok' : 'dim');
      html += _row('Has memory',  _lastMeta.hasMemory   ? 'yes' : 'no',
                   _lastMeta.hasMemory ? 'ok' : 'dim');
      html += _row('Has mission', _lastMeta.hasMission  ? 'yes' : 'no',
                   _lastMeta.hasMission ? 'ok' : 'dim');
      html += _row('Prompt len',  typeof _lastMeta.systemPromptLength === 'number'
                                  ? _lastMeta.systemPromptLength + ' chars' : '—');
    } else {
      html += '<div class="adm-block" style="color:#555">No request built yet this session.</div>';
    }

    /* ── 3. MEMORY ──────────────────────────────────── */
    html += _head('Memory');

    var mem    = window.AIOS && window.AIOS.Memory;
    var profile = (mem && mem.getProfile) ? mem.getProfile() : null;

    if (profile) {
      var fields = [
        ['branch',           'Branch'],
        ['serviceEra',       'Era'],
        ['dischargeStatus',  'Discharge'],
        ['vaRating',         'VA Rating'],
        ['state',            'State'],
        ['employmentStatus', 'Employment'],
        ['currentGoals',     'Goals'],
        ['activeMissions',   'Missions']
      ];
      for (var fi = 0; fi < fields.length; fi++) {
        var key  = fields[fi][0];
        var lbl  = fields[fi][1];
        var val  = profile[key];
        var disp = (val === null || val === undefined || val === '')
                   ? '—'
                   : (typeof val === 'object' ? JSON.stringify(val) : String(val));
        html += _row(lbl, disp, (!val || (Array.isArray(val) && val.length === 0)) ? 'dim' : '');
      }
    } else {
      html += '<div class="adm-block" style="color:#555">Memory module not loaded.</div>';
    }

    /* ── 4. ELIGIBILITY ─────────────────────────────── */
    html += _head('Eligibility');

    var Elig  = window.AIOS && window.AIOS.Eligibility;
    if (Elig && Elig.score && profile) {
      var scores = null;
      try { scores = Elig.score(profile); } catch (e) {}
      if (scores) {
        var cats = [
          ['VA_DISABILITY',     'VA Disability'],
          ['VA_HEALTHCARE',     'VA Healthcare'],
          ['GI_BILL',           'GI Bill'],
          ['VR_E',              'VR&E'],
          ['STATE_BENEFITS',    'State Benefits'],
          ['HOUSING_SUPPORT',   'Housing'],
          ['EMPLOYMENT_SUPPORT','Employment']
        ];
        for (var ci = 0; ci < cats.length; ci++) {
          var cid  = cats[ci][0];
          var clbl = cats[ci][1];
          var cscore = scores[cid];
          var cdisp = (typeof cscore === 'number') ? cscore.toFixed(2) : '—';
          html += _row(clbl, cdisp, _scoreClass(cscore));
        }
      } else {
        html += '<div class="adm-block" style="color:#555">Score unavailable.</div>';
      }
    } else {
      html += '<div class="adm-block" style="color:#555">Eligibility module not loaded.</div>';
    }

    /* ── 5. MISSION ─────────────────────────────────── */
    html += _head('Mission');

    var Mission = window.AIOS && window.AIOS.Mission;
    if (Mission) {
      var active = (Mission.isActive && Mission.isActive());
      html += _row('Active', active ? 'yes' : 'no', active ? 'ok' : 'dim');
      if (active && Mission.current) {
        var mc = Mission.current;
        html += _row('Type',    mc.missionType || '—');
        html += _row('Status',  mc.status      || '—');
        html += _row('Started', mc.startedAt   || '—');
        if (mc.currentStep) {
          html += '<div class="adm-label" style="margin-top:4px">Current step:</div>';
          html += _block(mc.currentStep);
        }
        if (mc.nextStep) {
          html += '<div class="adm-label">Next step:</div>';
          html += _block(mc.nextStep);
        }
        if (mc.notes) {
          html += '<div class="adm-label">Notes:</div>';
          html += _block(mc.notes);
        }
      }
    } else {
      html += '<div class="adm-block" style="color:#555">Mission module not loaded.</div>';
    }

    /* ── 6. CHAIN ───────────────────────────────────── */
    html += _head('Chain');

    var Chain = window.AIOS && window.AIOS.Chain;
    if (Chain) {
      var hasPending = Chain.hasPending();
      html += _row('Pending', hasPending ? 'yes' : 'no', hasPending ? 'warn' : 'dim');
      if (hasPending) {
        var ch = Chain.getPending();
        html += _row('nextSkill', ch.nextSkill || '—');
        if (ch.label) {
          html += '<div class="adm-label" style="margin-top:4px">Label:</div>';
          html += _block(ch.label);
        }
      }
    } else {
      html += '<div class="adm-block" style="color:#555">Chain module not loaded.</div>';
    }

    /* ── 7. LINKS ───────────────────────────────────── */
    html += _head('Links');

    var LV = window.AIOS && window.AIOS.LinkValidator;
    if (LV) {
      var sum = LV.getSummary();
      html += _row('Total',     sum.total);
      html += _row('Reachable', sum.reachable, sum.reachable > 0 ? 'ok'  : 'dim');
      html += _row('Unknown',   sum.unknown,   sum.unknown   > 0 ? 'warn': 'dim');
      html += _row('Broken',    sum.broken,    sum.broken    > 0 ? 'crit': 'dim');
      html += _row('Pending',   sum.pending,   sum.pending   > 0 ? 'warn': 'dim');
      var broken = LV.getBroken();
      if (broken.length > 0) {
        html += '<div class="adm-label" style="margin-top:4px">Broken URLs:</div>';
        for (var bi = 0; bi < broken.length; bi++) {
          try {
            var parsed = new URL(broken[bi]);
            html += _block(parsed.hostname + parsed.pathname);
          } catch (e) {
            html += _block(broken[bi]);
          }
        }
      }
    } else {
      html += '<div class="adm-block" style="color:#555">LinkValidator module not loaded.</div>';
    }

    /* ── Timestamp ──────────────────────────────────── */
    var ts = new Date().toLocaleTimeString();
    html += '<div class="adm-ts">Updated ' + ts + '</div>';

    _panel.innerHTML = html;
  }

  /* ── Panel lifecycle ─────────────────────────────────── */

  function _startPoll() {
    if (_pollTimer) return;
    _pollTimer = setInterval(_refresh, POLL_INTERVAL_MS);
  }

  function _stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  function _togglePanel() {
    _isOpen = !_isOpen;
    if (_panel) {
      _panel.style.display = _isOpen ? 'block' : 'none';
    }
    if (_toggle) {
      _toggle.textContent = _isOpen ? 'ADMIN ▾' : 'ADMIN ▸';
    }
    if (_isOpen) {
      _refresh();
      _startPoll();
    } else {
      _stopPoll();
    }
  }

  /* ── DOM init ────────────────────────────────────────── */

  function _init() {
    // Inject CSS
    if (!document.getElementById(STYLE_ID)) {
      var styleEl = document.createElement('style');
      styleEl.id  = STYLE_ID;
      styleEl.textContent = _CSS;
      document.head.appendChild(styleEl);
    }

    // Toggle button
    _toggle = document.createElement('button');
    _toggle.id          = TOGGLE_ID;
    _toggle.textContent = 'ADMIN ▸';
    _toggle.setAttribute('title', 'AIOS Admin Panel (Ctrl+Shift+`)');
    _toggle.addEventListener('click', _togglePanel);
    document.body.appendChild(_toggle);

    // Panel container
    _panel = document.createElement('div');
    _panel.id = PANEL_ID;
    document.body.appendChild(_panel);

    // Hook request builder (may already be loaded)
    _hookRequestBuilder();

    // Retry hook after a short delay in case RequestBuilder loads after this script
    setTimeout(_hookRequestBuilder, 1500);
  }

  /* ── Keyboard shortcut: Ctrl+Shift+` ────────────────── */

  document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+` — keyCode 192 is backtick/tilde
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '`' || e.keyCode === 192)) {
      e.preventDefault();
      _togglePanel();
    }
  });

  /* ── Destroy (cleanup) ───────────────────────────────── */

  var AdminPanel = {
    /**
     * Force-refresh the panel content immediately (useful for testing).
     */
    refresh: function() { _refresh(); },

    /**
     * Remove all DOM elements and stop polling.
     * Use for testing or emergency cleanup only.
     */
    destroy: function() {
      _stopPoll();
      if (_toggle && _toggle.parentNode) { _toggle.parentNode.removeChild(_toggle); }
      if (_panel  && _panel.parentNode)  { _panel.parentNode.removeChild(_panel); }
      var styleEl = document.getElementById(STYLE_ID);
      if (styleEl && styleEl.parentNode) { styleEl.parentNode.removeChild(styleEl); }
      _toggle = null;
      _panel  = null;
      _isOpen = false;
    }
  };

  /* ── Boot ────────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ── Register with AIOS ──────────────────────────────── */

  window.AIOS = window.AIOS || {};
  window.AIOS.AdminPanel = AdminPanel;

})();
