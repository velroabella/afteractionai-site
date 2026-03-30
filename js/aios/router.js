/* ══════════════════════════════════════════════════════════
   AIOS — Router
   Classifies user input into an intent and selects the
   appropriate skill. V1 uses deterministic keyword matching.
   Crisis detection always runs first as an override.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Intent → Skill mapping
     ──────────────────────────────────────────────────────── */
  var INTENTS = {
    CRISIS_SUPPORT:     'crisis-support',
    AT_RISK_SUPPORT:    'crisis-support',  // Phase 22: same skill, AT_RISK tier
    BENEFITS_DISCOVERY: 'benefit-path-finder',
    DISABILITY_CLAIM:   'va-disability-claim',
    STATE_BENEFITS:     'state-benefits',
    NEXT_STEP:          'next-action-planner',
    DOCUMENT_ANALYSIS:  'document-analyzer',
    FAMILY_SURVIVOR:    'family-survivor-support',  // Phase 38
    GENERAL_QUESTION:   null   // no skill — handled by core prompt
  };

  /* ────────────────────────────────────────────────────────
     Keyword tables — order matters (checked top-to-bottom)
     Crisis is checked separately via override, not here.
     ──────────────────────────────────────────────────────── */
  var KEYWORD_RULES = [
    {
      intent: 'DISABILITY_CLAIM',
      keywords: [
        'disability claim', 'file a claim', 'va claim', 'disability rating',
        'c&p exam', 'comp and pen', 'nexus letter', 'supplemental claim',
        'higher-level review', 'board of veterans appeals', 'bva',
        'claim status', 'claim appeal', 'rating decision', 'increase my rating'
      ]
    },
    {
      intent: 'STATE_BENEFITS',
      keywords: [
        'state benefits', 'state veteran', 'property tax exemption',
        'state va', 'in-state tuition', 'license reciprocity',
        'state program', 'my state', 'state bonus'
      ]
    },
    {
      intent: 'DOCUMENT_ANALYSIS',
      keywords: [
        'upload', 'document', 'dd-214', 'dd214', 'va letter',
        'discharge papers', 'service record', 'benefit letter',
        'rating decision letter', 'medical record', 'analyze my',
        'read my', 'look at my'
      ]
    },
    {
      intent: 'NEXT_STEP',
      keywords: [
        'action plan', 'next steps', 'what should i do', 'where do i start',
        'priorities', 'checklist', 'after action', 'my report', 'summary',
        'what now', 'most important', 'first thing'
      ]
    },
    // Phase 38: Family/Survivor intent — checked before BENEFITS_DISCOVERY
    // because survivor-specific phrases are more precise; a surviving spouse
    // asking about "survivor benefits" or "champva" should never fall to
    // the generic benefits-discovery path.
    // NOTE: single-letter acronyms (DIC) are intentionally spelled out as
    // multi-word phrases to avoid false substring matches.
    {
      intent: 'FAMILY_SURVIVOR',
      keywords: [
        'surviving spouse', 'gold star', 'survivor benefits', 'survivor pension',
        'survivors pension', 'killed in action', 'killed in the line of duty',
        'died in service', 'died serving', 'fell in combat', 'fallen service member',
        'husband was killed', 'wife was killed', 'my spouse was killed',
        'husband died in', 'wife died in', 'my partner died',
        'dependency and indemnity', 'champva', 'champ va',
        'chapter 35', 'dea education', 'dependents educational assistance',
        'gold star family', 'gold star wife', 'gold star mother',
        'death benefit', 'burial allowance', 'burial benefit',
        'widow of a veteran', 'widower of a veteran',
        "i'm a family member", 'i am a family member',
        'my family lost', 'family member of a veteran',
        'caregiver stipend', 'pcafc', 'program of comprehensive assistance',
        'survivor benefit plan', 'sbp annuity',
        'taps grief', 'tragedy assistance'
      ]
    },
    {
      intent: 'BENEFITS_DISCOVERY',
      keywords: [
        'benefits', 'eligible', 'qualify', 'entitled', 'what can i get',
        'what am i eligible', 'gi bill', 'education benefits', 'healthcare',
        'housing', 'va loan', 'pension', 'aid and attendance',
        'caregiver', 'vocational rehab', 'vr&e', 'vet center'
      ]
    }
  ];

  /* ────────────────────────────────────────────────────────
     Crisis keywords — checked first, always overrides
     ──────────────────────────────────────────────────────── */
  var CRISIS_KEYWORDS = [
    'suicide', 'kill myself', 'end it all', 'want to die', 'wanna die',
    'no reason to live', 'can\'t go on', 'cannot go on', 'hopeless',
    'self-harm', 'hurt myself', 'don\'t want to be here',
    'give up on life', 'better off dead', 'end my life',
    'not worth living', 'nothing left', 'no way out'
  ];

  /* ────────────────────────────────────────────────────────
     AT_RISK keywords — Phase 22
     Checked after crisis (never fires if crisis matched).
     First-person distress signals only — no single-word terms
     that could appear in normal benefit conversations.
     ──────────────────────────────────────────────────────── */
  var AT_RISK_KEYWORDS = [
    'losing my home', 'losing my house', 'about to lose my home',
    'facing eviction', 'being evicted', 'got evicted', 'getting evicted',
    'foreclosure', "can't pay rent", "can't afford rent",
    'behind on rent', 'behind on my mortgage',
    'living in my car', 'sleeping in my car', 'sleeping outside',
    'no place to live', "i'm homeless", 'i am homeless',
    'became homeless', 'just lost my housing',
    "can't pay my bills", "can't afford food", "can't afford to eat",
    'behind on bills', 'about to lose everything', 'losing everything',
    'completely alone', 'no one to turn to',
    'no one to help me', 'nobody to help me', 'totally isolated',
    'drinking problem', 'alcohol problem', 'drug problem',
    "can't stop drinking", "i'm an addict",
    'being abused', 'domestic violence',
    'unsafe at home', 'afraid to go home'
  ];


  /* ────────────────────────────────────────────────────────
     Helpers
     ──────────────────────────────────────────────────────── */

  /**
   * Check if text contains any phrase from the list.
   * @param {string} text - lowercased user input
   * @param {string[]} phrases
   * @returns {string|null} The matched phrase, or null
   */
  function matchPhrase(text, phrases) {
    for (var i = 0; i < phrases.length; i++) {
      if (text.indexOf(phrases[i]) !== -1) {
        return phrases[i];
      }
    }
    return null;
  }

  /**
   * Build a standard routing result.
   * @param {string} intent
   * @param {number} confidence
   * @param {string|null} matched
   * @param {string} [tier] - 'CRISIS' | 'AT_RISK' | 'STANDARD' (default: 'STANDARD')
   */
  function result(intent, confidence, matched, tier) {
    return {
      intent: intent,
      skill: INTENTS[intent] || null,
      confidence: confidence,
      matched: matched || null,
      tier: tier || 'STANDARD',   // Phase 22: escalation tier
      needsClarification: false,
      clarificationQuestion: null
    };
  }


  /* ────────────────────────────────────────────────────────
     Router
     ──────────────────────────────────────────────────────── */
  var Router = {

    /** Exposed for testing / extension */
    INTENTS: INTENTS,

    /**
     * Classify user input and select the appropriate skill.
     * Crisis detection runs first as an unconditional override.
     * @param {string} userMessage
     * @param {Object} [context] - { profile, mission, history } (reserved for v2)
     * @returns {Object} { intent, skill, confidence, matched, needsClarification, clarificationQuestion }
     */
    routeAIOSIntent: function(userMessage, context) {
      if (!userMessage || typeof userMessage !== 'string') {
        return result('GENERAL_QUESTION', 0, null);
      }

      var text = userMessage.toLowerCase().trim();

      // ── 1. Crisis override (always first) ──────────────
      var crisisMatch = matchPhrase(text, CRISIS_KEYWORDS);
      if (crisisMatch) {
        return result('CRISIS_SUPPORT', 1.0, crisisMatch, 'CRISIS');
      }

      // ── 1.5 AT_RISK check (Phase 22 — only if not crisis) ─
      var atRiskMatch = matchPhrase(text, AT_RISK_KEYWORDS);
      if (atRiskMatch) {
        return result('AT_RISK_SUPPORT', 0.9, atRiskMatch, 'AT_RISK');
      }

      // ── 2. Keyword-based intent matching ───────────────
      for (var i = 0; i < KEYWORD_RULES.length; i++) {
        var rule = KEYWORD_RULES[i];
        var match = matchPhrase(text, rule.keywords);
        if (match) {
          return result(rule.intent, 0.8, match);
        }
      }

      // ── 3. Short-input handling ─────────────────────────
      // Only flag for clarification if the input is BOTH short
      // AND not recognizable as a meaningful term. Short inputs
      // like "GI Bill", "PTSD", "housing", "Nevada" should still
      // route to GENERAL_QUESTION with normal confidence.
      if (text.length < 12) {
        var knownTerms = [
          'gi bill', 'vr&e', 'ptsd', 'tbi', 'mst', 'housing',
          'resume', 'education', 'healthcare', 'pension', 'dental',
          'vision', 'caregiver', 'homeless', 'employment', 'burial',
          'loan', 'insurance', 'aid', 'vet center', 'champva',
          'appeal', 'nexus', 'c&p', 'comp', 'rating',
          // Phase 38 additions — survivor/family short-input terms
          'dic', 'gold star', 'survivor', 'surviving', 'widow', 'widower',
          'death benefit', 'chapter 35', 'taps', 'sbp'
        ];
        // Also treat any US state name (2+ chars) or abbreviation as informative
        var stateTerms = [
          'alabama','alaska','arizona','arkansas','california','colorado',
          'connecticut','delaware','florida','georgia','hawaii','idaho',
          'illinois','indiana','iowa','kansas','kentucky','louisiana',
          'maine','maryland','massachusetts','michigan','minnesota',
          'mississippi','missouri','montana','nebraska','nevada',
          'new hampshire','new jersey','new mexico','new york',
          'north carolina','north dakota','ohio','oklahoma','oregon',
          'pennsylvania','rhode island','south carolina','south dakota',
          'tennessee','texas','utah','vermont','virginia','washington',
          'west virginia','wisconsin','wyoming'
        ];
        var isInformative = matchPhrase(text, knownTerms) || matchPhrase(text, stateTerms);
        if (!isInformative) {
          var r = result('GENERAL_QUESTION', 0.2, null);
          r.needsClarification = true;
          r.clarificationQuestion = 'Can you tell me a bit more about what you need help with?';
          return r;
        }
      }

      // ── 4. Default — general question ──────────────────
      return result('GENERAL_QUESTION', 0.4, null);
    },

    /**
     * Register a skill so the router knows it exists.
     * @param {string} skillId
     * @param {Object} skillMeta - { triggers: [], description: '' }
     */
    register: function(skillId, skillMeta) {
      Router._skills[skillId] = skillMeta;
    },

    /** Internal registry of available skills */
    _skills: {}
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Router = Router;

})();
