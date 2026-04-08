/* ══════════════════════════════════════════════════════════
   AIOS — Request Builder
   Assembles the final prompt payload from core prompt,
   selected skill, memory context, page context, and user
   input. Output is a structured object ready for the app's
   AI request pipeline (not yet wired).
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Phase 28: Prompt / Token Budget Control ────────────
     Safe character budget for the assembled system prompt.
     Trimming is applied in priority order (lowest first)
     before the final system string is returned.
     Sections NEVER trimmed: core prompt, escalation tier,
     active mission steps (currentStep/nextStep), crisis block.
     ──────────────────────────────────────────────────────── */
  var MAX_PROMPT_LENGTH = 15000; // characters (~3,750 tokens est.) — raised to accommodate uploaded document extracted text for inline generation

  /**
   * Enforce the prompt character budget by removing or shrinking
   * lower-priority sections. Operates on a shallow copy — the
   * original `parts` array is never mutated.
   *
   * Trim order (lowest priority first):
   *   1. Eligibility block         (## ELIGIBILITY CONTEXT)
   *   2. Soft memory fields        (## VETERAN CONTEXT — keep only core identity)
   *   3. Mission blockers line     (## ACTIVE MISSION — keep steps)
   *   4. Page context              (## PAGE CONTEXT)
   *   5. Skill hints               (## SKILL HINTS)
   *   6. Skill prompt              (non-## part at index > 0)
   *
   * Sections NEVER touched: index 0 (core), ## ESCALATION TIER,
   *   ## ACTIVE MISSION currentStep/nextStep, ## CRISIS DETECTED.
   *
   * @param  {string[]} parts  The systemParts array as built
   * @returns {{ parts: string[], wasTrimmed: boolean, trimmedSections: string[] }}
   */
  function _applyPromptBudget(parts) {
    var joined = parts.join('\n\n');
    if (joined.length <= MAX_PROMPT_LENGTH) {
      return { parts: parts, wasTrimmed: false, trimmedSections: [] };
    }

    var work    = parts.slice(); // shallow copy — never mutate caller's array
    var removed = [];

    /* Under-budget predicate */
    function _under() {
      return work.join('\n\n').length <= MAX_PROMPT_LENGTH;
    }

    /* Remove a whole section identified by its ## header prefix */
    function _removeSection(headerPrefix, label) {
      if (_under()) return;
      for (var i = 0; i < work.length; i++) {
        if (work[i].indexOf(headerPrefix) === 0) {
          work.splice(i, 1);
          removed.push(label);
          return;
        }
      }
    }

    /* ── Pass 1: Remove eligibility block (lowest priority) ── */
    _removeSection('## ELIGIBILITY CONTEXT', 'eligibility');

    /* ── Pass 1.5: Remove resource context (Phase 43) ────────
       Lower value than eligibility under budget pressure because
       eligibility drives direct benefit routing; resource context
       is supplemental category guidance.                       */
    _removeSection('## RESOURCE CONTEXT', 'resource-context');

    /* ── Pass 1.6: Remove prior document context (Phase 6) ───
       Session continuity is helpful but not required for core
       benefit routing; trimmed after resource context.         */
    _removeSection('## PRIOR DOCUMENTS', 'prior-documents');

    /* ── Pass 2: Strip soft memory fields ────────────────────
       Keep only: header, Name, Branch, Era, Discharge, VA Rating.
       Remove: State, Employment, Goals, Needs, PrimaryNeed.
       If nothing worthwhile remains, remove the block entirely. */
    if (!_under()) {
      for (var mi = 0; mi < work.length; mi++) {
        if (work[mi].indexOf('## VETERAN CONTEXT') === 0) {
          var memLines = work[mi].split('\n');
          var coreLines = memLines.filter(function(line) {
            return line === '## VETERAN CONTEXT' ||
                   line.indexOf('- Name:')      === 0 ||
                   line.indexOf('- Branch:')    === 0 ||
                   line.indexOf('- Era:')       === 0 ||
                   line.indexOf('- Discharge:') === 0 ||
                   line.indexOf('- VA Rating:') === 0;
          });
          if (coreLines.length < memLines.length) {
            if (coreLines.length > 1) {
              // At least one data field survives
              work[mi] = coreLines.join('\n');
              removed.push('memory-soft-fields');
            } else {
              // Only the header survived — remove entire block
              work.splice(mi, 1);
              removed.push('memory');
            }
          }
          break;
        }
      }
    }

    /* ── Pass 3: Strip non-critical mission fields ────────────
       Remove the "- Blockers:" line only.
       currentStep and nextStep are protected (never removed). */
    if (!_under()) {
      for (var si = 0; si < work.length; si++) {
        if (work[si].indexOf('## ACTIVE MISSION') === 0) {
          var msnLines = work[si].split('\n');
          var stripped = msnLines.filter(function(line) {
            return line.indexOf('- Blockers:') !== 0;
          });
          if (stripped.length < msnLines.length) {
            work[si] = stripped.join('\n');
            removed.push('mission-blockers');
          }
          break;
        }
      }
    }

    /* ── Pass 4: Remove page context ─────────────────────── */
    _removeSection('## PAGE CONTEXT', 'page-context');

    /* ── Pass 4.5: Remove confidence context (Phase 29) ──── */
    _removeSection('## CONFIDENCE CONTEXT', 'confidence-context');

    /* ── Pass 5: Remove skill hints (medium priority) ─────── */
    _removeSection('## SKILL HINTS', 'skill-hints');

    /* ── Pass 6: Remove skill prompt (medium — last resort) ──
       Skill prompt: the only non-## part at index > 0.
       Index 0 (core prompt) and all ## blocks are protected.
       ## ESCALATION TIER and ## CRISIS DETECTED never reached
       by this pass because they start with '## '. */
    if (!_under()) {
      for (var pi = 1; pi < work.length; pi++) {
        if (work[pi].indexOf('## ') !== 0) {
          work.splice(pi, 1);
          removed.push('skill-prompt');
          break;
        }
      }
    }

    var wasTrimmed = removed.length > 0;
    if (wasTrimmed) {
      console.log(
        '[AIOS][TRIM] removed: ' + removed.join(', ') +
        ' | ' + joined.length + ' → ' + work.join('\n\n').length + ' chars'
      );
    }

    return { parts: work, wasTrimmed: wasTrimmed, trimmedSections: removed };
  }

  /* ── Phase 29: Confidence Signaling ────────────────────────
     Composite confidence level derived from real available signals.
     Levels: 'high' | 'medium' | 'low'
     Internals never exposed to users.
     CRISIS / AT_RISK flows: confidence block is suppressed entirely.
     ──────────────────────────────────────────────────────── */

  /**
   * Compute a composite AIOS confidence level from available signals.
   * Uses only real observed data — nothing fabricated.
   *
   * Scoring (internal points):
   *   Router confidence ≥ 0.8   → +2 (strong keyword match)
   *   Router confidence ≥ 0.4   → +1 (general fallback)
   *   Memory core fields ≥ 4    → +2 (rich profile)
   *   Memory core fields ≥ 2    → +1 (partial profile)
   *   Eligibility signal present → +1
   *   Active mission + currentStep → +1
   *
   * Thresholds:
   *   high   ≥ 4
   *   medium ≥ 2
   *   low    < 2
   *
   * @param  {Object} opts - same opts as buildAIOSRequest
   * @param  {string} tier - 'CRISIS' | 'AT_RISK' | 'STANDARD'
   * @returns {{ level: string, signals: string[] }}
   */
  function _scoreConfidence(opts, tier) {
    var points  = 0;
    var signals = [];

    /* ── Router confidence ─────────────────────────────────
       1.0 = CRISIS exact match  (safety flow — never used for confidence)
       0.9 = AT_RISK exact match (safety flow)
       0.8 = specific keyword match
       0.4 = general question fallback
       0.2 = very short / unclear input                    */
    var routerConf = (opts.routeResult && typeof opts.routeResult.confidence === 'number')
                     ? opts.routeResult.confidence : 0;
    if (routerConf >= 0.8) {
      points += 2; signals.push('strong-intent-match');
    } else if (routerConf >= 0.4) {
      points += 1; signals.push('general-intent');
    } else {
      signals.push('unclear-intent');
    }

    /* ── Memory completeness ────────────────────────────────
       Count core identity fields only (branch, era, discharge,
       vaRating, state) — these are the most reliable signals. */
    var _mem = opts.memoryContext;
    var _memFields = 0;
    if (_mem) {
      if (_mem.branch)          _memFields++;
      if (_mem.serviceEra)      _memFields++;
      if (_mem.dischargeStatus) _memFields++;
      if (_mem.vaRating !== null && _mem.vaRating !== undefined) _memFields++;
      if (_mem.state)           _memFields++;
    }
    if (_memFields >= 4) {
      points += 2; signals.push('rich-profile');
    } else if (_memFields >= 2) {
      points += 1; signals.push('partial-profile');
    } else if (_memFields === 1) {
      signals.push('sparse-profile');
    } else {
      signals.push('no-profile');
    }

    /* ── Eligibility signal ─────────────────────────────────
       Presence of a scoreable field (branch, discharge, rating,
       state, or employment) confirms real veteran context.    */
    var _EligC = window.AIOS && window.AIOS.Eligibility;
    if (_EligC && _mem && _EligC.hasUsefulSignal(_mem)) {
      points += 1; signals.push('eligibility-signal');
    }

    /* ── Mission clarity ────────────────────────────────────
       Active mission with a defined currentStep signals that
       AIOS has structured context about the veteran's workflow. */
    var _MisC = window.AIOS && window.AIOS.Mission;
    if (_MisC && _MisC.current) {
      if (_MisC.current.currentStep) {
        points += 1; signals.push('mission-active');
      } else {
        signals.push('mission-incomplete');
      }
    }

    /* ── Bucket ─────────────────────────────────────────── */
    var level = points >= 4 ? 'high' : (points >= 2 ? 'medium' : 'low');

    return { level: level, signals: signals };
  }

  /* ════════════════════════════════════════════════════════ */

  var RequestBuilder = {

    /**
     * Build a complete AIOS request payload.
     *
     * @param {Object} opts
     * @param {string}  opts.userMessage   - The veteran's current message
     * @param {Object}  [opts.routeResult] - Output from Router.routeAIOSIntent()
     * @param {Object}  [opts.skillConfig] - Output from skill.run() — { prompt, data }
     * @param {Object}  [opts.memoryContext] - From MemoryManager — veteran profile snapshot
     * @param {Object}  [opts.pageContext]  - Page-level context (e.g. current page, active topics)
     * @returns {Object} { system, messages, meta }
     */
    buildAIOSRequest: function(opts) {
      opts = opts || {};

      // ── 1. Assemble system prompt ──────────────────────
      var systemParts = [];

      // Core prompt (always present)
      var CorePrompt = window.AIOS && window.AIOS.CorePrompt;
      var coreText = CorePrompt ? CorePrompt.getAIOSCorePrompt() : '';
      if (coreText) {
        systemParts.push(coreText);
      }

      // Skill prompt (if a skill was activated)
      if (opts.skillConfig && opts.skillConfig.prompt) {
        systemParts.push(opts.skillConfig.prompt);
      }

      // Escalation tier — Phase 22
      // Source: routeResult.tier set by Router ('CRISIS' | 'AT_RISK' | 'STANDARD').
      // Injected only when tier is non-standard so standard flows have no extra noise.
      var _tier = (opts.routeResult && opts.routeResult.tier) || 'STANDARD';
      if (_tier !== 'STANDARD') {
        systemParts.push('## ESCALATION TIER\n- Tier: ' + _tier);
      }

      // Phase 7: Response Format — action-first execution-linked output.
      // Injected for STANDARD tier only. CRISIS / AT_RISK flows use direct
      // safety responses and must not be constrained by this format.
      // Not subject to budget trimming (_removeSection only targets named headers).
      // Primary execution URL from the router result is surfaced as a hint when
      // the intent maps to a specific execution page.
      if (_tier === 'STANDARD') {
        var _executionUrl = opts.routeResult && opts.routeResult.executionUrl;
        var _rfLines = [
          '## RESPONSE FORMAT',
          'When your response contains actionable recommendations, structure it exactly as:',
          '',
          '**Top Actions for You**',
          '',
          '**[Action Title]**',
          'Why it fits: [one-line reason tied to what the veteran said]',
          'Next step: [specific immediate action — a call, a form, a page to visit]',
          '→ [label](URL)',
          '',
          '**[Next Action Title]**',
          'Why it fits: [one-line reason]',
          'Next step: [specific immediate action]',
          '→ [label](URL)',
          '',
          '(3–5 actions max. Never more.)',
          '',
          'FORMAT RULES:',
          '- Lead with the highest-impact action. Order by impact descending.',
          '- One-line reason only. No paragraphs, no preamble before the action list.',
          '- Every action with a matching execution page MUST include a → link.',
          '- No generic advice ("consider your options", "it depends on your situation").',
          '- After the action list, one short follow-up paragraph is allowed (3 sentences max).',
          '',
          'EXECUTION PAGES — use these links exactly (never invent or modify URLs):'
        ];
        if (_executionUrl) {
          _rfLines.push('Primary page for this conversation: ' + _executionUrl);
        }
        _rfLines.push('- See all benefits → /hidden-benefits.html?auto=1&goal=see_everything');
        _rfLines.push('- Find money-saving programs → /financial-optimization.html?auto=1&goal=lower_bills');
        _rfLines.push('- Help with debt → /financial-optimization.html?auto=1&goal=reduce_debt&situation=employed');
        _rfLines.push('- All financial options → /financial-optimization.html?auto=1&goal=see_everything');
        _rfLines.push('- Emergency financial aid → /emergency-assistance.html?auto=1&need=financial&urgency=immediate');
        _rfLines.push('- Emergency housing help → /emergency-assistance.html?auto=1&need=housing&urgency=immediate');
        _rfLines.push('- Mental health crisis support → /emergency-assistance.html?auto=1&need=mental_health&urgency=immediate');
        _rfLines.push('- Food assistance → /emergency-assistance.html?auto=1&need=food&urgency=soon');
        _rfLines.push('- Outdoor recreation programs → /outdoor-recreation.html?auto=1&goal=parks_access');
        _rfLines.push('- Adaptive sports and fitness → /outdoor-recreation.html?auto=1&goal=adaptive');
        _rfLines.push('- Get a contractor or federal job → /contractor-careers.html?auto=1&goal=get_hired');
        _rfLines.push('- SkillBridge program → /contractor-careers.html?auto=1&goal=skillbridge');
        _rfLines.push('');
        _rfLines.push('SKIP this format for: crisis responses, single clarifying questions, or intake-only turns where you are asking for profile information.');
        systemParts.push(_rfLines.join('\n'));
      }

      // Memory context (veteran profile snapshot)
      // Phase 17: added employmentStatus, currentGoals
      // Phase 18: removed activeMissions (now owned by ## ACTIVE MISSION block below)
      if (opts.memoryContext) {
        var mem = opts.memoryContext;
        var profileLines = ['## VETERAN CONTEXT'];
        if (mem.name)             profileLines.push('- Name: ' + mem.name);
        if (mem.branch)           profileLines.push('- Branch: ' + mem.branch);
        if (mem.serviceEra)       profileLines.push('- Era: ' + mem.serviceEra);
        if (mem.dischargeStatus)  profileLines.push('- Discharge: ' + mem.dischargeStatus);
        if (mem.vaRating !== null && mem.vaRating !== undefined)
                                  profileLines.push('- VA Rating: ' + mem.vaRating + '%');
        if (mem.state)            profileLines.push('- State: ' + mem.state);
        if (mem.employmentStatus) profileLines.push('- Employment: ' + mem.employmentStatus);
        if (mem.currentGoals)     profileLines.push('- Current goal: ' + mem.currentGoals);
        // activeMissions string omitted — Phase 18 ## ACTIVE MISSION block is the canonical source
        if (mem.primaryNeed)      profileLines.push('- Primary need: ' + mem.primaryNeed);
        if (mem.needs && mem.needs.length)
                                  profileLines.push('- Needs: ' + mem.needs.join(', '));
        // Only inject if at least one real field was collected
        if (profileLines.length > 1) {
          systemParts.push(profileLines.join('\n'));
        }
      }

      // Resource context — Phase 43
      // Source: window.AIOS.Resources.getPriority() using current memory profile.
      // Injected when at least one resource category matches the veteran's profile.
      // Top 4 priority categories shown with scope label so AI can focus its recommendations.
      // Omitted entirely when no profile data is present (nothing to score against).
      var _Resources = window.AIOS && window.AIOS.Resources;
      var _hasResourceCtx = false; // hoisted for meta access below
      if (_Resources && opts.memoryContext) {
        try {
          var _resPriority = _Resources.getPriority(opts.memoryContext);
          if (_resPriority && _resPriority.length > 0) {
            var _resLines = ['## RESOURCE CONTEXT'];
            var _topRes = _resPriority.slice(0, 4);
            for (var _ri = 0; _ri < _topRes.length; _ri++) {
              _resLines.push('- [' + _topRes[_ri].scope.toUpperCase() + '] ' + _topRes[_ri].label);
            }
            if (opts.memoryContext.state) {
              _resLines.push('- State context: ' + opts.memoryContext.state + ' (state-specific programs may apply)');
            }
            _resLines.push('Use these categories to guide your recommendations and structure any report sections.');
            systemParts.push(_resLines.join('\n'));
            _hasResourceCtx = true;
          }
        } catch (_resErr) { /* skip if resource mapper unavailable */ }
      }

      // Prior document continuity — Phase 6
      // Source: window.AIOS._priorDocSummary — compact array set once in
      // _initCaseModel() when an authenticated user resumes a case.
      // Fields: type, file, status only — no extracted text injected.
      // Capped at 10 items. Omitted for new users and anonymous sessions.
      // Prevents AI from asking the veteran to re-upload documents already on file.
      var _priorDocs = window.AIOS && window.AIOS._priorDocSummary;
      var _hasPriorDocCtx = false; // hoisted for meta access below
      if (_priorDocs && _priorDocs.length > 0) {
        var _pdLines = ['## PRIOR DOCUMENTS'];
        _pdLines.push('The following documents were uploaded by this veteran in a prior session:');
        for (var _pdi = 0; _pdi < _priorDocs.length; _pdi++) {
          var _pd = _priorDocs[_pdi];
          _pdLines.push('- ' + _pd.type + ': ' + _pd.file + ' (' + _pd.status + ')');
        }
        _pdLines.push('Do not ask the veteran to re-upload documents already on file. Reference them naturally when relevant.');
        systemParts.push(_pdLines.join('\n'));
        _hasPriorDocCtx = true;
      }

      // Eligibility context — Phase 23
      // Source: window.AIOS.Eligibility.score() using current memory profile.
      // Injected only when the profile has at least one scoring signal.
      // Block is compact — high/moderate buckets only, no raw numbers.
      // Omitted entirely for empty or near-empty profiles to avoid prompt noise.
      var _Eligibility = window.AIOS && window.AIOS.Eligibility;
      var _eligSummary = null; // hoisted for meta access below
      if (_Eligibility && opts.memoryContext && _Eligibility.hasUsefulSignal(opts.memoryContext)) {
        var _eligScores = _Eligibility.score(opts.memoryContext);
        _eligSummary    = _Eligibility.buildSummary(_eligScores, 0.50);
        if (_eligSummary) {
          systemParts.push(_eligSummary);
        }
      }

      // Active mission — Phase 18: single canonical mission-summary layer.
      // Source: window.AIOS.Mission.current (normalized mission object from mission-manager.js).
      // Fields: mission name/type, status, currentStep, nextStep, blockers.
      // Omits entirely when no mission is running.
      // activeMissions string removed from ## VETERAN CONTEXT above to prevent duplication.
      var _Mission = window.AIOS && window.AIOS.Mission;
      if (_Mission && _Mission.current) {
        var _mc = _Mission.current;
        var missionLines = ['## ACTIVE MISSION'];
        missionLines.push('- Mission: '      + (_mc.name || _mc.type || 'unknown'));
        missionLines.push('- Status: '       + (_mc.status || 'active'));
        if (_mc.currentStep) missionLines.push('- Current step: ' + _mc.currentStep);
        if (_mc.nextStep)    missionLines.push('- Next step: '    + _mc.nextStep);
        if (Array.isArray(_mc.blockers) && _mc.blockers.length > 0) {
          missionLines.push('- Blockers: ' + _mc.blockers.join('; '));
        } else {
          missionLines.push('- Blockers: none');
        }
        systemParts.push(missionLines.join('\n'));
      }

      // Phase 7: Dashboard state — full continuity context from Supabase.
      // Source: window.AIOS._dashboardContext — set by _loadDashboardContext() in app.js
      // after _initCaseModel() resolves. Contains missions, checklist progress,
      // reports, generated docs, and uploaded docs. Gives the AI full session
      // continuity so it never asks "what are you working on?" when the dashboard
      // already has the answer.
      var _dashCtx = window.AIOS && window.AIOS._dashboardContext;
      if (_dashCtx) {
        var dsLines = ['## DASHBOARD STATE (loaded from database)'];

        // Missions summary (supplements ## ACTIVE MISSION with broader view)
        if (_dashCtx.missions && _dashCtx.missions.length > 0) {
          dsLines.push('Active missions (' + _dashCtx.missions.length + '):');
          for (var _mi = 0; _mi < _dashCtx.missions.length; _mi++) {
            var _mm = _dashCtx.missions[_mi];
            var _mLine = '- ' + (_mm.name || _mm.type) + ' (' + _mm.status + ')';
            if (_mm.currentStep) _mLine += ' — current step: ' + _mm.currentStep;
            if (_mm.blockers)    _mLine += ' — blockers: ' + _mm.blockers;
            dsLines.push(_mLine);
          }
        }

        // Checklist progress
        if (_dashCtx.checklist && _dashCtx.checklist.total > 0) {
          var _cl = _dashCtx.checklist;
          dsLines.push('Checklist progress: ' + _cl.completed + '/' + _cl.total + ' completed' +
            (_cl.in_progress > 0 ? ', ' + _cl.in_progress + ' in progress' : '') +
            (_cl.blocked > 0 ? ', ' + _cl.blocked + ' blocked' : ''));
          if (_cl.items && _cl.items.length > 0) {
            dsLines.push('Recent items:');
            for (var _ci = 0; _ci < _cl.items.length; _ci++) {
              var _it = _cl.items[_ci];
              dsLines.push('  - [' + _it.status + '] ' + _it.title);
            }
          }
        }

        // Uploaded documents — include extracted text when available so the AI
        // can USE document content for inline generation (resume, will, etc.)
        // without re-asking the veteran for information already on file.
        if (_dashCtx.uploadedDocs && _dashCtx.uploadedDocs.length > 0) {
          dsLines.push('Uploaded documents (' + _dashCtx.uploadedDocs.length + '):');
          for (var _di = 0; _di < _dashCtx.uploadedDocs.length; _di++) {
            var _ud = _dashCtx.uploadedDocs[_di];
            dsLines.push('- ' + _ud.type + ': ' + _ud.file + ' (' + _ud.status + ')');
            if (_ud.extracted_text) {
              // Cap each document to ~2000 chars to stay within prompt budget
              var _docText = _ud.extracted_text.length > 2000
                ? _ud.extracted_text.substring(0, 2000) + '\n[... truncated — ' + _ud.extracted_text.length + ' chars total]'
                : _ud.extracted_text;
              dsLines.push('  Extracted content:\n  ' + _docText.replace(/\n/g, '\n  '));
            }
          }
          dsLines.push('USE this document content to pre-fill templates and skip questions the veteran already answered via uploads.');
        }

        // Generated reports
        if (_dashCtx.reports && _dashCtx.reports.length > 0) {
          dsLines.push('Generated reports (' + _dashCtx.reports.length + '):');
          for (var _ri = 0; _ri < _dashCtx.reports.length; _ri++) {
            var _rp = _dashCtx.reports[_ri];
            dsLines.push('- ' + _rp.type + ': ' + _rp.title);
          }
        }

        // Generated documents/templates
        if (_dashCtx.generatedDocs && _dashCtx.generatedDocs.length > 0) {
          dsLines.push('Generated documents (' + _dashCtx.generatedDocs.length + '):');
          for (var _gi = 0; _gi < _dashCtx.generatedDocs.length; _gi++) {
            var _gd = _dashCtx.generatedDocs[_gi];
            dsLines.push('- ' + _gd.type + ': ' + _gd.title);
          }
        }

        if (dsLines.length > 1) {
          systemParts.push(dsLines.join('\n'));
        }
      }

      // Page context (current page, active topics, etc.)
      if (opts.pageContext) {
        var pageLines = ['## PAGE CONTEXT'];
        if (opts.pageContext.page)   pageLines.push('- Page: ' + opts.pageContext.page);
        if (opts.pageContext.topics && opts.pageContext.topics.length) {
          pageLines.push('- Active topics: ' + opts.pageContext.topics.join(', '));
        }
        if (opts.pageContext.inputMode) {
          pageLines.push('- Input mode: ' + opts.pageContext.inputMode);
        }
        if (pageLines.length > 1) {
          systemParts.push(pageLines.join('\n'));
        }
      }

      // Skill data hints (unknownFields, topCategories, etc.)
      if (opts.skillConfig && opts.skillConfig.data) {
        var d = opts.skillConfig.data;
        var hintLines = ['## SKILL HINTS'];
        var hasHints = false;

        if (d.unknownFields && d.unknownFields.length) {
          hintLines.push('- Unknown context fields: ' + d.unknownFields.join(', '));
          hintLines.push('- These are helpful but NOT required before responding. Ask naturally if needed.');
          hasHints = true;
        }

        // Phase 24: eligibility-ranked top categories
        // Only injected when benefit-path-finder (or any skill) populates topCategories.
        if (d.topCategories && d.topCategories.length) {
          hintLines.push('- Prioritize these benefit categories for this veteran: ' + d.topCategories.join(', '));
          hasHints = true;
        }

        if (hasHints) {
          systemParts.push(hintLines.join('\n'));
        }

        if (d.crisisDetected) {
          systemParts.push('## CRISIS DETECTED\nProvide Veterans Crisis Line (988, press 1) immediately.');
        }
      }

      // ── Phase 29: Confidence scoring ──────────────────────
      // _scoreConfidence reads opts + live AIOS modules — call after
      // all systemParts are assembled so eligibility/mission are resolved.
      var _conf = _scoreConfidence(opts, _tier);
      // Phase 32: Telemetry — record low-confidence events (STANDARD only)
      if (_conf.level === 'low' && _tier === 'STANDARD' &&
          window.AIOS && window.AIOS.Telemetry) {
        window.AIOS.Telemetry.record('low_confidence', { signals: _conf.signals });
      }
      // Inject ## CONFIDENCE CONTEXT only for low-confidence STANDARD flows.
      // Never inject for CRISIS or AT_RISK — must not weaken safety responses.
      if (_conf.level === 'low' && _tier === 'STANDARD') {
        systemParts.push(
          '## CONFIDENCE CONTEXT\n' +
          '- Limited veteran profile data available. Ask natural clarifying questions if more context would improve your recommendation.'
        );
      }

      // ── Phase 28: Apply prompt budget before joining ──────
      var _budget      = _applyPromptBudget(systemParts);
      var _finalParts  = _budget.parts;
      var _wasTrimmed  = _budget.wasTrimmed;
      var _trimmedSecs = _budget.trimmedSections;
      // Phase 32: Telemetry — record when the prompt is trimmed for budget reasons
      if (_wasTrimmed && window.AIOS && window.AIOS.Telemetry) {
        window.AIOS.Telemetry.record('prompt_trimmed', { sections: _trimmedSecs });
      }

      var system = _finalParts.join('\n\n');

      // ── 2. Build messages array ────────────────────────
      var messages = [];
      if (opts.userMessage) {
        messages.push({ role: 'user', content: opts.userMessage });
      }

      // ── 3. Assemble meta (for logging / inspection) ───
      var meta = {
        intent: (opts.routeResult && opts.routeResult.intent) || 'GENERAL_QUESTION',
        skill: (opts.routeResult && opts.routeResult.skill) || null,
        confidence: (opts.routeResult && opts.routeResult.confidence) || 0,
        matched: (opts.routeResult && opts.routeResult.matched) || null,
        escalationTier: _tier,                        // Phase 22
        hasEligibilityContext: !!(_eligSummary),      // Phase 23
        hasResourceContext: !!_hasResourceCtx,        // Phase 43
        hasPriorDocContext: !!_hasPriorDocCtx,        // Phase 6
        hasMemory: !!opts.memoryContext,
        hasMission: !!(_Mission && _Mission.current),
        hasPageContext: !!opts.pageContext,
        systemPromptLength: system.length,
        wasTrimmed: _wasTrimmed,                      // Phase 28
        trimmedSections: _trimmedSecs,                // Phase 28
        confidenceLevel:   _conf.level,               // Phase 29
        confidenceSignals: _conf.signals,             // Phase 29
        hasExecutionUrl: !!(opts.routeResult && opts.routeResult.executionUrl)  // Phase 7
      };

      return {
        system: system,
        messages: messages,
        meta: meta
      };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.RequestBuilder = RequestBuilder;

})();
