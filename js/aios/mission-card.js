/* ══════════════════════════════════════════════════════════
   AIOS — Mission Card UI  (Phase 13)
   Renders the compact Active Mission strip between the chat
   header and the message log. Connects to window.AIOS.Mission.

   Behavior:
   - Hidden (display:none) when no mission is active
   - Updates automatically via 2-second poll while chat screen
     is visible (lightweight — skips entirely when hidden)
   - Also exposes window.AIOS.MissionCard.update(mission) for
     direct calls from other modules if needed
   - No voice changes, no DB, no app.js modifications
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var _card       = null;
  var _typeEl     = null;
  var _statusEl   = null;
  var _stepEl     = null;
  var _nextEl     = null;
  var _blockersEl = null;

  var _lastHash = null;

  /** Lazy-init DOM refs once the card exists in the document. */
  function _initRefs() {
    if (_card) return true;
    _card       = document.getElementById('aiosMissionCard');
    _typeEl     = document.getElementById('aiosMissionType');
    _statusEl   = document.getElementById('aiosMissionStatus');
    _stepEl     = document.getElementById('aiosMissionStep');
    _nextEl     = document.getElementById('aiosMissionNext');
    _blockersEl = document.getElementById('aiosMissionBlockers');
    return !!_card;
  }

  /**
   * Render (or clear) the mission card from a mission object.
   * @param {Object|null} mission  — window.AIOS.Mission.current or null
   */
  function update(mission) {
    if (!_initRefs()) return;

    // ── No active mission — hide card entirely ────────────
    if (!mission || typeof mission !== 'object') {
      _card.style.display = 'none';
      _lastHash = null;
      return;
    }

    // ── Build a cheap change-detection hash ───────────────
    var blockerStr = (Array.isArray(mission.blockers) && mission.blockers.length)
      ? mission.blockers.join('|') : '';
    var hash = (mission.type || '') + '§' + (mission.status || '') + '§' +
               (mission.currentStep || '') + '§' + (mission.nextStep || '') + '§' + blockerStr;

    if (hash === _lastHash) return; // nothing changed
    _lastHash = hash;

    // ── Populate fields ───────────────────────────────────
    if (_typeEl)   _typeEl.textContent   = mission.name || _formatType(mission.type) || '';
    if (_statusEl) _statusEl.textContent = _formatStatus(mission.status);

    if (_stepEl) {
      _stepEl.textContent = mission.currentStep
        ? 'Step: ' + mission.currentStep
        : '';
    }

    if (_nextEl) {
      if (mission.nextStep && mission.nextStep !== mission.currentStep) {
        _nextEl.textContent = mission.nextStep;
        _nextEl.style.display = '';
      } else {
        _nextEl.style.display = 'none';
      }
    }

    if (_blockersEl) {
      if (blockerStr) {
        _blockersEl.textContent = '\u26A0 ' + mission.blockers.join(' \u00B7 ');
        _blockersEl.style.display = '';
      } else {
        _blockersEl.style.display = 'none';
      }
    }

    // ── Show card ─────────────────────────────────────────
    _card.style.display = '';
  }

  /** Convert snake_case mission type to title case label. */
  function _formatType(type) {
    if (!type) return '';
    return type.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  /** Format status for display badge. */
  function _formatStatus(status) {
    if (!status) return '';
    var map = {
      'not_started':  'Not Started',
      'in_progress':  'In Progress',
      'completed':    'Completed',
      'on_hold':      'On Hold',
      'abandoned':    'Abandoned'
    };
    return map[status] || status.replace(/_/g, ' ');
  }

  /**
   * Internal poll tick — runs every 2 seconds while chat screen is visible.
   * Skips entirely if AIOS or Mission modules aren't loaded yet.
   */
  function _tick() {
    var chatScreen = document.getElementById('chatScreen');
    if (!chatScreen || chatScreen.style.display === 'none') return;
    if (!window.AIOS || !window.AIOS.Mission) return;
    update(window.AIOS.Mission.current || null);
  }

  function _start() {
    setInterval(_tick, 2000);
    // Also run once immediately after a short delay so the card
    // can appear on returning users who already have a mission loaded.
    setTimeout(_tick, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _start);
  } else {
    _start();
  }

  // ── Public API ─────────────────────────────────────────
  window.AIOS = window.AIOS || {};
  window.AIOS.MissionCard = { update: update };

})();
