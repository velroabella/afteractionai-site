/* ══════════════════════════════════════════════════════════
   AIOS — Silent Telemetry  (Phase 32)
   Lightweight in-memory event log for internal AIOS monitoring.

   Records meaningful internal events only — never stores user
   message text, prompt content, or any PII.

   Events tracked:
     aios_fallback          — AIOS errored and fell back to legacy prompt
     prompt_trimmed         — Request-builder trimmed the system prompt
     low_confidence         — Confidence scorer returned 'low'
     suggestion_suppressed  — Fatigue gate blocked a suggestion
     chain_blocked          — Chain Manager safety gate rejected a chain step
     escalation_triggered   — CRISIS or AT_RISK tier detected
     link_summary           — Link validator finished a batch (summary counts only)
     voice_transcript_accepted — Final voice transcript passed quality gate (optional)

   Storage:
     In-memory array, capped at MAX_EVENTS (100).
     Oldest events dropped (FIFO) when cap is reached.
     Cleared on explicit AIOS.Telemetry.clear() call.
     NOT persisted — session only.

   Deduplication:
     Consecutive identical (type) events within 500ms are merged.
     High-volume events (e.g. voice) naturally stay low-noise.

   Public API (developer console):
     AIOS.Telemetry.getEvents()    → array of { type, ts, data }
     AIOS.Telemetry.getSummary()   → { total, counts: { type: n } }
     AIOS.Telemetry.clear()        → wipes the log

   Access gate: none — all modules are internal.
   No UI rendering — purely a data surface.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Config ──────────────────────────────────────────── */

  /** Maximum events retained in the in-memory log. */
  var MAX_EVENTS = 100;

  /** Consecutive identical-type events within this window (ms) are merged. */
  var DEDUP_WINDOW_MS = 500;

  /* ── State ───────────────────────────────────────────── */

  var _events   = [];   // { type, ts, data }
  var _lastType = '';   // for consecutive dedup
  var _lastTs   = 0;    // timestamp of last recorded event

  /* ── Private ─────────────────────────────────────────── */

  /**
   * Sanitize the data object to ensure no user text or PII is stored.
   * Only whitelisted scalar keys are retained.
   * 'err' is allowed (error type string only, truncated to 80 chars).
   */
  function _sanitize(data) {
    if (!data || typeof data !== 'object') return {};
    var safe = {};

    // Allowed keys and their max string lengths
    var ALLOWED = {
      err:      80,   // error message snippet
      sections: 200,  // trim section list (array → joined)
      signals:  200,  // confidence signal list
      reason:   40,   // suppression reason string
      id:       60,   // suggestion or skill ID
      skill:    60,   // skill name
      tier:     20,   // escalation tier
      path:     20,   // 'voice' | 'text'
      total:    null, // number
      reachable:null,
      broken:   null,
      unknown:  null,
      pending:  null
    };

    for (var key in ALLOWED) {
      if (!ALLOWED.hasOwnProperty(key)) continue;
      if (!(key in data)) continue;
      var val = data[key];
      var maxLen = ALLOWED[key];

      if (maxLen === null) {
        // Numeric field
        if (typeof val === 'number') safe[key] = val;
      } else if (Array.isArray(val)) {
        safe[key] = val.join(', ').substring(0, maxLen);
      } else if (typeof val === 'string') {
        safe[key] = val.substring(0, maxLen);
      }
    }

    return safe;
  }

  /* ── Public API ──────────────────────────────────────── */

  var Telemetry = {

    /**
     * Record a telemetry event.
     *
     * @param {string} type   — Event type (see header for list)
     * @param {Object} [data] — Optional metadata (sanitized before storage)
     */
    record: function(type, data) {
      if (!type || typeof type !== 'string') return;

      var now = Date.now();

      // Consecutive identical-type dedup within DEDUP_WINDOW_MS
      if (type === _lastType && (now - _lastTs) < DEDUP_WINDOW_MS) {
        return;
      }

      _lastType = type;
      _lastTs   = now;

      // FIFO cap — evict oldest when full
      if (_events.length >= MAX_EVENTS) {
        _events.shift();
      }

      _events.push({
        type: type,
        ts:   now,
        data: _sanitize(data)
      });
    },

    /**
     * Return a shallow copy of the event log.
     * @returns {{ type: string, ts: number, data: Object }[]}
     */
    getEvents: function() {
      return _events.slice();
    },

    /**
     * Return a summary: total count and per-type breakdown.
     * @returns {{ total: number, counts: Object }}
     */
    getSummary: function() {
      var counts = {};
      for (var i = 0; i < _events.length; i++) {
        var t = _events[i].type;
        counts[t] = (counts[t] || 0) + 1;
      }
      return { total: _events.length, counts: counts };
    },

    /**
     * Clear the event log and reset dedup state.
     */
    clear: function() {
      _events   = [];
      _lastType = '';
      _lastTs   = 0;
    }

  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Telemetry = Telemetry;

})();
