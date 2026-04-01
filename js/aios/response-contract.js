/* ══════════════════════════════════════════════════════════
   AIOS — Structured Response Contract  (Phase 47)
   Parses raw AI text responses into a structured internal
   object for consumption by chat UI, dashboard, document
   generation, and resource recommendation flows.

   DESIGN PRINCIPLES:
   - ZERO breaking changes: existing chat flow treats aiResponse
     as a string exactly as before. This module enriches, never replaces.
   - Graceful degradation: if parsing fails, the raw text is still
     usable; the contract simply returns { mode: 'conversation', raw: text }.
   - Deterministic extraction: regex-based, no AI-in-the-loop for parsing.
   - Lightweight: no dependencies, no DOM access, no side effects.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Response Modes — classifies the AI output type
     ──────────────────────────────────────────────────────── */
  var MODES = {
    CRISIS:       'crisis',        // Crisis line response detected
    REPORT:       'report',        // Full personalized benefits report
    TEMPLATE:     'template',      // Legal / career / financial template
    INTAKE:       'intake',        // Intake question (collecting profile data)
    SKILL_ACTION: 'skill_action',  // Skill-specific actionable guidance
    CONVERSATION: 'conversation'   // General conversational response
  };

  /* ────────────────────────────────────────────────────────
     Mode Detection — order matters (crisis first, always)
     ──────────────────────────────────────────────────────── */
  var CRISIS_SIGNALS = [
    '988', 'Veterans Crisis Line', 'veteranscrisisline.net',
    'Crisis Line', '838255', 'press 1'
  ];

  var TEMPLATE_TITLES = [
    'General Power of Attorney', 'Durable Power of Attorney',
    'Medical/Healthcare Power of Attorney', 'Medical Power of Attorney',
    'Living Will', 'Advance Directive', 'HIPAA Authorization',
    'Debt Hardship Letter', 'Credit Dispute Letter',
    'Budget / Financial Recovery Plan', 'VA Loan Readiness Checklist',
    'Rental Application Packet', 'Military to Civilian Skills Translator',
    'Salary Negotiation Script', 'Federal Resume (USAJobs)',
    'Resume Builder', 'LinkedIn Profile Builder',
    'Interview Prep Script (STAR Method)',
    'Nexus Letter Prep Template', 'VA Appeal Letter',
    'Records Request Letter', 'Benefits Eligibility Summary',
    'VA Claim Personal Statement', 'Last Will and Testament'
  ];

  function _detectMode(text) {
    if (!text) return MODES.CONVERSATION;

    // 1. CRISIS — always first
    var lower = text.toLowerCase();
    var crisisHits = 0;
    for (var i = 0; i < CRISIS_SIGNALS.length; i++) {
      if (lower.indexOf(CRISIS_SIGNALS[i].toLowerCase()) !== -1) crisisHits++;
    }
    if (crisisHits >= 2) return MODES.CRISIS;

    // 2. TEMPLATE — title appears on first line
    var firstLine = text.split('\n')[0].trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
    for (var t = 0; t < TEMPLATE_TITLES.length; t++) {
      if (firstLine.indexOf(TEMPLATE_TITLES[t]) !== -1) return MODES.TEMPLATE;
    }

    // 3. REPORT — structured, long, with personal data
    var headings = (text.match(/^#{1,3}\s+\S/gm) || []).length;
    var longEnough = text.length >= 800;
    var hasPersonalData = /\b\d{4}\b/.test(text) || /\b[A-Z][a-z]+,\s+[A-Z][a-z]+\b/.test(text);
    if (headings >= 3 && longEnough && hasPersonalData) return MODES.REPORT;

    // 4. INTAKE — short response with OPTIONS and a question
    var hasOptions = /\[OPTIONS:\s*.*?\]/.test(text);
    var hasQuestion = /\?\s*$|\?\s*\n/m.test(text);
    if (hasOptions && hasQuestion && text.length < 600) return MODES.INTAKE;

    // 5. SKILL_ACTION — numbered steps or "Next step:" pattern
    var hasSteps = /(?:^|\n)\s*\d+[\.\)]\s+\S/m.test(text) && text.length > 200;
    var hasNextStep = /next step/i.test(text);
    if (hasSteps || hasNextStep) return MODES.SKILL_ACTION;

    // 6. Default
    return MODES.CONVERSATION;
  }


  /* ────────────────────────────────────────────────────────
     OPTIONS Extraction
     ──────────────────────────────────────────────────────── */
  function _extractOptions(text) {
    var match = text.match(/\[OPTIONS:\s*(.*?)\]/);
    if (!match) return null;
    return match[1].split('|').map(function(o) { return o.trim(); }).filter(Boolean);
  }


  /* ────────────────────────────────────────────────────────
     Recommended Actions Extraction
     Looks for numbered steps, bullet lists with action verbs
     ──────────────────────────────────────────────────────── */
  var ACTION_VERBS = [
    'call', 'file', 'submit', 'apply', 'contact', 'visit', 'gather',
    'download', 'upload', 'request', 'schedule', 'complete', 'sign',
    'review', 'bring', 'prepare', 'check', 'register', 'enroll'
  ];

  function _extractActions(text) {
    var actions = [];
    // Numbered steps: "1. Call the VA at..."
    var stepPattern = /(?:^|\n)\s*(\d+)[\.\)]\s+(.+?)(?=\n\s*\d+[\.\)]|\n\n|$)/g;
    var match;
    while ((match = stepPattern.exec(text)) !== null) {
      var step = match[2].trim();
      if (step.length > 10 && step.length < 500) {
        var firstWord = step.split(/\s/)[0].toLowerCase().replace(/[^a-z]/g, '');
        var isAction = ACTION_VERBS.indexOf(firstWord) !== -1;
        actions.push({
          step: parseInt(match[1], 10),
          text: step,
          isAction: isAction
        });
      }
    }
    return actions.length > 0 ? actions : null;
  }


  /* ────────────────────────────────────────────────────────
     Resource Extraction
     Finds URLs and phone numbers mentioned in the response
     ──────────────────────────────────────────────────────── */
  function _extractResources(text) {
    var resources = [];

    // URLs
    var urlPattern = /(?:https?:\/\/[^\s<>)\]]+)/g;
    var urlMatch;
    while ((urlMatch = urlPattern.exec(text)) !== null) {
      resources.push({ type: 'url', value: urlMatch[0] });
    }

    // Phone numbers (US format)
    var phonePattern = /(?:1[-.])?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]\d{4}|\d{3}[-.\s]\d{4})/g;
    var phoneMatch;
    while ((phoneMatch = phonePattern.exec(text)) !== null) {
      resources.push({ type: 'phone', value: phoneMatch[0] });
    }

    return resources.length > 0 ? resources : null;
  }


  /* ────────────────────────────────────────────────────────
     Follow-Up Question Extraction
     Finds the question the AI is asking the veteran
     ──────────────────────────────────────────────────────── */
  function _extractFollowUp(text) {
    // Find the last question in the text (before OPTIONS block)
    var cleanText = text.replace(/\[OPTIONS:\s*.*?\]/g, '').trim();
    // Split into sentences using a forward-compatible loop (no lookbehind)
    var sentences = [];
    var current = '';
    for (var ci = 0; ci < cleanText.length; ci++) {
      current += cleanText[ci];
      if ((cleanText[ci] === '.' || cleanText[ci] === '!' || cleanText[ci] === '?') &&
          (ci + 1 >= cleanText.length || /\s/.test(cleanText[ci + 1]))) {
        var trimmed = current.trim();
        if (trimmed) sentences.push(trimmed);
        current = '';
      }
    }
    if (current.trim()) sentences.push(current.trim());
    // Return the last sentence containing a question mark
    for (var i = sentences.length - 1; i >= 0; i--) {
      if (sentences[i].indexOf('?') !== -1) {
        return sentences[i];
      }
    }
    return null;
  }


  /* ────────────────────────────────────────────────────────
     Risk Flag Detection
     ──────────────────────────────────────────────────────── */
  function _extractRiskFlags(text, mode) {
    var flags = [];
    if (mode === MODES.CRISIS) {
      flags.push('crisis_response');
    }
    if (/deadline|time limit|within \d+ (day|week|month|year)/i.test(text)) {
      flags.push('has_deadline');
    }
    if (/denied|denial|appeal/i.test(text)) {
      flags.push('appeal_context');
    }
    if (/homeless|evict|foreclosure/i.test(text)) {
      flags.push('housing_instability');
    }
    return flags.length > 0 ? flags : null;
  }


  /* ────────────────────────────────────────────────────────
     Summary Generation
     Produces a 1-2 sentence plain-text summary of the response
     ──────────────────────────────────────────────────────── */
  function _generateSummary(text, mode) {
    if (!text) return '';

    if (mode === MODES.CRISIS) {
      return 'Crisis support resources provided. Veterans Crisis Line: 988, Press 1.';
    }

    if (mode === MODES.TEMPLATE) {
      var title = text.split('\n')[0].trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
      return 'Generated template: ' + title;
    }

    if (mode === MODES.REPORT) {
      return 'Personalized veteran benefits report generated.';
    }

    // For conversation/intake/skill: first sentence (up to 200 chars)
    var firstSentence = text.replace(/\[OPTIONS:.*?\]/g, '').trim();
    var endIdx = firstSentence.search(/[.!?]\s/);
    if (endIdx > 0 && endIdx < 200) {
      return firstSentence.substring(0, endIdx + 1);
    }
    return firstSentence.substring(0, 200).trim();
  }


  /* ════════════════════════════════════════════════════════
     PUBLIC API — ResponseContract.parse(rawText, context)
     ════════════════════════════════════════════════════════ */

  var ResponseContract = {

    MODES: MODES,

    /**
     * Parse a raw AI response string into a structured contract object.
     *
     * @param {string} rawText — The raw text from the Claude API
     * @param {Object} [context] — Optional context for enrichment
     *   @param {Object} [context.routeResult] — Router output (intent, skill, tier)
     *   @param {Object} [context.profile] — Veteran memory profile
     *   @param {Object} [context.mission] — Active mission object
     * @returns {Object} Structured response contract
     */
    parse: function(rawText, context) {
      if (!rawText || typeof rawText !== 'string') {
        return {
          mode: MODES.CONVERSATION,
          raw: rawText || '',
          summary: '',
          options: null,
          recommended_actions: null,
          follow_up_question: null,
          resources: null,
          risk_flags: null,
          mission_signals: null,
          confidence: 0,
          missing_information: null,
          timestamp: Date.now()
        };
      }

      var ctx = context || {};
      var mode = _detectMode(rawText);

      // Build the contract
      var contract = {
        mode: mode,
        raw: rawText,
        summary: _generateSummary(rawText, mode),
        options: _extractOptions(rawText),
        recommended_actions: _extractActions(rawText),
        follow_up_question: _extractFollowUp(rawText),
        resources: _extractResources(rawText),
        risk_flags: _extractRiskFlags(rawText, mode),
        mission_signals: null,
        confidence: 0,
        missing_information: null,
        timestamp: Date.now()
      };

      // Confidence — derived from router + content quality
      if (ctx.routeResult) {
        contract.confidence = ctx.routeResult.confidence || 0;
      } else {
        // Heuristic: longer, more structured = higher confidence
        contract.confidence = Math.min(0.9,
          0.3 + (rawText.length > 500 ? 0.2 : 0) +
          (contract.recommended_actions ? 0.2 : 0) +
          (contract.resources ? 0.1 : 0) +
          (contract.options ? 0.1 : 0)
        );
      }

      // Mission signals — detect if this response suggests a mission
      contract.mission_signals = _extractMissionSignals(rawText, ctx);

      // Missing information — from skill context
      if (ctx.routeResult && ctx.routeResult.needsClarification) {
        contract.missing_information = [ctx.routeResult.clarificationQuestion];
      }

      return contract;
    },

    /**
     * Check if a contract represents an actionable response
     * (has steps, resources, or mission-relevant content).
     */
    isActionable: function(contract) {
      if (!contract) return false;
      return !!(
        contract.recommended_actions ||
        contract.mission_signals ||
        contract.mode === MODES.REPORT ||
        contract.mode === MODES.TEMPLATE ||
        contract.mode === MODES.SKILL_ACTION
      );
    },

    /**
     * Check if a contract warrants mission creation or update.
     */
    hasMissionSignal: function(contract) {
      return !!(contract && contract.mission_signals &&
        (contract.mission_signals.suggestedType || contract.mission_signals.stepUpdate));
    }
  };


  /* ────────────────────────────────────────────────────────
     Mission Signal Extraction
     Detects mission-relevant patterns in the AI response
     ──────────────────────────────────────────────────────── */
  var MISSION_KEYWORDS = {
    disability_claim: ['disability claim', 'va claim', '21-526', 'C&P exam', 'supplemental claim', 'higher-level review', 'BVA appeal', 'nexus letter'],
    education_path:   ['GI Bill', 'Post-9/11', 'VR&E', 'Voc Rehab', 'Chapter 33', 'Chapter 31', 'education benefit'],
    housing_path:     ['VA home loan', 'VA housing', 'HUD-VASH', 'SSVF', 'SAH', 'SHA', 'Certificate of Eligibility'],
    employment_transition: ['resume', 'federal resume', 'USAJobs', 'career transition', 'VETS program', 'Hire Heroes'],
    state_benefits_search: ['state benefit', 'state veteran', 'property tax exemption', 'state program']
  };

  function _extractMissionSignals(text, context) {
    if (!text) return null;
    var lower = text.toLowerCase();
    var signals = { suggestedType: null, stepUpdate: null, blockers: [] };

    // Check for mission type keywords
    var bestType = null;
    var bestCount = 0;
    var types = Object.keys(MISSION_KEYWORDS);
    for (var i = 0; i < types.length; i++) {
      var kws = MISSION_KEYWORDS[types[i]];
      var count = 0;
      for (var j = 0; j < kws.length; j++) {
        if (lower.indexOf(kws[j].toLowerCase()) !== -1) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestType = types[i];
      }
    }
    if (bestCount >= 2) {
      signals.suggestedType = bestType;
    }

    // Check for step progression language
    var nextStepMatch = text.match(/[Nn]ext step[:\s]+(.+?)(?:\.|$)/m);
    if (nextStepMatch) {
      signals.stepUpdate = {
        nextStep: nextStepMatch[1].trim().substring(0, 200)
      };
    }

    // Check for blockers
    if (/missing|need[s]?\s+(?:to|more)|don't have|haven't/i.test(text)) {
      var blockerMatch = text.match(/(?:you(?:'ll)?\s+need|missing|don't have|haven't)\s+(.+?)(?:[.!]|$)/im);
      if (blockerMatch) {
        signals.blockers.push(blockerMatch[1].trim().substring(0, 200));
      }
    }

    // Only return if there's actual signal
    if (!signals.suggestedType && !signals.stepUpdate && signals.blockers.length === 0) {
      return null;
    }
    return signals;
  }


  /* ── Register ─────────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.ResponseContract = ResponseContract;

})();
