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
    CRISIS_SUPPORT:        'crisis-support',
    AT_RISK_SUPPORT:       'crisis-support',       // Phase 22: same skill, AT_RISK tier
    BENEFITS_DISCOVERY:    'benefit-path-finder',
    DISABILITY_CLAIM:      'va-disability-claim',
    STATE_BENEFITS:        'state-benefits',
    NEXT_STEP:             'next-action-planner',
    DOCUMENT_ANALYSIS:     'document-analyzer',
    FAMILY_SURVIVOR:       'family-survivor-support',  // Phase 38
    EMPLOYMENT_TRANSITION: 'next-action-planner',      // Phase 39
    LEGAL_DOCUMENTS:       'document-analyzer',        // Phase 39
    EDUCATION:             'education-benefits',       // Phase R5
    PACT_ACT:              'pact-act-toxic-exposure',  // Phase R5.3
    VA_HEALTHCARE:         'va-healthcare',             // Phase R5.4
    HOUSING_SUPPORT:       'housing-benefits',          // Phase R5.5
    MENTAL_HEALTH:         'mental-health',             // Phase R5.6
    GENERAL_QUESTION:      null   // no skill — handled by core prompt
  };

  /* ────────────────────────────────────────────────────────
     Phase 7: Intent → Execution Page URL mapping
     Used by request-builder to inject the primary recommended
     execution page into the response format block.
     Rules:
     - CRISIS/AT_RISK: null — safety responses never include exec links
     - GENERAL_QUESTION: null — no strong signal to pre-select a page
     - All others: most relevant execution page for the detected intent
     ──────────────────────────────────────────────────────── */
  var EXECUTION_URLS = {
    BENEFITS_DISCOVERY:    '/hidden-benefits.html?auto=1&goal=see_everything',
    DISABILITY_CLAIM:      '/hidden-benefits.html?auto=1&goal=see_everything',
    STATE_BENEFITS:        '/hidden-benefits.html?auto=1&goal=see_everything',
    NEXT_STEP:             '/hidden-benefits.html?auto=1&goal=see_everything',
    EMPLOYMENT_TRANSITION: '/contractor-careers.html?auto=1&goal=get_hired',
    FAMILY_SURVIVOR:       '/hidden-benefits.html?auto=1&goal=see_everything',
    EDUCATION:             '/hidden-benefits.html?auto=1&goal=see_everything',  // Phase R5
    PACT_ACT:              '/hidden-benefits.html?auto=1&goal=see_everything',  // Phase R5.3
    VA_HEALTHCARE:         '/hidden-benefits.html?auto=1&goal=see_everything',  // Phase R5.4
    HOUSING_SUPPORT:       '/hidden-benefits.html?auto=1&goal=see_everything',  // Phase R5.5
    MENTAL_HEALTH:         '/hidden-benefits.html?auto=1&goal=see_everything',  // Phase R5.6
    LEGAL_DOCUMENTS:       null,
    DOCUMENT_ANALYSIS:     null,
    CRISIS_SUPPORT:        null,   // safety flow — never include execution links
    AT_RISK_SUPPORT:       null,   // safety flow — never include execution links
    GENERAL_QUESTION:      null
  };

  /* ────────────────────────────────────────────────────────
     Keyword tables — order matters (checked top-to-bottom)
     Crisis is checked separately via override, not here.
     ──────────────────────────────────────────────────────── */
  var KEYWORD_RULES = [
    // ── Disability claim — most specific, first ──────────
    {
      intent: 'DISABILITY_CLAIM',
      keywords: [
        'disability claim', 'file a claim', 'va claim', 'disability rating',
        'c&p exam', 'comp and pen', 'nexus letter', 'supplemental claim',
        'higher-level review', 'higher level review',
        'board of veterans appeals', 'bva',
        'claim status', 'claim appeal', 'rating decision', 'increase my rating',
        // Phase 39: claim status / appeal phrasing
        'status of my claim', 'check my claim', 'claim denied',
        'my claim was denied', 'claim decision', 'pending claim',
        'va appeal', 'appeal status',
        // Phase 39: claim-support documents
        'buddy statement', 'nexus letter', 'buddy letter', 'lay statement',
        'statement in support of claim', 'intent to file',
        'notice of disagreement', 'substantive appeal',
        'informal hearing presentation'
      ]
    },
    // ── State benefits ────────────────────────────────────
    {
      intent: 'STATE_BENEFITS',
      keywords: [
        'state benefits', 'state veteran', 'property tax exemption',
        'state va', 'in-state tuition', 'license reciprocity',
        'state program', 'my state', 'state bonus'
      ]
    },
    // ── Document analysis (uploaded files) ───────────────
    {
      intent: 'DOCUMENT_ANALYSIS',
      keywords: [
        'upload', 'document', 'dd-214', 'dd214', 'va letter',
        'discharge papers', 'service record', 'benefit letter',
        'rating decision letter', 'medical record', 'analyze my',
        'read my', 'look at my'
      ]
    },
    // ── Next step / action plan ───────────────────────────
    {
      intent: 'NEXT_STEP',
      keywords: [
        'action plan', 'next steps', 'what should i do', 'where do i start',
        'priorities', 'checklist', 'after action', 'my report', 'summary',
        'what now', 'most important', 'first thing'
      ]
    },
    // ── Family / Survivor (Phase 38) ──────────────────────
    // Checked before BENEFITS_DISCOVERY: survivor phrases are more precise
    // than the generic benefits path. Multi-word phrases used for short
    // acronyms (dependency and indemnity vs. bare "DIC") to avoid false
    // substring matches.
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
        'taps grief', 'tragedy assistance',
        // Phase 39: caregiver / spouse-helping context
        'my caregiver', 'helping me navigate my benefits',
        'spouse is helping me', 'wife is helping me', 'husband is helping me'
      ]
    },
    // ── Employment / Career Transition (Phase 39) ─────────
    // Routes to next-action-planner — employment transition is a
    // planning + prioritization task, which is that skill's core purpose.
    // Inserted before BENEFITS_DISCOVERY so "resume" / "find a job" don't
    // dissolve into the generic benefits path.
    {
      intent: 'EMPLOYMENT_TRANSITION',
      keywords: [
        'find a job', 'finding a job', 'job search', 'job hunting',
        'looking for a job', 'looking for work', 'help finding work',
        'help me get a job', 'need a job', 'get a job',
        'resume', 'interview', 'career transition', 'civilian job',
        'civilian career', 'military to civilian', 'translate my mos',
        'mos translation', 'afsc translation',
        'leaving the military', 'separating from the military',
        'transitioning out of', 'tap program', 'transition assistance program',
        'skillbridge', 'skill bridge', 'hire heroes', 'veteran hiring',
        'veterans preference', 'usajobs', 'federal job',
        'unemployment compensation', 'career change', 'job fair',
        'civilian transition', 'employment assistance', 'vocational counseling',
        'job skills',
        // Phase 7B: contractor / clearance phrases missed in sample validation
        'contractor job', 'contracting job', 'defense contractor', 'cleared job',
        'security clearance', 'have a clearance', 'clearance holder',
        'dod contractor', 'government contractor', 'need a contractor',
        'get a contractor', 'find a contractor job'
      ]
    },
    // ── Legal Documents / Forms (Phase 39) ────────────────
    // Routes to document-analyzer — the closest existing skill for
    // document-centric requests. Covers non-claim legal forms (POA,
    // affidavit, JAG, release of information) and VA form navigation.
    // Claim-support documents (buddy statement, nexus letter, etc.)
    // are handled by DISABILITY_CLAIM above.
    {
      intent: 'LEGAL_DOCUMENTS',
      keywords: [
        'power of attorney', 'poa form', 'affidavit', 'sworn statement',
        'legal form', 'fill out a form', 'i need a form', 'help with a form',
        'which form do i need', 'complete a form',
        'authorization to release', 'hipaa authorization',
        'medical records release', 'release of information',
        'jag officer', 'judge advocate', 'legal aid',
        'legal assistance office', 'legal help', 'va form 21',
        'va 21-', '21-526', '21-4142', '21-0781'
      ]
    },
    // ── Education / GI Bill (Phase R5) ──────────────────────
    // Dedicated education skill — intercepts education keywords before
    // they dissolve into the generic benefits path. Covers GI Bill
    // chapters, VR&E, VET TEC, school selection, entitlement questions.
    {
      intent: 'EDUCATION',
      keywords: [
        'gi bill', 'education benefits', 'chapter 33', 'chapter 31',
        'vocational rehabilitation', 'vocational rehab', 'vr&e',
        'yellow ribbon', 'fry scholarship', 'vet tec', 'vettec',
        'going back to school', 'go back to school',
        'want to go to school', 'want to go to college',
        'paying for school', 'finish my degree', 'tuition assistance',
        'stem scholarship', 'book stipend', 'school benefit',
        'post 9/11 gi bill', 'montgomery gi bill', 'chapter 30',
        'education entitlement', 'gi bill transfer', 'transfer gi bill',
        'gi bill housing allowance', 'bah for school',
        'certification program', 'certification', 'trade school benefits',
        'apprenticeship program', 'ojt benefits',
        'housing allowance'
      ]
    },
    // ── PACT Act / Toxic Exposure (Phase R5.3) ───────────
    // Dedicated toxic exposure skill — intercepts PACT Act and
    // toxic exposure keywords before they dissolve into the generic
    // benefits path. Must sit before BENEFITS_DISCOVERY.
    {
      intent: 'PACT_ACT',
      keywords: [
        // Core PACT Act terms
        'pact act', 'toxic exposure', 'burn pit', 'burn pits',
        'agent orange', 'blue water navy', 'thailand exposure',
        'camp lejeune', 'gulf war illness', 'gulf war syndrome',
        'radiation exposure', 'atomic veteran', 'toxic water',
        'chemical exposure', 'airborne hazards', 'particulate matter',
        'smoke exposure',
        // Plain-language veteran phrasing
        'exposed to burn pits', 'exposed to agent orange',
        'was at camp lejeune', 'served in vietnam and got sick',
        'served in thailand and got sick', 'exposed to radiation',
        'toxic stuff in service', 'burn pit registry',
        'toxic exposure screening'
      ]
    },
    // ── VA Healthcare Enrollment (Phase R5.4) ─────────────
    // Dedicated healthcare skill — intercepts VA healthcare, enrollment,
    // priority group, Vet Center, dental, community care, and mental
    // health access keywords before they dissolve into BENEFITS_DISCOVERY.
    // Must sit before BENEFITS_DISCOVERY. 'healthcare' and 'vet center'
    // removed from BENEFITS_DISCOVERY to prevent overlap. Mental health
    // phrases ('vet center', 'va mental health', 'therapy through the va',
    // 'counseling through the va') moved to MENTAL_HEALTH in Phase R5.6.
    {
      intent: 'VA_HEALTHCARE',
      keywords: [
        // Core enrollment / access terms
        'va healthcare', 'va health care', 'enroll in va healthcare',
        'enroll in va health care', 'va medical', 'va hospital',
        'va clinic', 'priority group', 'va enrollment', '10-10ez',
        // Care access types
        'va dental', 'community care', 'urgent care', 'urgent care va',
        'women veteran care', 'woman veteran', 'primary care through va',
        // Plain-language phrasing
        'can i get va healthcare', 'how do i get va healthcare',
        'how do i sign up for the va',
        'can i use community care', 'can i get va dental',
        'what priority group am i'
      ]
    },
    // ── Housing / VA Home Loan (Phase R5.5) ──────────────
    // Dedicated housing skill — intercepts VA home loan, rental
    // assistance, homelessness, and housing instability keywords
    // before they dissolve into BENEFITS_DISCOVERY. Hard domain
    // split enforced in skill: loan path ≠ crisis/rent path.
    // Housing phrases removed from BENEFITS_DISCOVERY below.
    {
      intent: 'HOUSING_SUPPORT',
      keywords: [
        // VA home loan / ownership
        'va loan', 'va home loan', 'mortgage', 'refinance',
        'coe', 'certificate of eligibility', 'funding fee',
        'buy a house', 'buy a home', 'home loan',
        // Housing instability
        'behind on rent', 'rent help', 'rental assistance',
        'eviction', 'eviction notice', 'notice to vacate',
        'homeless', 'housing help', 'housing assistance',
        'living in my car', 'no place to stay',
        'transitional housing', 'hud-vash', 'ssvf', 'gpd',
        'foreclosure',
        // Plain-language phrasing
        'can i use a va loan', 'can i buy a house with a va loan',
        'i am behind on rent', 'i might get evicted',
        'i am homeless', 'i need housing help',
        'i need help paying rent', 'i need transitional housing',
        'i am living in my car'
      ]
    },
    // ── Mental Health / Non-Crisis (Phase R5.6) ────────────
    // Dedicated mental health skill — intercepts PTSD, anxiety,
    // depression, counseling, therapy, Vet Center, and trauma
    // keywords before they dissolve into BENEFITS_DISCOVERY.
    // Does NOT include suicidal phrases — CRISIS intercepts first.
    // Mental-health phrases removed from VA_HEALTHCARE below.
    {
      intent: 'MENTAL_HEALTH',
      keywords: [
        // PTSD and trauma
        'ptsd', 'post-traumatic stress', 'post traumatic stress',
        'flashbacks', 'flashback', 'trauma', 'combat trauma',
        'combat stress', 'hypervigilant', 'hypervigilance',
        'intrusive thoughts', 'moral injury',
        // Mood disorders
        'depression', 'depressed', 'anxiety', 'anxious',
        'panic attacks', 'panic attack', 'stress', 'overwhelmed',
        // Sleep
        'nightmares', 'insomnia', "can't sleep", 'trouble sleeping',
        'sleep problems', 'not sleeping',
        // MST
        'military sexual trauma', 'mst', 'sexual assault',
        'sexual harassment',
        // Care-seeking
        'counseling', 'therapy', 'therapist',
        'talk to someone', 'need to talk', 'someone to talk to',
        'mental health', 'mental health help', 'mental health support',
        'vet center',
        // Plain-language phrasing
        'i need someone to talk to', 'i am struggling mentally',
        'i feel overwhelmed', 'i cannot sleep',
        'i keep having nightmares', 'i am anxious all the time',
        'i feel depressed', 'i need counseling', 'i want therapy'
      ]
    },
    // ── Benefits discovery — broadest catch-all ───────────
    // Phase 39: expanded with housing keyword sets. Education keywords
    // moved to EDUCATION in Phase R5. Healthcare / vet center moved to
    // VA_HEALTHCARE in Phase R5.4. Housing keywords moved to
    // HOUSING_SUPPORT in Phase R5.5. Mental health phrases moved to
    // MENTAL_HEALTH in Phase R5.6.
    {
      intent: 'BENEFITS_DISCOVERY',
      keywords: [
        'benefits', 'eligible', 'qualify', 'entitled', 'what can i get',
        'what am i eligible',
        'pension', 'aid and attendance', 'caregiver',
        // Phase 7B: financial distress phrases missed in sample validation
        'help paying', 'paying bills', 'pay my bills', 'struggling financially',
        'financial assistance', 'money help', 'need money', 'help with bills',
        'utility assistance', 'can not afford'
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
    'sleeping outside',
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
      tier: tier || 'STANDARD',            // Phase 22: escalation tier
      executionUrl: EXECUTION_URLS[intent] || null,  // Phase 7: primary execution page
      needsClarification: false,
      clarificationQuestion: null
    };
  }


  /* ────────────────────────────────────────────────────────
     Phase 13: Partner metadata hook
     Attaches partnerMeta to a routing result when an active
     partner supports the detected intent.  Metadata only —
     no network calls, no side effects.  Safe no-op when
     PartnerRegistry is absent or returns null.

     SAFETY: Never called on CRISIS or AT_RISK results —
     partner referrals must never interrupt safety flows.
     ──────────────────────────────────────────────────────── */

  /**
   * @param  {Object} r — result object produced by result()
   * @returns {Object} r — same reference, optionally extended
   */
  function attachPartnerMeta(r) {
    if (!r) return r;
    if (!window.AIOS || !window.AIOS.PartnerRegistry ||
        typeof window.AIOS.PartnerRegistry.getPartnerFor !== 'function') return r;
    var _p = window.AIOS.PartnerRegistry.getPartnerFor(r.intent);
    if (_p) {
      r.partnerMeta = {
        partner_id:   _p.partner_id,
        partner_type: _p.partner_type,
        status:       _p.status
      };
    }
    return r;
  }

  /* ────────────────────────────────────────────────────────
     Router
     ──────────────────────────────────────────────────────── */
  var Router = {

    /** Exposed for testing / extension */
    INTENTS: INTENTS,

    /** Phase 7: Execution page URL map — exposed for testing / extension */
    EXECUTION_URLS: EXECUTION_URLS,

    /**
     * Classify user input and select the appropriate skill.
     * Crisis detection runs first as an unconditional override.
     * @param {string} userMessage
     * @param {Object} [context] - { profile, mission, history } (reserved for v2)
     * @returns {Object} { intent, skill, confidence, matched, needsClarification, clarificationQuestion }
     */
    routeAIOSIntent: function(userMessage, context) {
      if (!userMessage || typeof userMessage !== 'string') {
        return attachPartnerMeta(result('GENERAL_QUESTION', 0, null));
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
          return attachPartnerMeta(result(rule.intent, 0.8, match));
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
          'death benefit', 'chapter 35', 'taps', 'sbp',
          // Phase 39 additions — employment, education, legal short-input terms
          'chapter 33', 'chapter 31', 'job', 'interview', 'career',
          'resume', 'poa', 'legal', 'statement', 'affidavit'
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
          return attachPartnerMeta(r);
        }
      }

      // ── 4. Default — general question ──────────────────
      return attachPartnerMeta(result('GENERAL_QUESTION', 0.4, null));
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
