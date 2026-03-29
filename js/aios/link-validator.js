/* ══════════════════════════════════════════════════════════
   AIOS — Link Validator  (Phase 26)
   Lightweight async validator for hardcoded outbound resource links.

   Collects URLs from window.AAAI.actions.ISSUE_TO_CHECKLIST on
   DOMContentLoaded, then validates them asynchronously via
   no-cors HEAD fetch — one at a time, 800ms apart.

   Validation accuracy (browser CORS limits):
   - 'reachable' — server responded at network level
                   (status code unavailable for cross-origin — CORS opaque)
   - 'broken'    — reserved in the API; NOT assigned by browser-only checks.
                   Browser fetch rejections (TypeError, NetworkError, CORS
                   errors) are indistinguishable from real connectivity failures
                   and would cause false positives. Requires a server-side
                   proxy to assign reliably.
   - 'unknown'   — timed out, fetch rejected for any reason, or not yet checked

   Safety rules:
   - Never blocks page load or user-facing UI
   - Errors are swallowed (silent fail)
   - Results surface only in AIOS Inspector (dev mode) and console
   - No polling — each URL checked once per session (30-min cache)
   - 50-link cap prevents runaway memory use

   Enable Inspector to see results:
     localStorage.setItem('aios_dev','1') and reload
   Console: AIOS.LinkValidator.getSummary() / getBroken()
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Config ──────────────────────────────────────────── */

  var CHECK_TIMEOUT_MS  = 5000;           // abort per-URL check after 5s
  var QUEUE_INTERVAL_MS = 800;            // gap between checks (no hammering)
  var CACHE_TTL_MS      = 30 * 60 * 1000; // 30-min in-session cache
  var MAX_LINKS         = 50;             // safety cap on registered URLs
  var COLLECT_DELAY_MS  = 3000;           // wait after DOMContentLoaded before starting

  /* ── Status constants ────────────────────────────────── */

  var STATUS = {
    PENDING:   'pending',
    REACHABLE: 'reachable',
    BROKEN:    'broken',
    UNKNOWN:   'unknown'
  };

  /* ── State ───────────────────────────────────────────── */

  var _cache      = {};     // { url: { status, checkedAt } }
  var _queue      = [];     // URLs awaiting validation
  var _running    = false;  // queue currently processing?
  var _startTimer = null;   // deferred start handle

  /* ── Private helpers ─────────────────────────────────── */

  /**
   * Return true if a cache entry exists and is within TTL.
   */
  function _isCacheValid(entry) {
    return !!(entry && entry.status && (Date.now() - entry.checkedAt) < CACHE_TTL_MS);
  }

  /**
   * Normalize and validate a URL string.
   * Returns the trimmed URL, or null if it is not an http/https URL.
   */
  function _normalizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();
    return /^https?:\/\//i.test(url) ? url : null;
  }

  /**
   * Check a single URL via no-cors HEAD fetch.
   * Always resolves (never rejects) — returns one of the STATUS values.
   *
   * Semantics under browser CORS restrictions:
   *   resolve      → server responded (status code unreadable — CORS opaque)
   *                  → STATUS.REACHABLE
   *   AbortError   → timed out after CHECK_TIMEOUT_MS
   *                  → STATUS.UNKNOWN
   *   any rejection → TypeError, NetworkError, CORS error, etc.
   *                  Browser fetch rejections are NOT a reliable signal of a
   *                  broken link — CORS policy, browser extensions, and strict
   *                  firewalls all produce identical TypeErrors on live URLs.
   *                  → STATUS.UNKNOWN (not BROKEN)
   *   STATUS.BROKEN is reserved for server-side proxy validation (future).
   */
  function _checkUrl(url) {
    return new Promise(function(resolve) {
      var timeoutId  = null;
      var controller = null;

      // AbortController is available in all modern browsers
      try {
        controller = new AbortController();
      } catch (e) {
        controller = null;
      }

      // Set up timeout abort
      timeoutId = setTimeout(function() {
        if (controller) {
          try { controller.abort(); } catch (e) {}
        }
        resolve(STATUS.UNKNOWN);
      }, CHECK_TIMEOUT_MS);

      var fetchOpts = {
        method: 'HEAD',
        mode:   'no-cors',   // no-cors: avoids CORS preflight; response is opaque
        cache:  'no-store'
      };
      if (controller) {
        fetchOpts.signal = controller.signal;
      }

      fetch(url, fetchOpts)
        .then(function() {
          clearTimeout(timeoutId);
          resolve(STATUS.REACHABLE);
        })
        .catch(function() {
          clearTimeout(timeoutId);
          // All fetch rejections (AbortError, TypeError, NetworkError, CORS, etc.)
          // are treated as UNKNOWN — browser-only checks cannot reliably distinguish
          // a broken link from a CORS policy block or network restriction.
          resolve(STATUS.UNKNOWN);
        });
    });
  }

  /**
   * Process the queue serially: one URL at a time with QUEUE_INTERVAL_MS gap.
   * Self-terminates when queue is empty.
   */
  function _processQueue() {
    if (_running || _queue.length === 0) return;
    _running = true;

    function _next() {
      if (_queue.length === 0) {
        _running = false;
        return;
      }

      var url = _queue.shift();

      // Re-check cache — another call may have validated this URL already
      if (_isCacheValid(_cache[url])) {
        setTimeout(_next, 0);
        return;
      }

      _checkUrl(url).then(function(status) {
        try {
          _cache[url] = { status: status, checkedAt: Date.now() };

          // STATUS.BROKEN is not assigned by browser-only checks (see _checkUrl).
          // Log when a future proxy assigns it so it remains actionable.
          if (status === STATUS.BROKEN) {
            console.warn('[AIOS][LINKS] broken (proxy-confirmed): ' + url);
          }
        } catch (e) { /* swallow — never break the queue */ }

        setTimeout(_next, QUEUE_INTERVAL_MS);
      }).catch(function() {
        // _checkUrl always resolves, but guard anyway
        try {
          _cache[url] = { status: STATUS.UNKNOWN, checkedAt: Date.now() };
        } catch (e) {}
        setTimeout(_next, QUEUE_INTERVAL_MS);
      });
    }

    _next();
  }

  /**
   * Collect all external resource_link values from ISSUE_TO_CHECKLIST
   * and register them for validation.
   * Called once after DOMContentLoaded.
   */
  function _autoCollect() {
    try {
      var checklist = window.AAAI &&
                      window.AAAI.actions &&
                      window.AAAI.actions.ISSUE_TO_CHECKLIST;
      if (!checklist) return;

      var urls = [];
      for (var issue in checklist) {
        if (!checklist.hasOwnProperty(issue)) continue;
        var items = checklist[issue];
        if (!Array.isArray(items)) continue;
        for (var i = 0; i < items.length; i++) {
          var link = items[i].resource_link;
          if (link && /^https?:\/\//i.test(link)) {
            urls.push(link);
          }
        }
      }

      if (urls.length > 0) {
        LinkValidator.register(urls);
        console.log('[AIOS][LINKS] registered ' + urls.length + ' checklist links for validation');
      }
    } catch (e) {
      // Silent — never crash page load
    }
  }

  /* ── Link Validator — public API ─────────────────────── */

  var LinkValidator = {

    /**
     * Register URLs for background validation.
     * Deduplicates against queue and cache; skips non-http URLs.
     * Caps at MAX_LINKS total. Defers validation start by COLLECT_DELAY_MS.
     *
     * @param {string[]} urls
     */
    register: function(urls) {
      if (!Array.isArray(urls)) return;

      var added = 0;
      for (var i = 0; i < urls.length; i++) {
        var url = _normalizeUrl(urls[i]);
        if (!url) continue;
        if (_isCacheValid(_cache[url])) continue;  // already have fresh result
        if (_queue.indexOf(url) !== -1) continue;  // already queued

        var totalKnown = _queue.length + Object.keys(_cache).length;
        if (totalKnown >= MAX_LINKS) {
          console.warn('[AIOS][LINKS] MAX_LINKS (' + MAX_LINKS + ') reached — skipping remaining URLs');
          break;
        }

        _queue.push(url);
        added++;
      }

      // Defer validation start so page settles first
      if (added > 0 && !_running && _startTimer === null) {
        _startTimer = setTimeout(function() {
          _startTimer = null;
          _processQueue();
        }, COLLECT_DELAY_MS);
      }
    },

    /**
     * Get the validation status for a specific URL.
     * @param {string} url
     * @returns {'reachable'|'broken'|'unknown'|'pending'}
     */
    getStatus: function(url) {
      if (!url) return STATUS.UNKNOWN;
      var entry = _cache[url];
      if (_isCacheValid(entry)) return entry.status;
      return (_queue.indexOf(url) !== -1) ? STATUS.PENDING : STATUS.UNKNOWN;
    },

    /**
     * Get a summary count of all validation results.
     * @returns {{ total, reachable, broken, unknown, pending }}
     */
    getSummary: function() {
      var reachable = 0;
      var broken    = 0;
      var unknown   = 0;

      for (var url in _cache) {
        if (!_cache.hasOwnProperty(url)) continue;
        var entry = _cache[url];
        if (!_isCacheValid(entry)) continue;
        if (entry.status === STATUS.REACHABLE)     reachable++;
        else if (entry.status === STATUS.BROKEN)   broken++;
        else                                       unknown++;
      }

      var pending = _queue.length;
      return {
        total:     reachable + broken + unknown + pending,
        reachable: reachable,
        broken:    broken,
        unknown:   unknown,
        pending:   pending
      };
    },

    /**
     * Get all URLs currently flagged as broken (network-level failures).
     * @returns {string[]}
     */
    getBroken: function() {
      var broken = [];
      for (var url in _cache) {
        if (_cache.hasOwnProperty(url) &&
            _isCacheValid(_cache[url]) &&
            _cache[url].status === STATUS.BROKEN) {
          broken.push(url);
        }
      }
      return broken;
    }

  };

  /* ── Auto-collect on DOMContentLoaded ────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(_autoCollect, 0); // one tick — let all DOMContentLoaded handlers finish first
    });
  } else {
    // Already loaded (script injected late)
    setTimeout(_autoCollect, 0);
  }

  /* ── Register with AIOS ──────────────────────────────── */

  window.AIOS = window.AIOS || {};
  window.AIOS.LinkValidator = LinkValidator;

})();
