/* ══════════════════════════════════════════════════════════
   AIOS — Proactive Suggestion Engine  (Phase 15)
   Surfaces ONE relevant next-step hint when appropriate.

   Hook strategy — no app.js changes required:
   - MutationObserver watches #btnSend[disabled] attr.
     When disabled → false, streaming just ended → evaluate().
   - Also listens for aaai:audit_completed custom event.
   - Crisis gate: checks #crisisBanner visibility before any output.

   Safety rules enforced here:
   - Never during/after crisis (crisisBanner visible)
   - Never while processing (btnSend.disabled)
   - Minimum 3 AI messages before first suggestion
   - 5-minute cooldown per suggestion type (session)
   - No fabricated eligibility — all hints are factual ranges
   - Chips visible → skip (don't stack UI layers)
   - Only ONE suggestion shown at a time, auto-dismisses in 12s
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Config ──────────────────────────────────────────── */
  var COOLDOWN_MS      = 5 * 60 * 1000;  // 5 min per suggestion type
  var MIN_AI_MSGS      = 3;              // don't suggest until 3 AI replies
  var AUTO_DISMISS_MS  = 12000;          // suggestion auto-hides after 12s
  var POST_STREAM_WAIT = 2000;           // wait after stream ends before eval

  /* ── Phase 31: Fatigue Control config ──────────────────── */
  var DISMISS_COOLDOWN_MS     = 15 * 60 * 1000; // 15 min extended cooldown after user dismissal
  var WINDOW_MS               = 15 * 60 * 1000; // rolling window size for rate-limit
  var WINDOW_MAX              = 3;              // max suggestions in any WINDOW_MS span
  var SESSION_MAX             = 10;             // absolute session cap (prevents spam)
  var DISMISS_FATIGUE_TRIGGER = 3;              // consecutive dismissals that trigger quiet period
  var DISMISS_QUIET_MS        = 10 * 60 * 1000; // quiet period length after dismissal fatigue

  /* ── State ───────────────────────────────────────────── */
  var _shown        = {};   // { suggestionId: timestamp }
  var _dismissTimer = null;
  var _evalTimer    = null;
  var _btnObserver  = null;

  /* ── Phase 31: Fatigue state ──────────────────────────── */
  var _currentId          = null; // id of the suggestion currently displayed
  var _sessionCount       = 0;    // total suggestions shown this session
  var _windowLog          = [];   // timestamps of recently shown suggestions (rolling)
  var _dismissed          = {};   // { id: { count, lastDismiss } } per suggestion id
  var _quietUntil         = 0;    // epoch ms — all suggestions suppressed until this time
  var _consecutiveDismiss = 0;    // run of consecutive user-driven dismissals

  /* ── Helpers ─────────────────────────────────────────── */
  function _el(id) { return document.getElementById(id); }

  function _isCrisisActive() {
    var b = _el('crisisBanner');
    return b && b.style.display !== 'none';
  }

  // Phase 24: suppress non-critical suggestions when AT_RISK message is visible
  function _isAtRiskActive() {
    return !!document.querySelector('#chatMessages .message--at-risk');
  }

  // Phase 24: get eligibility scores from window.AIOS.Eligibility (returns null if unavailable)
  function _getScores(profile) {
    var Elig = window.AIOS && window.AIOS.Eligibility;
    if (!Elig || !profile || !Elig.hasUsefulSignal(profile)) return null;
    return Elig.score(profile);
  }

  function _isProcessing() {
    var btn = _el('btnSend');
    return btn && btn.disabled;
  }

  function _chipsVisible() {
    var c = _el('aiosChips');
    return c && c.style.display !== 'none';
  }

  function _countAIMessages() {
    var msgs = document.querySelectorAll('#chatMessages .message--ai');
    return msgs ? msgs.length : 0;
  }

  function _cooldownOk(id) {
    var now = Date.now();
    return !_shown[id] || (now - _shown[id]) >= COOLDOWN_MS;
  }

  /* ── Phase 31: Fatigue helpers ───────────────────────── */

  /** Remove _windowLog entries older than WINDOW_MS. */
  function _trimWindowLog() {
    var cutoff = Date.now() - WINDOW_MS;
    var trimmed = [];
    for (var i = 0; i < _windowLog.length; i++) {
      if (_windowLog[i] >= cutoff) trimmed.push(_windowLog[i]);
    }
    _windowLog = trimmed;
  }

  /**
   * Check all fatigue gates. Returns false (and logs reason) when suppressed.
   * Called from _show() immediately after the existing _cooldownOk() check so
   * the existing per-type cooldown is always the first line of defence.
   *
   * Gates (in order):
   *   1. Quiet period — consecutive dismissal fatigue
   *   2. Session hard cap — SESSION_MAX total per session
   *   3. Rolling window rate limit — WINDOW_MAX per WINDOW_MS
   *   4. Per-ID dismiss cooldown — DISMISS_COOLDOWN_MS after user × dismiss
   */
  function _fatigueOk(id) {
    var now = Date.now();

    // Gate 1: quiet period from consecutive dismissal fatigue
    if (_quietUntil > now) {
      console.log('[AIOS][SUGGEST] suppressed: fatigue-cap');
      return false;
    }

    // Gate 2: session hard cap
    if (_sessionCount >= SESSION_MAX) {
      console.log('[AIOS][SUGGEST] suppressed: fatigue-cap');
      return false;
    }

    // Gate 3: rolling window rate limit
    _trimWindowLog();
    if (_windowLog.length >= WINDOW_MAX) {
      console.log('[AIOS][SUGGEST] suppressed: fatigue-cap');
      return false;
    }

    // Gate 4: per-id extended dismiss cooldown
    if (_dismissed[id] && _dismissed[id].lastDismiss) {
      if ((now - _dismissed[id].lastDismiss) < DISMISS_COOLDOWN_MS) {
        console.log('[AIOS][SUGGEST] suppressed: dismissed-recently');
        return false;
      }
    }

    return true;
  }

  /**
   * Called when the user actively clicks the × dismiss button.
   * Records per-id dismissal data, tracks consecutive dismissals, and
   * triggers a quiet period when DISMISS_FATIGUE_TRIGGER is reached.
   * Auto-dismiss (timer) calls _hide() directly and does NOT increment
   * dismissal counters — passive ignore ≠ active rejection.
   */
  function _onUserDismiss() {
    var id = _currentId;
    if (id) {
      // Record per-id dismiss
      if (!_dismissed[id]) _dismissed[id] = { count: 0, lastDismiss: 0 };
      _dismissed[id].count++;
      _dismissed[id].lastDismiss = Date.now();

      // Track consecutive dismissals → quiet period
      _consecutiveDismiss++;
      if (_consecutiveDismiss >= DISMISS_FATIGUE_TRIGGER) {
        _quietUntil = Date.now() + DISMISS_QUIET_MS;
        _consecutiveDismiss = 0; // reset after triggering so it can re-trigger later
        console.log('[AIOS][SUGGEST] suppressed: fatigue-cap (quiet period started)');
      } else {
        console.log('[AIOS][SUGGEST] dismissed: ' + id +
          ' (x' + _dismissed[id].count + ', consecutive=' + _consecutiveDismiss + ')');
      }
    }
    _hide();
  }

  /* ── Hide ────────────────────────────────────────────── */
  function _hide() {
    if (_dismissTimer) { clearTimeout(_dismissTimer); _dismissTimer = null; }
    var el = _el('aiosSuggestion');
    if (el) el.style.display = 'none';
    _currentId = null; // Phase 31: clear so _onUserDismiss can't misfire after hide
  }

  /* ── Show ────────────────────────────────────────────── */
  function _show(suggestion) {
    if (_isCrisisActive())   return;
    if (_isAtRiskActive())   return; // Phase 24: suppress during AT_RISK
    if (_isProcessing())     return;
    if (_chipsVisible())     return;
    if (!_cooldownOk(suggestion.id))  return;
    if (!_fatigueOk(suggestion.id))   return; // Phase 31: fatigue gate

    _shown[suggestion.id] = Date.now();

    // Phase 31: track session count and rolling window
    _currentId = suggestion.id;
    _sessionCount++;
    _windowLog.push(Date.now());

    var el = _el('aiosSuggestion');
    if (!el) return;

    // ── Clear and rebuild ─────────────────────────────────
    el.innerHTML = '';

    // Icon
    var icon = document.createElement('span');
    icon.className = 'aios-suggestion__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u2192'; // →
    el.appendChild(icon);

    // Text
    var textEl = document.createElement('span');
    textEl.className = 'aios-suggestion__text';
    textEl.textContent = suggestion.text;
    el.appendChild(textEl);

    // Action button (optional)
    if (suggestion.action) {
      var actionBtn = document.createElement('button');
      actionBtn.className = 'aios-suggestion__btn';
      actionBtn.type = 'button';
      actionBtn.textContent = suggestion.action.label;
      actionBtn.addEventListener('click', function() {
        _consecutiveDismiss = 0; // Phase 31: positive engagement resets dismissal counter
        _hide();
        if (!window.AIOS || !window.AIOS.Chips) return;
        if (suggestion.action.type === 'send') {
          window.AIOS.Chips.send(suggestion.action.text);
        } else if (suggestion.action.type === 'upload') {
          window.AIOS.Chips.upload();
        }
      });
      el.appendChild(actionBtn);
    }

    // Dismiss ×
    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'aios-suggestion__dismiss';
    dismissBtn.type = 'button';
    dismissBtn.setAttribute('aria-label', 'Dismiss suggestion');
    dismissBtn.innerHTML = '&times;';
    dismissBtn.addEventListener('click', _onUserDismiss); // Phase 31: track user dismissal
    el.appendChild(dismissBtn);

    el.style.display = 'flex';

    // Auto-dismiss
    if (_dismissTimer) clearTimeout(_dismissTimer);
    _dismissTimer = setTimeout(_hide, AUTO_DISMISS_MS);
  }

  /* ── Evaluate — pick the best suggestion for context ─── */
  function evaluate() {
    if (_isCrisisActive())  return;
    if (_isAtRiskActive())  return; // Phase 24: suppress during AT_RISK
    if (_isProcessing())    return;
    if (_chipsVisible())    return;

    var aiCount = _countAIMessages();
    if (aiCount < MIN_AI_MSGS) return;

    var mission = (window.AIOS && window.AIOS.Mission)
      ? (window.AIOS.Mission.current || null) : null;
    var profile = (window.AIOS && window.AIOS.Memory)
      ? window.AIOS.Memory.getProfile() : {};

    /* S0 — Pending chain step (Phase 25: skill-to-skill handoff, highest priority)
       A prior skill explicitly queued this next step — surface it immediately.
       Chain.consume() applies mission update and records anti-loop cooldown.
       The suggestion ID is chain__<nextSkill> so the existing 5-min cooldown
       system prevents the same chain from re-appearing within a session. */
    var _Chain = window.AIOS && window.AIOS.Chain;
    if (_Chain && _Chain.hasPending()) {
      var _ch = _Chain.getPending();
      var _chainId = 'chain__' + _ch.nextSkill;
      if (_cooldownOk(_chainId)) {
        _Chain.consume(); // apply mission update; record anti-loop cooldown
        _show({
          id:     _chainId,
          text:   _ch.label,
          action: { label: "Yes, let's do it", type: 'send', text: _ch.sendText }
        });
        return;
      }
    }

    /* S1 — Active mission has a clear, unstarted next step (always top priority) */
    if (mission &&
        mission.status === 'in_progress' &&
        mission.nextStep &&
        mission.nextStep !== mission.currentStep &&
        _cooldownOk('s1_mission_next')) {
      _show({
        id: 's1_mission_next',
        text: 'Next step: ' + mission.nextStep,
        action: { label: 'Help me with this', type: 'send', text: 'What should I do next?' }
      });
      return;
    }

    /* S3 — OTH discharge: factual upgrade path (high-priority regardless of scoring) */
    if (profile.dischargeStatus === 'Other Than Honorable' &&
        aiCount >= 3 &&
        _cooldownOk('s3_oth_upgrade')) {
      _show({
        id: 's3_oth_upgrade',
        text: 'Veterans with OTH discharges can apply for a Character of Discharge review.',
        action: { label: 'Learn more', type: 'send',
                  text: 'I have an Other Than Honorable discharge. What options do I have?' }
      });
      return;
    }

    // ── Phase 24: eligibility-ranked suggestion pool ────────────────────────
    // Build candidates, score each against the eligibility engine, sort by score
    // descending, fire the first that passes cooldown.  All existing safeguards
    // (cooldown, min msg count, crisis/at-risk gate) are preserved.
    // ──────────────────────────────────────────────────────────────────────────
    var scores = _getScores(profile);
    var candidates = [];

    /* S2 — state benefits */
    if (profile.state && aiCount >= 4 && !profile.currentGoals && !mission) {
      candidates.push({
        id: 's2_state_benefits',
        score: scores ? (scores.STATE_BENEFITS || 0) : 0,
        text: profile.state + ' has state-specific veteran benefits beyond federal programs.',
        action: { label: 'Check State Benefits', type: 'send',
                  text: 'What state benefits am I eligible for?' }
      });
    }

    /* S4 — VA rating increase */
    if (profile.vaRating !== null && profile.vaRating !== undefined &&
        profile.vaRating < 100 && aiCount >= 5) {
      candidates.push({
        id: 's4_rating_increase',
        score: scores ? (scores.VA_DISABILITY || 0) : 0,
        text: 'At ' + profile.vaRating + '%, you may qualify for a higher combined rating.',
        action: { label: 'Explore this', type: 'send',
                  text: 'I want to explore increasing my disability rating' }
      });
    }

    /* S6 — VR&E (Phase 24: new — high value when VA rating ≥ 10 + employment need) */
    if (profile.vaRating !== null && profile.vaRating !== undefined &&
        profile.vaRating >= 10 &&
        (profile.employmentStatus === 'unemployed' ||
         profile.employmentStatus === 'job searching' ||
         profile.employmentStatus === 'disabled') &&
        aiCount >= 4) {
      candidates.push({
        id: 's6_vre',
        score: scores ? (scores.VR_E || 0) : 0,
        text: 'Your disability rating may qualify you for VA Vocational Rehab — education and job training paid by VA.',
        action: { label: 'Learn about VR&E', type: 'send',
                  text: 'Tell me about VA Vocational Rehabilitation and Employment (VR&E)' }
      });
    }

    /* S7 — Employment support (Phase 24: new — for job seekers without a mission) */
    if ((profile.employmentStatus === 'unemployed' ||
         profile.employmentStatus === 'job searching') &&
        aiCount >= 4 && !mission) {
      candidates.push({
        id: 's7_employment',
        score: scores ? (scores.EMPLOYMENT_SUPPORT || 0) : 0,
        text: 'VA employment programs offer free job placement support, resume help, and hiring preference.',
        action: { label: 'Explore options', type: 'send',
                  text: 'What employment support programs are available for veterans?' }
      });
    }

    /* S5 — stuck nudge (fallback — fires only when no scored candidate qualifies) */
    if (aiCount >= 6 && !mission && !profile.branch && !profile.currentGoals) {
      candidates.push({
        id: 's5_stuck_nudge',
        score: 0.1, // fixed low — intentional fallback
        text: 'Not sure where to start? I can map out your best benefits path.',
        action: { label: 'Find My Benefits', type: 'send',
                  text: 'What benefits am I eligible for?' }
      });
    }

    // Phase 24 patch: only sort when at least one candidate has a real score.
    // When all scores are 0 / null (no eligibility signal), preserve the
    // original deterministic order (S2 → S4 → S6 → S7 → S5) so behavior is
    // stable and predictable across sessions with empty profiles.
    var hasSignal = false;
    for (var si = 0; si < candidates.length; si++) {
      if (candidates[si].score && candidates[si].score > 0) {
        hasSignal = true;
        break;
      }
    }
    if (hasSignal) {
      candidates.sort(function(a, b) { return b.score - a.score; });
    }
    // else: retain insertion order (S2 → S4 → S6 → S7 → S5)
    for (var ci = 0; ci < candidates.length; ci++) {
      var c = candidates[ci];
      if (_cooldownOk(c.id)) {
        _show(c);
        return;
      }
    }
  }

  /* ── Debounce evaluate calls ─────────────────────────── */
  function _scheduleEvaluate(delayMs) {
    if (_evalTimer) { clearTimeout(_evalTimer); _evalTimer = null; }
    _evalTimer = setTimeout(evaluate, delayMs || POST_STREAM_WAIT);
  }

  /* ── Watch btnSend[disabled] — fires when stream ends ── */
  // btnSend is re-enabled in sendToAI's onComplete callback,
  // which runs after streamMessage fully renders the AI reply.
  function _watchBtnSend() {
    var btn = _el('btnSend');
    if (!btn) return;

    var wasDiabled = btn.disabled;

    _btnObserver = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'disabled') {
          var nowDisabled = btn.disabled;
          if (wasDiabled && !nowDisabled) {
            // disabled → enabled: streaming just ended
            _scheduleEvaluate(POST_STREAM_WAIT);
          }
          wasDiabled = nowDisabled;
          break;
        }
      }
    });

    _btnObserver.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
  }

  /* ── Custom event listeners ──────────────────────────── */
  function _startEventListeners() {
    // Clear suggestion when user begins a new audit interaction
    window.addEventListener('aaai:audit_started', function() {
      _hide();
    });

    // Evaluate after an audit completes — user likely ready for next step
    window.addEventListener('aaai:audit_completed', function() {
      _scheduleEvaluate(3000);
    });

    // Crisis detected externally → hide immediately
    window.addEventListener('aaai:crisis_detected', function() {
      _hide();
    });
  }

  /* ── Init ────────────────────────────────────────────── */
  function _init() {
    _watchBtnSend();
    _startEventListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ── Public API ─────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.Suggestions = {
    evaluate     : evaluate,
    hide         : _hide,
    // Phase 31: QA / testing helpers
    resetFatigue : function() {
      _sessionCount = 0; _windowLog = []; _dismissed = {};
      _quietUntil = 0; _consecutiveDismiss = 0; _currentId = null;
    },
    getFatigueState : function() {
      return {
        sessionCount: _sessionCount, windowLog: _windowLog.slice(),
        dismissed: _dismissed, quietUntil: _quietUntil,
        consecutiveDismiss: _consecutiveDismiss
      };
    }
  };

})();
