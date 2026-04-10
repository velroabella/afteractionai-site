/* ══════════════════════════════════════════════════════════
   AIOS Skill — Housing Benefits  (Phase R5.5)
   Decision engine for veteran housing assistance with a
   HARD DOMAIN SPLIT between VA home loan / ownership and
   housing instability / rent / homelessness. These are
   never conflated. Returns deterministic track, loan
   eligibility, assistance type, urgency level, and exact
   next steps — never generic phrasing.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Skill prompt — injected into system prompt when active
     ──────────────────────────────────────────────────────── */
  var SKILL_PROMPT = [
    '## ACTIVE SKILL: HOUSING BENEFITS DECISION ENGINE',
    '',
    '### YOUR ROLE',
    'You are a veteran housing benefits analyst. You determine the correct housing track,',
    'assess VA home loan eligibility, identify the right assistance programs, and establish',
    'urgency — based on the veteran\'s profile. You do NOT conflate VA home loan with housing',
    'instability. These are two completely separate paths that require completely separate',
    'responses. You do NOT say "you may qualify." You state what applies and exactly why.',
    '',
    '### CRITICAL DOMAIN SPLIT — NEVER MIX THESE TWO PATHS',
    '',
    '**PATH A — VA HOME LOAN / OWNERSHIP**',
    'For veterans who want to buy a home, refinance, or use a VA-backed mortgage.',
    'Key: VA home loan has NO down payment, NO PMI, competitive rates.',
    'Requires: Certificate of Eligibility (COE), honorable/general discharge, sufficient',
    'service (90 days active duty wartime / 181 days peacetime / 6 years Guard or Reserve).',
    'VA Funding Fee: 1.25%–3.3% of loan amount (waived for 10%+ service-connected rating).',
    'Native American Direct Loan (NADL): for eligible Native American veterans.',
    'Adapted Housing Grants (SAH/SHA): for veterans with service-connected mobility impairments.',
    '  - SAH (Grant 2101): up to $109,986 for building/modifying a home',
    '  - SHA (Grant 2101S): up to $22,036 for modifying an existing home',
    '',
    '**PATH B — HOUSING INSTABILITY / RENT / HOMELESSNESS**',
    'For veterans at risk of losing housing, facing eviction, or currently homeless.',
    'These are CRISIS-ADJACENT situations — urgency level drives response format.',
    '',
    'Programs by urgency:',
    '- HUD-VASH: HUD-VA Supportive Housing — permanent housing + case management.',
    '  For chronically homeless veterans. Combines a HUD housing voucher with VA case management.',
    '  Contact: Local VA Medical Center homeless program coordinator.',
    '  Phone: 1-877-4AID-VET (1-877-424-3838)',
    '- SSVF: Supportive Services for Veteran Families — prevents homelessness.',
    '  For veterans at imminent risk of losing housing (behind on rent, eviction notice).',
    '  Provides rapid rehousing + rental assistance + security deposits.',
    '  Contact: va.gov/homeless/ssvf or call 1-877-424-3838',
    '- GPD: Grant and Per Diem — transitional housing (60–90 day temporary shelter).',
    '  For veterans who are homeless and need time to stabilize before permanent housing.',
    '  Contact: va.gov/homeless/gpd or call VA National Call Center 1-877-424-3838',
    '- State Support: Local veteran service organizations, emergency rental assistance,',
    '  county veteran services offices. Varies by state and county.',
    '',
    '### DECISION SEQUENCE — APPLY IN ORDER',
    '',
    '**STEP 1 — DETERMINE URGENCY LEVEL**',
    '- homeless: Currently without housing (car, shelter, couch-surfing, streets)',
    '- urgent: Imminent loss of housing within 30 days (eviction, foreclosure)',
    '- at-risk: Behind on rent/mortgage, financial strain threatening housing',
    '- stable: Housed and stable — seeking loan or housing information',
    '',
    'IF urgencyLevel = homeless or urgent: LEAD with immediate stabilization steps.',
    'DO NOT pivot to VA home loan information until stabilization is addressed.',
    '',
    '**STEP 2 — DETERMINE HOUSING TRACK**',
    '- va-home-loan: Veteran wants to buy, refinance, or use a VA-backed mortgage.',
    '  Signals: "buy a home", "house", "mortgage", "va loan", "refinance", "purchase"',
    '- rent-assistance: Veteran at risk but still housed. Behind on rent or facing eviction.',
    '  Signals: "behind on rent", "eviction", "cant afford rent", "losing my apartment"',
    '- homelessness-support: Veteran has no housing now.',
    '  Signals: "homeless", "living in my car", "no place to stay", "sleeping outside"',
    '- transitional-housing: Veteran needs temporary shelter while getting stabilized.',
    '  Signals: "need somewhere to stay", "temporary housing", "transitional"',
    '- needs-intake: Insufficient signals to determine track.',
    '',
    '**STEP 3 — ASSESS LOAN ELIGIBILITY (only if track = va-home-loan)**',
    '- likely-eligible: Honorable/general discharge + sufficient service.',
    '  Service thresholds: 90 days wartime active duty, 181 days peacetime,',
    '  6 years National Guard/Reserve, or discharge for service-connected disability.',
    '- needs-coe-check: Service or discharge signal present but COE not yet obtained.',
    '  COE required before any lender can process a VA loan.',
    '- possible-issue: OTH/BCD discharge — individual VA determination required.',
    '  VA may grant home loan eligibility for OTH if service was otherwise sufficient.',
    '- not-applicable: Track is not va-home-loan.',
    '',
    '**STEP 4 — IDENTIFY ASSISTANCE TYPE (only if track != va-home-loan)**',
    '- hud-vash: Chronically homeless veteran — needs permanent housing voucher + case management.',
    '- ssvf: At-risk or recently homeless — rapid rehousing / rent assistance / deposits.',
    '- gpd: Homeless, needs transitional shelter for 60–90 days.',
    '- state-support: Local/county/state programs as supplement or primary if federal unavailable.',
    '- none: Track is va-home-loan or housing situation is stable.',
    '',
    '### REQUIRED OUTPUT STRUCTURE',
    'Every response MUST open with:',
    '',
    '**HOUSING ASSESSMENT**',
    '- Housing track: [va-home-loan / rent-assistance / homelessness-support / transitional-housing / needs-intake]',
    '- Loan eligibility: [likely-eligible / needs-coe-check / possible-issue / not-applicable]',
    '- Assistance type: [hud-vash / ssvf / gpd / state-support / none]',
    '- Urgency level: [stable / at-risk / urgent / homeless]',
    '',
    '**WHY THIS APPLIES**',
    '[1-2 sentences connecting profile and input signals to the track/urgency determination]',
    '',
    '**YOUR EXACT NEXT STEPS**',
    '1. [Specific action with form number, URL, or phone]',
    '2. [Specific action]',
    '3. [Specific action]',
    '',
    '### KEY REFERENCES — VA HOME LOAN',
    '- Apply for COE: va.gov/housing-assistance/home-loans/request-coe-form-26-1880/',
    '  (VA Form 26-1880, or lender can pull it via LGY Hub)',
    '- Find VA-approved lenders: va.gov/housing-assistance/home-loans/lenders/',
    '- VA Funding Fee waiver: Automatic for veterans with 10%+ service-connected rating.',
    '  Request waiver from lender — they will verify via VA records.',
    '- Adapted Housing Grants: va.gov/housing-assistance/adaptive-housing-grants/',
    '  (SAH/SHA grants for mobility-impaired veterans — apply via VA Form 26-4555)',
    '- NADL (Native American Direct Loan): va.gov/housing-assistance/home-loans/nadl-program/',
    '',
    '### KEY REFERENCES — HOUSING INSTABILITY',
    '- VA Homeless Veterans National Call Center: 1-877-4AID-VET (1-877-424-3838) — 24/7',
    '  (single point of entry for HUD-VASH, SSVF, GPD, and emergency housing referrals)',
    '- HUD-VASH: va.gov/homeless/hud-vash.asp — call local VA Medical Center',
    '- SSVF: va.gov/homeless/ssvf — call 1-877-424-3838 or find grantee at ssvf.va.gov',
    '- GPD: va.gov/homeless/gpd.asp — transitional housing 60–90 days',
    '- 2-1-1: Dial 2-1-1 for local emergency rental assistance, shelter, utility help',
    '- HUD Emergency Rental Assistance: consumerfinance.gov/renthelp',
    '- National Call Center for Homeless Veterans: 1-877-424-3838',
    '',
    '### RULES',
    '- NEVER say "you may qualify" or "consider looking into." State what applies and why.',
    '- NEVER mix VA home loan information into a homelessness-support or rent-assistance response',
    '  unless explicitly asked. These are separate domains.',
    '- IF urgencyLevel is homeless or urgent: Step 1 is ALWAYS the National Call Center.',
    '  1-877-4AID-VET (1-877-424-3838). Do not lead with forms or eligibility discussion.',
    '- VA Funding Fee IS waived for 10%+ service-connected rating — always state this.',
    '- OTH discharge does NOT automatically bar VA home loan — VA adjudicates individually.',
    '- Always end response with: Veterans Crisis Line — 988, Press 1.',
    '',
    '[OPTIONS: VA home loan | Behind on rent | I am homeless | Adapted housing grant | Transitional housing | COE — how do I get it | VA funding fee | Refinance my home]'
  ].join('\n');


  /* ────────────────────────────────────────────────────────
     Helpers
     ──────────────────────────────────────────────────────── */

  /**
   * Case-insensitive substring match against a keyword list.
   * Returns true on first match.
   */
  function _hasKeyword(target, keywords) {
    if (!target) return false;
    var t = target.toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (t.indexOf(keywords[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  /**
   * Combines userInput + housingStatus into one lowercase corpus.
   */
  function _buildCorpus(profile, userInput) {
    return [
      userInput || '',
      profile.housingStatus || ''
    ].join(' ').toLowerCase();
  }

  /**
   * Safe accessor for vaRating — returns -1 when absent.
   */
  function _getRating(profile) {
    return (profile.vaRating !== null && profile.vaRating !== undefined)
      ? profile.vaRating : -1;
  }


  /* ────────────────────────────────────────────────────────
     _determineUrgencyLevel
     Returns: homeless | urgent | at-risk | stable
     Urgency governs response format — homeless/urgent MUST
     lead with immediate stabilization, not loan information.
     ──────────────────────────────────────────────────────── */
  function _determineUrgencyLevel(profile, userInput) {
    var corpus = _buildCorpus(profile, userInput);

    // ── Homeless — no housing at all ──
    if (_hasKeyword(corpus, [
      'homeless', 'no place to stay', 'no place to live',
      'living in my car', 'living in a car', 'sleeping in my car',
      'sleeping outside', 'sleeping on the street', 'on the street',
      'on the streets', 'couch surfing', 'couch-surfing',
      'shelter', 'no housing', 'lost my housing', 'lost my home',
      'nowhere to go', 'no where to go', 'kicked out'
    ])) { return 'homeless'; }

    // ── Urgent — imminent loss within 30 days ──
    if (_hasKeyword(corpus, [
      'eviction', 'evicted', 'getting evicted', 'being evicted',
      'eviction notice', 'notice to vacate',
      'foreclosure', 'foreclosing', 'about to lose my home',
      'about to lose my house', 'about to lose my apartment',
      'losing my home', 'losing my house', 'losing my apartment',
      '30 days', 'have to leave', 'have 30 days'
    ])) { return 'urgent'; }

    // ── At-risk — strained but still housed ──
    if (_hasKeyword(corpus, [
      'behind on rent', 'behind on my rent', 'cant pay rent',
      "can't pay rent", 'cant afford rent', "can't afford rent",
      'behind on mortgage', 'behind on my mortgage',
      'cant pay my mortgage', "can't pay my mortgage",
      'struggling to pay', 'struggling with rent',
      'need help with rent', 'need rent help', 'help paying rent',
      'rental assistance', 'rent assistance', 'at risk',
      'might lose my', 'worried about housing'
    ])) { return 'at-risk'; }

    // ── Profile housingStatus signals ──
    var hs = (profile.housingStatus || '').toLowerCase();
    if (hs === 'homeless')      return 'homeless';
    if (hs === 'urgent')        return 'urgent';
    if (hs === 'at-risk')       return 'at-risk';

    return 'stable';
  }


  /* ────────────────────────────────────────────────────────
     _determineHousingTrack
     Returns: va-home-loan | rent-assistance | homelessness-support
              | transitional-housing | needs-intake
     DOMAIN SPLIT is enforced here. Urgency overrides loan signals
     when the veteran is homeless, urgent, or at-risk.
     ──────────────────────────────────────────────────────── */
  function _determineHousingTrack(profile, userInput, urgencyLevel) {
    var corpus = _buildCorpus(profile, userInput);

    // ── Homelessness — highest priority, overrides everything ──
    if (urgencyLevel === 'homeless') {
      return 'homelessness-support';
    }

    // ── Urgent eviction/foreclosure — route to rent/crisis ──
    if (urgencyLevel === 'urgent') {
      return 'rent-assistance';
    }

    // ── At-risk — housing instability overrides loan path ──
    if (urgencyLevel === 'at-risk') {
      return 'rent-assistance';
    }

    // ── VA Home Loan signals — only when stable ──
    if (_hasKeyword(corpus, [
      'buy a home', 'buy a house', 'buy home', 'buy house',
      'purchase a home', 'purchase a house',
      'va loan', 'va home loan', 'va mortgage',
      'mortgage', 'home loan', 'refinance', 'irrrl',
      'streamline refinance', 'cash-out refinance',
      'certificate of eligibility', 'coe',
      'funding fee', 'va funding fee',
      'down payment', 'no down payment',
      'nadl', 'native american direct loan',
      'adapted housing', 'sah grant', 'sha grant',
      'build a home', 'modify my home', 'home modification'
    ])) { return 'va-home-loan'; }

    if (_hasKeyword(corpus, [
      'rent', 'rental', 'apartment', 'renting', 'renter',
      'landlord', 'lease', 'ssvf', 'hud-vash', 'hud vash',
      'rent help', 'pay rent', 'section 8', 'housing voucher',
      'housing assistance', 'rental help'
    ])) { return 'rent-assistance'; }

    // ── Transitional housing ──
    if (_hasKeyword(corpus, [
      'transitional housing', 'transitional home',
      'temporary housing', 'temporary shelter',
      'need somewhere to stay', 'need a place to stay',
      'gpd', 'grant and per diem'
    ])) { return 'transitional-housing'; }

    // ── Generic housing signal — push toward intake ──
    if (_hasKeyword(corpus, [
      'housing', 'home', 'place to live', 'where to live',
      'housing benefit', 'housing program'
    ])) { return 'needs-intake'; }

    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     _assessLoanEligibility
     Only evaluated when housingTrack = va-home-loan.
     Returns: likely-eligible | needs-coe-check | possible-issue
              | not-applicable
     ──────────────────────────────────────────────────────── */
  function _assessLoanEligibility(profile, userInput, housingTrack) {
    if (housingTrack !== 'va-home-loan') return 'not-applicable';

    var discharge = (profile.dischargeStatus || '').toLowerCase();
    var era       = (profile.serviceEra || '').toLowerCase();
    var corpus    = _buildCorpus(profile, userInput);
    var rating    = _getRating(profile);

    // OTH / BCD / Dishonorable — possible issue but not automatic bar
    var badDischarge = (
      discharge.indexOf('other than honorable') !== -1 ||
      discharge.indexOf('oth') !== -1 ||
      discharge.indexOf('bad conduct') !== -1 ||
      discharge.indexOf('bcd') !== -1 ||
      discharge.indexOf('dishonorable') !== -1
    );
    if (badDischarge) return 'possible-issue';

    // Honorable / General — confirmed eligible with sufficient service
    var goodDischarge = (
      discharge.indexOf('honorable') !== -1 ||
      discharge.indexOf('general') !== -1
    );

    // Era signals confirming active service
    var hasEraSignal = (
      era.indexOf('post-9/11') !== -1 || era.indexOf('post 9/11') !== -1 ||
      era.indexOf('vietnam') !== -1 || era.indexOf('gulf war') !== -1 ||
      era.indexOf('desert storm') !== -1 || era.indexOf('korea') !== -1 ||
      era.indexOf('oef') !== -1 || era.indexOf('oif') !== -1 ||
      era.indexOf('cold war') !== -1 || era.indexOf('wwii') !== -1 ||
      era.indexOf('active duty') !== -1 || era.indexOf('national guard') !== -1 ||
      era.indexOf('reserve') !== -1
    );

    if (goodDischarge && hasEraSignal) return 'likely-eligible';
    if (goodDischarge || hasEraSignal || rating >= 0) return 'needs-coe-check';

    // No discharge or era info — user mentioned loan but profile is sparse
    return 'needs-coe-check';
  }


  /* ────────────────────────────────────────────────────────
     _determineAssistanceType
     Only evaluated for non-loan tracks.
     Returns: hud-vash | ssvf | gpd | state-support | none
     ──────────────────────────────────────────────────────── */
  function _determineAssistanceType(housingTrack, urgencyLevel, profile, userInput) {
    if (housingTrack === 'va-home-loan') return 'none';
    if (housingTrack === 'needs-intake') return 'none';

    var corpus = _buildCorpus(profile, userInput);

    // HUD-VASH — chronically homeless, needs permanent housing
    if (urgencyLevel === 'homeless') {
      // GPD first if they need transitional before HUD-VASH
      if (housingTrack === 'transitional-housing' ||
          _hasKeyword(corpus, ['transitional', 'temporary shelter', 'short term'])) {
        return 'gpd';
      }
      return 'hud-vash';
    }

    // SSVF — at-risk or urgent, still housed or recently lost housing
    if (urgencyLevel === 'urgent' || urgencyLevel === 'at-risk') {
      return 'ssvf';
    }

    // Transitional track — GPD
    if (housingTrack === 'transitional-housing') return 'gpd';

    // Rent-assistance without high urgency — SSVF or state
    if (housingTrack === 'rent-assistance') {
      if (_hasKeyword(corpus, ['state', 'county', 'local', 'city program', 'emergency fund'])) {
        return 'state-support';
      }
      return 'ssvf';
    }

    return 'state-support';
  }


  /* ────────────────────────────────────────────────────────
     _buildNextActions
     Returns ordered exact-action strings tailored to track
     and urgency. Urgent/homeless paths lead with phone/crisis.
     ──────────────────────────────────────────────────────── */
  function _buildNextActions(housingTrack, loanEligibility, assistanceType, urgencyLevel, profile) {
    var actions = [];
    var rating  = _getRating(profile);

    // ════════════════════════════════════════════════════
    //  PATH B — HOUSING INSTABILITY (urgency = homeless or urgent first)
    // ════════════════════════════════════════════════════

    if (urgencyLevel === 'homeless') {
      actions.push(
        'CALL NOW — VA National Call Center for Homeless Veterans: 1-877-4AID-VET (1-877-424-3838). ' +
        'Available 24/7. They will connect you with your local VA HUD-VASH coordinator, SSVF ' +
        'program, or emergency shelter. This is step one — do not skip this call.'
      );
      actions.push(
        'If you are in immediate danger or need emergency shelter tonight: ' +
        'Dial 2-1-1 for local emergency housing resources. ' +
        'Or visit va.gov/find-locations to locate the nearest VA Medical Center ' +
        'homeless program coordinator — walk-ins accepted.'
      );
      actions.push(
        'HUD-VASH (permanent housing + case management): Your VA case manager will apply ' +
        'on your behalf for a HUD housing voucher once you are enrolled in VA care. ' +
        'If not yet enrolled in VA healthcare, ask the coordinator to fast-track enrollment ' +
        'simultaneously. Learn more: va.gov/homeless/hud-vash.asp'
      );
      actions.push(
        'GPD Transitional Housing (60–90 days): If you need temporary placement while ' +
        'awaiting HUD-VASH processing, ask for a GPD referral during your call. ' +
        'GPD programs provide housing + supportive services while you stabilize. ' +
        'va.gov/homeless/gpd.asp'
      );
      return actions;
    }

    if (urgencyLevel === 'urgent') {
      actions.push(
        'CALL NOW — SSVF (Supportive Services for Veteran Families): 1-877-424-3838. ' +
        'SSVF provides rapid rehousing, back-rent payment, security deposits, and utility ' +
        'assistance to prevent veteran homelessness. This is time-sensitive — call today.'
      );
      actions.push(
        'Find your local SSVF grantee at ssvf.va.gov or va.gov/homeless/ssvf. ' +
        'Bring documentation of your eviction notice, lease, and DD-214 (or other ' +
        'discharge documentation) when you contact them.'
      );
      actions.push(
        'Emergency rental assistance: Dial 2-1-1 for local emergency funds that can ' +
        'bridge the gap while SSVF processes your application. ' +
        'Also check consumerfinance.gov/renthelp for federal Emergency Rental Assistance programs.'
      );
      actions.push(
        'Contact your county or city veteran services office for emergency bridge funds. ' +
        'Many counties have one-time emergency funds specifically for veterans facing eviction. ' +
        'Find yours at va.gov/directory/guide/home.asp'
      );
      return actions;
    }

    // ── At-risk (rent-assistance track, not yet urgent) ──
    if (housingTrack === 'rent-assistance' || housingTrack === 'transitional-housing') {

      if (assistanceType === 'ssvf' || assistanceType === 'gpd') {
        actions.push(
          'Contact SSVF to get ahead of potential eviction: va.gov/homeless/ssvf or call 1-877-424-3838. ' +
          'SSVF helps veterans who are at imminent risk of homelessness — you do NOT have to be ' +
          'evicted yet to qualify. Back-rent, deposits, utility assistance are all covered.'
        );
        actions.push(
          'Find your local SSVF grantee at ssvf.va.gov — search by state or county. ' +
          'Bring proof of lease/rental agreement, income documentation, and DD-214.'
        );
      }

      if (assistanceType === 'gpd') {
        actions.push(
          'If you need transitional housing while stabilizing: ' +
          'Request a GPD (Grant and Per Diem) referral from your VA homeless program coordinator. ' +
          'GPD provides 60–90 days of transitional housing with supportive services. ' +
          'va.gov/homeless/gpd.asp'
        );
      }

      actions.push(
        'Dial 2-1-1 for local emergency rental assistance, food assistance, and utility help. ' +
        'Also check: consumerfinance.gov/renthelp for federally-funded rental assistance programs.'
      );
      actions.push(
        'Contact a VSO for emergency case management: ' +
        'DAV (1-800-827-1000), VFW (vfw.org), American Legion (legion.org). ' +
        'VSOs can connect you with state and local housing funds and advocate on your behalf.'
      );
      return actions;
    }

    // ════════════════════════════════════════════════════
    //  PATH A — VA HOME LOAN
    // ════════════════════════════════════════════════════

    if (housingTrack === 'va-home-loan') {

      if (loanEligibility === 'possible-issue') {
        actions.push(
          'Your discharge status (OTH/BCD) requires an individual eligibility determination ' +
          'from the VA — it does NOT automatically bar you from a VA home loan. ' +
          'Contact the VA Regional Loan Center at 1-877-827-3702 to request a Character ' +
          'of Discharge review. Processing can take weeks, so start this first.'
        );
        actions.push(
          'While awaiting review: Consider a discharge upgrade through your branch\'s ' +
          'Discharge Review Board (DRB) or Board for Correction of Military Records (BCMR). ' +
          'Free legal help available from DAV (1-800-827-1000) or legal aid organizations.'
        );
        actions.push(
          'FHA loans are available regardless of discharge status and require only 3.5% down ' +
          'with a 580+ credit score — a viable bridge option while VA eligibility is reviewed.'
        );
        return actions;
      }

      // Get COE first — required before any loan can proceed
      actions.push(
        'Step 1 — Get your Certificate of Eligibility (COE): ' +
        'Apply online at va.gov/housing-assistance/home-loans/request-coe-form-26-1880/ ' +
        '(VA Form 26-1880). Or ask a VA-approved lender to pull it directly via the LGY Hub — ' +
        'most lenders can do this instantly. COE required before any lender can process your loan.'
      );
      actions.push(
        'Step 2 — Find a VA-approved lender: va.gov/housing-assistance/home-loans/lenders/. ' +
        'Compare rates from at least 3 lenders — VA loans have no PMI and no required down payment. ' +
        'Request a Loan Estimate from each within the same 14-day window to protect your credit score.'
      );

      // Funding fee waiver for rated veterans
      if (rating >= 10) {
        actions.push(
          'VA Funding Fee WAIVER: Your service-connected disability rating of ' + rating + '% ' +
          'means the VA Funding Fee is WAIVED. Inform your lender — they verify this automatically ' +
          'through VA records. This saves you 1.25%–3.3% of the loan amount.'
        );
      } else if (rating >= 0) {
        actions.push(
          'VA Funding Fee: Typically 1.25%–3.3% of loan amount (varies by down payment and first/subsequent use). ' +
          'Fee is WAIVED if you have a 10%+ service-connected disability rating. ' +
          'If you have a pending disability claim, ask your lender about a funding fee refund once the claim is approved.'
        );
      } else {
        actions.push(
          'VA Funding Fee: Typically 1.25%–3.3% of loan amount. ' +
          'Waived for veterans with 10%+ service-connected disability rating. ' +
          'Ask your lender about this waiver if you have a pending or existing disability rating.'
        );
      }

      actions.push(
        'Step 3 — Pre-approval and house hunting: Once COE is in hand and a lender is selected, ' +
        'get pre-approved before making offers. VA loans can close in 30–45 days. ' +
        'Use a real estate agent experienced with VA transactions — some sellers unfairly resist VA ' +
        'offers; an experienced agent will know how to navigate this.'
      );

      actions.push(
        'Adapted Housing Grants (if mobility-impaired): If you have a service-connected mobility ' +
        'impairment, you may be eligible for an SAH grant (up to $109,986) or SHA grant (up to $22,036) ' +
        'to build or modify a home for accessibility. Apply via VA Form 26-4555 at ' +
        'va.gov/housing-assistance/adaptive-housing-grants/. Can be stacked with VA home loan.'
      );

      actions.push(
        'Contact a HUD-approved housing counselor (free): consumerfinance.gov/find-a-housing-counselor/ ' +
        'or call 1-800-569-4287. They will help you review your credit, budget, and loan options ' +
        'alongside the VA loan before you commit.'
      );

      return actions;
    }

    // ── needs-intake — not enough signal ──
    actions.push(
      'To get you the right housing guidance, a bit more context is needed. ' +
      'Are you looking to: (1) buy a home using your VA home loan benefit, ' +
      '(2) get help with rent you can\'t afford, or (3) find emergency housing support?'
    );
    actions.push(
      'If you are in any housing crisis right now — call 1-877-4AID-VET (1-877-424-3838) immediately. ' +
      'Available 24/7. They handle all veteran housing emergencies.'
    );
    return actions;
  }


  /* ────────────────────────────────────────────────────────
     _buildReasoning
     Returns a concise 1-3 sentence explanation connecting
     profile signals to the housing determination.
     ──────────────────────────────────────────────────────── */
  function _buildReasoning(housingTrack, loanEligibility, assistanceType, urgencyLevel, profile) {
    var parts = [];
    var discharge = (profile.dischargeStatus || '').toLowerCase();
    var era       = (profile.serviceEra || '').toLowerCase();
    var rating    = _getRating(profile);

    // Urgency reasoning — always first
    if (urgencyLevel === 'homeless') {
      parts.push('Immediate homelessness detected — stabilization is the only priority. ' +
        'VA home loan and other benefit discussions are deferred until housing is secured.');
    } else if (urgencyLevel === 'urgent') {
      parts.push('Imminent housing loss detected (eviction or foreclosure within 30 days). ' +
        'SSVF rapid rehousing is the correct first intervention.');
    } else if (urgencyLevel === 'at-risk') {
      parts.push('Housing instability detected — veteran is housed but at risk. ' +
        'SSVF prevention assistance is appropriate before the situation becomes urgent.');
    }

    // Track reasoning
    if (housingTrack === 'va-home-loan') {
      if (discharge.indexOf('honorable') !== -1 || discharge.indexOf('general') !== -1) {
        parts.push('Honorable/General discharge confirms basic VA home loan eligibility — ' +
          'a Certificate of Eligibility is the next required step.');
      } else if (discharge.indexOf('oth') !== -1 || discharge.indexOf('bad conduct') !== -1 || discharge.indexOf('dishonorable') !== -1) {
        parts.push('Discharge status requires individual VA eligibility determination before loan processing can begin.');
      } else {
        parts.push('VA home loan signals detected — COE verification is needed to confirm entitlement.');
      }
      if (rating >= 10) {
        parts.push('VA Funding Fee is waived based on ' + rating + '% service-connected disability rating.');
      }
    }

    if (housingTrack === 'rent-assistance' && urgencyLevel === 'stable') {
      parts.push('Rental assistance signals present — SSVF is the primary federal program for veterans at risk of homelessness.');
    }

    if (housingTrack === 'transitional-housing') {
      parts.push('Transitional housing need detected — GPD program provides 60–90 days of supported temporary housing.');
    }

    if (housingTrack === 'needs-intake') {
      parts.push('Housing need is indicated but track cannot be determined without more context — ' +
        'loan, rental, and crisis paths require different responses.');
    }

    return parts.join(' ');
  }


  /* ────────────────────────────────────────────────────────
     _buildContextBlock
     Injects computed housing assessment into the prompt.
     ──────────────────────────────────────────────────────── */
  function _buildContextBlock(result, profile) {
    var lines = [
      '## HOUSING ASSESSMENT (system-computed — use these values verbatim in your response)'
    ];

    lines.push('Housing track:     ' + result.housingTrack);
    lines.push('Loan eligibility:  ' + result.loanEligibility);
    lines.push('Assistance type:   ' + result.assistanceType);
    lines.push('Urgency level:     ' + result.urgencyLevel);
    lines.push('Reasoning:         ' + result.reasoning);

    if (profile.serviceEra)      { lines.push('Service era:       ' + profile.serviceEra); }
    if (profile.dischargeStatus) { lines.push('Discharge:         ' + profile.dischargeStatus); }
    if (profile.vaRating !== null && profile.vaRating !== undefined) {
      lines.push('VA rating:         ' + profile.vaRating + '%');
    }
    if (profile.housingStatus)   { lines.push('Housing status:    ' + profile.housingStatus); }
    if (profile.income)          { lines.push('Income signal:     ' + profile.income); }

    lines.push('');
    lines.push('INSTRUCTION: Open your response with the HOUSING ASSESSMENT block using the');
    lines.push('values above exactly as computed. Then explain WHY. Then list exact next steps.');
    lines.push('CRITICAL: If urgencyLevel is homeless or urgent, lead with stabilization steps.');
    lines.push('Do NOT discuss VA home loan in a homelessness or urgent eviction response.');

    return lines.join('\n');
  }


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var HousingBenefits = {

    id: 'housing-benefits',
    name: 'Housing Benefits',
    description: 'Decision engine for veteran housing assistance. Hard domain split between VA home loan / ownership and housing instability / rent / homelessness. Determines housing track, loan eligibility, assistance type, and urgency — never conflates the two paths.',

    triggers: [
      // VA home loan signals
      'va home loan', 'va loan', 'buy a home', 'buy a house',
      'mortgage', 'home loan', 'certificate of eligibility', 'coe',
      'va funding fee', 'funding fee', 'refinance', 'irrrl',
      'adapted housing', 'sah grant', 'sha grant', 'nadl',
      // Housing instability signals
      'homeless', 'homelessness', 'no place to stay', 'living in my car',
      'behind on rent', 'eviction', 'evicted', 'cant pay rent',
      'rental assistance', 'rent assistance', 'hud-vash', 'hud vash',
      'ssvf', 'gpd', 'grant and per diem', 'transitional housing',
      'losing my home', 'foreclosure', 'need housing help',
      'housing benefit', 'veteran housing', 'housing assistance'
    ],

    prompt: SKILL_PROMPT,

    phases: [
      { id: 'urgency',     name: 'Assess urgency level'                },
      { id: 'track',       name: 'Determine housing track'             },
      { id: 'eligibility', name: 'Assess loan eligibility / assistance'},
      { id: 'action',      name: 'Execute next steps'                  }
    ],

    requiredFields: [],

    contextFields: ['dischargeStatus', 'serviceEra', 'vaRating', 'housingStatus', 'income'],

    /**
     * Execute the skill against the current context.
     * Runs full housing benefits pipeline and returns a
     * structured result injected into the system prompt.
     *
     * @param {Object} context - { profile, history, userInput, missionPhase }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var profile    = (context && context.profile)   ? context.profile   : {};
      var userInput  = (context && context.userInput) ? context.userInput : '';
      var historyLen = (context && context.history)   ? context.history.length : 0;

      // Phase R6.8: read session context (read-only)
      var _ctx = (window.AIOS && window.AIOS.Memory &&
                  typeof window.AIOS.Memory.getSkillContext === 'function')
        ? window.AIOS.Memory.getSkillContext()
        : { profile: {}, session: { symptoms: [], goals: [], lastActiveSkill: null,
            atRiskSignal: { flagged: false, turn: null, subtype: null } } };
      var _ctxProfile = _ctx.profile;
      var _ctxSession = _ctx.session;

      // ── Step 1: Determine urgency level ───────────────
      var urgencyLevel = _determineUrgencyLevel(profile, userInput);

      // ── Step 2: Determine housing track ───────────────
      var housingTrack = _determineHousingTrack(profile, userInput, urgencyLevel);

      // ── Step 3: Assess loan eligibility ───────────────
      var loanEligibility = _assessLoanEligibility(profile, userInput, housingTrack);

      // ── Step 4: Determine assistance type ─────────────
      var assistanceType = _determineAssistanceType(housingTrack, urgencyLevel, profile, userInput);

      // ── Step 5: Build reasoning ───────────────────────
      var reasoning = _buildReasoning(housingTrack, loanEligibility, assistanceType, urgencyLevel, profile);

      // ── Step 6: Build next actions ────────────────────
      var nextActions = _buildNextActions(housingTrack, loanEligibility, assistanceType, urgencyLevel, profile);

      // ── Assemble structured result ────────────────────
      var housingResult = {
        housingTrack:    housingTrack,
        loanEligibility: loanEligibility,
        assistanceType:  assistanceType,
        urgencyLevel:    urgencyLevel,
        reasoning:       reasoning,
        nextActions:     nextActions
      };

      // ── Flag unknown context fields ───────────────────
      var unknown = [];
      if (!profile.dischargeStatus)  { unknown.push('dischargeStatus'); }
      if (!profile.serviceEra)       { unknown.push('serviceEra'); }
      if (profile.vaRating === null || profile.vaRating === undefined) { unknown.push('vaRating'); }
      if (!profile.housingStatus)    { unknown.push('housingStatus'); }
      if (!profile.income)           { unknown.push('income'); }

      // ── Build data payload ────────────────────────────
      var data = {
        canRespond:    true,
        housingResult: housingResult
      };

      if (unknown.length) { data.unknownFields = unknown; }

      // Phase R6.8: AT_RISK housing escalation — unshift hotline as first action (read-only)
      if (_ctxSession.atRiskSignal.flagged === true &&
          _ctxSession.atRiskSignal.subtype === 'housing') {
        var _hotlineAction = {
          priority: 'URGENT',
          label:    'Call the VA National Call Center for Homeless Veterans',
          detail:   '1-877-4AID-VET (1-877-424-3838) — 24/7, immediate housing crisis support',
          url:      'https://www.va.gov/homeless/'
        };
        nextActions.unshift(_hotlineAction);
        data.atRiskEscalation = true;
        console.log('[AIOS][SKILL][HOUSING] AT_RISK housing escalation: hotline prepended to nextActions');
      }

      // ── Eligibility engine integration ────────────────
      var Elig = window.AIOS && window.AIOS.Eligibility;
      if (Elig && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        if (scores.HOUSING !== undefined) { data.housingScore = scores.HOUSING; }
      }

      // ── Chain to next-action-planner after depth ──────
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Build your complete housing action plan',
          sendText:      'Build me a complete housing action plan',
          missionType:   'housing_benefits',
          missionUpdate: {
            currentStep: 'Confirm housing track and immediate resources',
            nextStep:    'Execute housing stabilization or loan steps'
          }
        };
      }

      // ── Combine context block into full prompt ────────
      var contextBlock = _buildContextBlock(housingResult, profile);
      var fullPrompt   = SKILL_PROMPT + '\n\n' + contextBlock;

      return { prompt: fullPrompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['housing-benefits'] = HousingBenefits;

})();
