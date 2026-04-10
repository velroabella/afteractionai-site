/* ══════════════════════════════════════════════════════════
   AIOS Skill — PACT Act / Toxic Exposure  (Phase R5.3)
   Decision engine for toxic exposure eligibility under the
   PACT Act of 2022 (PL 117-168). Covers burn pits, Agent
   Orange, Gulf War illness, Camp Lejeune, and radiation.
   Returns deterministic exposure classification, presumptive
   status, and exact next steps — never vague eligibility.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Skill prompt — injected into system prompt when active
     ──────────────────────────────────────────────────────── */
  var SKILL_PROMPT = [
    '## ACTIVE SKILL: PACT ACT / TOXIC EXPOSURE DECISION ENGINE',
    '',
    '### YOUR ROLE',
    'You are a toxic exposure eligibility analyst. You classify the veteran\'s exposure type,',
    'determine presumptive status under the PACT Act of 2022, and give exact next steps.',
    'You do NOT say "you may qualify." You explain what applies, why it applies, and what to do next.',
    'This is a decision engine — not a chatbot. Every response ends with a classification and action.',
    '',
    '### DECISION SEQUENCE — APPLY IN ORDER',
    '',
    '**STEP 1 — IDENTIFY EXPOSURE TYPE**',
    'Use service era, deployment locations, and conditions to classify:',
    '',
    'BURN PIT EXPOSURE (post-Gulf War era, Aug 1990–present):',
    '- Served in: Iraq, Afghanistan, Kuwait, Djibouti, Qatar, UAE, Bahrain, Saudi Arabia,',
    '  Syria, Jordan, Yemen, Somalia, Uzbekistan, Philippines, or any Southwest Asia location',
    '- Exposure: open-air burn pits for waste disposal, airborne particulates, toxic smoke',
    '- PACT Act: ALL service members who served in covered locations are presumed exposed',
    '- Presumptive CONDITIONS: all respiratory conditions, constrictive/obliterative bronchiolitis,',
    '  constrictive pericarditis, head/neck/respiratory/reproductive/urinary/lymphatic/',
    '  hematopoietic cancers, glioblastoma, any of 23 PACT Act-listed cancers',
    '',
    'AGENT ORANGE EXPOSURE (Vietnam era, 1962–1975):',
    '- Served in: Vietnam (boots on ground or offshore), Thailand (U-Tapao, Ubon, Nakhon Phanom,',
    '  Udorn, Takhli, Korat, Don Muang), Guam, Johnston Atoll, Korea DMZ (1968–1969)',
    '- Blue Water Navy: served in waters offshore Vietnam (Jan 9, 1962 – May 7, 1975)',
    '- Exposure: herbicide Agent Orange (dioxin TCDD), sprayed for defoliation operations',
    '- Presumptive CONDITIONS: AL amyloidosis, bladder cancer, chronic B-cell leukemias,',
    '  chloracne, diabetes mellitus type 2, Hodgkin\'s disease, hypertension (added PACT Act 2022),',
    '  ischemic heart disease, monoclonal gammopathy / MGUS (added PACT Act 2022), multiple myeloma,',
    '  non-Hodgkin\'s lymphoma, Parkinson\'s disease, peripheral neuropathy (early-onset),',
    '  porphyria cutanea tarda, prostate cancer, respiratory cancers, soft tissue sarcomas',
    '',
    'GULF WAR ILLNESS (Aug 2, 1990–present, theater still active):',
    '- Served in: Southwest Asia theater — Iraq, Kuwait, Saudi Arabia, Bahrain, Qatar, UAE,',
    '  Oman, Gulf of Aden, Gulf of Oman, Persian Gulf, Arabian Sea, Red Sea, Afghanistan,',
    '  Israel, Egypt, Turkey, Syria, Jordan',
    '- Exposure: chemical/biological agents, pesticides, depleted uranium, oil fire smoke, vaccines',
    '- Presumptive CONDITIONS: chronic multisymptom illness (CMI), functional GI disorders,',
    '  fibromyalgia, chronic fatigue syndrome, irritable bowel syndrome, medically unexplained illness',
    '- Presumptive INFECTIONS: brucellosis, Q fever (coxiella burnetii), malaria,',
    '  visceral leishmaniasis, West Nile virus, campylobacter jejuni, nontyphoid salmonella,',
    '  shigella, mycobacterium tuberculosis',
    '- NOTE: Gulf War theater has no end date — still active for presumptive eligibility purposes',
    '',
    'CAMP LEJEUNE WATER CONTAMINATION:',
    '- Served or lived at: Camp Lejeune, NC or MCAS New River, NC',
    '- Period: August 1, 1953 – December 31, 1987 (minimum 30 days on base)',
    '- Exposure: contaminated drinking water — TCE, PCE (dry-cleaning fluid), benzene, vinyl chloride',
    '- Presumptive CONDITIONS (8 cancers): bladder cancer, breast cancer, esophageal cancer,',
    '  kidney cancer, leukemia, multiple myeloma, non-Hodgkin\'s lymphoma, rectal cancer',
    '- Additional covered conditions: neurobehavioral effects, hepatic steatosis, female infertility,',
    '  miscarriage, scleroderma, renal toxicity, myelodysplastic syndromes',
    '- PACT Act: Family members who lived on base 1953–1987 eligible for VA healthcare (10-10EZ)',
    '',
    'RADIATION EXPOSURE (Atomic / Nuclear Veterans):',
    '- Served at: nuclear weapons testing sites (1945–1962) — Pacific Theater, Nevada Test Site,',
    '  Bikini Atoll, Enewetak Atoll, Johnston Island, Christmas Island',
    '- Occupied: Hiroshima or Nagasaki (Aug 6, 1945 – Jul 1, 1946)',
    '- POW in Japan within 200 miles of Hiroshima or Nagasaki during WWII',
    '- Served at: Palomares, Spain (Jan 17 – Mar 31, 1966) or Thule, Greenland (Jan 21 – Sep 25, 1968)',
    '- Occupational: x-ray technician, nuclear power plant duty, ionizing radiation work',
    '- Presumptive CONDITIONS (radiogenic diseases per 38 CFR 3.309(d)): leukemia (not CLL),',
    '  thyroid cancer, breast cancer, lung cancer, bone cancer, liver cancer, colon cancer,',
    '  esophageal cancer, stomach cancer, urinary tract cancer, lymphomas, salivary gland cancer,',
    '  multiple myeloma, and others — 21 specific radiogenic diseases listed in regulation',
    '',
    '**STEP 2 — DETERMINE PRESUMPTIVE STATUS**',
    '- YES: Era AND location AND condition all match a listed presumptive — no nexus letter required',
    '- POSSIBLE: Era matches but location unconfirmed, OR condition adjacent to listed presumptives',
    '- UNKNOWN: Insufficient data — specify exactly what is missing and what it would unlock',
    '',
    '**STEP 3 — DETERMINE CLAIM ACTION**',
    '- NEW CLAIM: No existing VA rating for this condition — file VA Form 21-526EZ',
    '- INCREASE: Condition already rated but has worsened — file Supplemental Claim',
    '- REVIEW: Claim previously denied — file Supplemental Claim (PACT Act = "new and relevant"',
    '  evidence, allowing any prior denial to be reopened — do NOT use Higher-Level Review lane)',
    '',
    '**STEP 4 — DELIVER EXACT NEXT STEPS**',
    'Every response must include:',
    '1. Intent to File (21-0966) for all NEW CLAIM actions — locks effective date immediately',
    '2. Applicable toxic exposure registry enrollment (burn pit registry, Gulf War registry, etc.)',
    '3. Specific VA form number and filing URL',
    '4. Whether nexus letter is required (presumptive = NO, non-presumptive = YES)',
    '5. VSO contact for free claim support',
    '',
    '### REQUIRED OUTPUT STRUCTURE',
    'Every response MUST open with this labeled block:',
    '',
    '**EXPOSURE DETERMINATION**',
    '- Exposure type: [burn-pit-exposure / agent-orange-exposure / gulf-war-illness / camp-lejeune / radiation-exposure / general-toxic-exposure / needs-intake]',
    '- Presumptive status: [YES / POSSIBLE / UNKNOWN]',
    '- Recommended action: [NEW CLAIM / INCREASE / REVIEW]',
    '',
    '**WHY THIS APPLIES**',
    '[1-2 sentences connecting service era + location + condition to the specific presumptive rule]',
    '',
    '**YOUR EXACT NEXT STEPS**',
    '1. [Specific action — name the form, URL, or phone number]',
    '2. [Specific action — registry or records request]',
    '3. [Specific action — claim filing]',
    '4. [Specific action — VSO or support contact]',
    '',
    '### KEY REFERENCES',
    '- PACT Act signed: August 10, 2022 (PL 117-168)',
    '- Burn pit / airborne hazards registry: va.gov/disability/eligibility/hazardous-materials-exposure/airborne-hazards-open-burn-pit-registry/',
    '- Gulf War Registry Health Exam: free, at any VA Medical Center — call 1-800-827-1000',
    '- File claim online: va.gov/disability/apply',
    '- Intent to File (21-0966): va.gov/decision-reviews/intent-to-file — file this FIRST',
    '- Supplemental Claim (20-0995): va.gov/decision-reviews/supplemental-claim',
    '- VA healthcare enrollment: va.gov/health-care/apply or 1-877-222-8387',
    '- VSO free assistance: DAV 1-800-827-1000, VFW vfw.org, American Legion legion.org',
    '- PACT Act hotline: 1-800-MyVA411 (1-800-698-2411)',
    '- Radiation dose assessment: DTRA 1-800-462-3604',
    '- Camp Lejeune family healthcare: 1-866-606-8198',
    '',
    '### HEALTHCARE ELIGIBILITY EXPANSION (PACT Act)',
    '- Post-9/11 veterans (served after Sept 11, 2001): eligible for VA healthcare for 10 years',
    '  from separation — no disability rating or income threshold required',
    '- Gulf War era veterans (served after Aug 2, 1990): same 10-year eligibility window',
    '- Any veteran with toxic exposure: Priority Group 6 or higher for VA healthcare enrollment',
    '- If veteran has NOT enrolled in VA healthcare — this is step zero before any claim work',
    '',
    '### RULES',
    '- NEVER say "you may qualify" or "consider looking into." State what applies and why.',
    '- NEVER omit the EXPOSURE DETERMINATION block — it is required in every response.',
    '- NEVER recommend Higher-Level Review for PACT Act reopen — Supplemental Claim is the correct lane.',
    '- Presumptive = no nexus letter required. State this explicitly. It changes the veteran\'s burden.',
    '- PACT Act allows reopening any previously denied claim — always flag this for prior denials.',
    '- If information is missing, ask ONE specific question and state what that answer will unlock.',
    '- End every response with: Veterans Crisis Line — 988, Press 1.',
    '',
    '[OPTIONS: I served in Southwest Asia (Iraq/Afghanistan) | I served in Vietnam | Gulf War illness symptoms | I was at Camp Lejeune | Atomic/nuclear veteran | My claim was already denied]'
  ].join('\n');


  /* ────────────────────────────────────────────────────────
     ERA CONSTANTS
     Internal normalized values for service era comparison.
     ──────────────────────────────────────────────────────── */
  var ERA = {
    WWII:      'wwii',
    KOREA:     'korea',
    VIETNAM:   'vietnam',
    GULF_WAR:  'gulf-war',
    POST_9_11: 'post-9/11',
    COLD_WAR:  'cold-war',
    UNKNOWN:   'unknown'
  };


  /* ────────────────────────────────────────────────────────
     _normalizeEra
     Maps profile.serviceEra strings to internal ERA constant.
     ──────────────────────────────────────────────────────── */
  function _normalizeEra(serviceEra) {
    if (!serviceEra) return ERA.UNKNOWN;
    var s = serviceEra.toLowerCase();
    if (
      s.indexOf('post-9/11') !== -1 || s.indexOf('post 9/11') !== -1 ||
      s.indexOf('oef') !== -1       || s.indexOf('oif') !== -1 ||
      s.indexOf('ond') !== -1       || s.indexOf('oir') !== -1 ||
      s.indexOf('global war') !== -1 || s.indexOf('gwot') !== -1
    ) { return ERA.POST_9_11; }

    if (
      s.indexOf('gulf war') !== -1    || s.indexOf('desert storm') !== -1 ||
      s.indexOf('desert shield') !== -1 || s.indexOf('persian gulf') !== -1
    ) { return ERA.GULF_WAR; }

    if (
      s.indexOf('vietnam') !== -1 || s.indexOf('viet nam') !== -1 ||
      s.indexOf('southeast asia') !== -1
    ) { return ERA.VIETNAM; }

    if (s.indexOf('korea') !== -1 || s.indexOf('korean') !== -1) { return ERA.KOREA; }

    if (
      s.indexOf('world war ii') !== -1 || s.indexOf('wwii') !== -1 ||
      s.indexOf('world war 2') !== -1  || s.indexOf('ww2') !== -1
    ) { return ERA.WWII; }

    if (s.indexOf('cold war') !== -1) { return ERA.COLD_WAR; }
    return ERA.UNKNOWN;
  }


  /* ────────────────────────────────────────────────────────
     _hasKeyword
     Case-insensitive substring check against a keyword list.
     Returns true on first match.
     ──────────────────────────────────────────────────────── */
  function _hasKeyword(target, keywords) {
    if (!target) return false;
    var t = target.toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (t.indexOf(keywords[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }


  /* ────────────────────────────────────────────────────────
     _buildSearchCorpus
     Combines userInput + deployments + conditions into one
     lowercase string for keyword matching.
     ──────────────────────────────────────────────────────── */
  function _buildSearchCorpus(profile, userInput) {
    return [
      userInput || '',
      (profile.deployments || []).join(' '),
      (profile.conditions  || []).join(' ')
    ].join(' ').toLowerCase();
  }


  /* ────────────────────────────────────────────────────────
     _classifyExposure
     Determines primary exposure category from profile data
     and user input. Priority order prevents false matches:
     specific (Camp Lejeune, radiation) evaluated before
     general (burn pit, Gulf War).
     Returns one of 7 category strings.
     ──────────────────────────────────────────────────────── */
  function _classifyExposure(profile, userInput) {
    var era     = _normalizeEra(profile.serviceEra);
    var corpus  = _buildSearchCorpus(profile, userInput);

    // ── Camp Lejeune — location-specific, era-independent ──
    if (_hasKeyword(corpus, ['camp lejeune', 'lejeune', 'mcas new river', 'new river nc'])) {
      return 'camp-lejeune';
    }

    // ── Radiation — testing sites and specific duty locations ──
    if (_hasKeyword(corpus, [
      'bikini', 'enewetak', 'johnston island', 'johnston atoll', 'christmas island',
      'nevada test site', 'palomares', 'thule', 'hiroshima', 'nagasaki',
      'nuclear test', 'atomic test', 'atomic veteran', 'nuclear weapons test',
      'ionizing radiation', 'radiogenic'
    ])) { return 'radiation-exposure'; }

    // ── Agent Orange — Vietnam era or specific AO locations ──
    if (
      era === ERA.VIETNAM ||
      _hasKeyword(corpus, [
        'vietnam', 'viet nam', 'agent orange', 'dioxin',
        'thailand',
        'u-tapao', 'ubon', 'nakhon phanom', 'udorn', 'takhli', 'korat', 'don muang',
        'guam', 'johnston atoll', 'korea dmz', 'korean dmz',
        'blue water navy', 'offshore vietnam'
      ])
    ) { return 'agent-orange-exposure'; }

    // ── Burn Pit vs Gulf War — both share Southwest Asia theater
    //    Post-9/11 era or explicit burn pit keywords → burn pit
    //    Gulf War era without post-9/11 signals → Gulf War illness ──
    var isBurnPitSignal = (
      era === ERA.POST_9_11 ||
      _hasKeyword(corpus, [
        'iraq', 'afghanistan', 'djibouti', 'uzbekistan', 'somalia', 'yemen',
        'burn pit', 'open burn pit', 'airborne hazard',
        'operation enduring freedom', 'operation iraqi freedom', 'operation new dawn',
        'constrictive bronchiolitis', 'obliterative bronchiolitis', 'constrictive pericarditis'
      ])
    );
    if (isBurnPitSignal) { return 'burn-pit-exposure'; }

    var isGulfWarSignal = (
      era === ERA.GULF_WAR ||
      _hasKeyword(corpus, [
        'kuwait', 'saudi arabia', 'bahrain', 'persian gulf', 'arabian sea', 'red sea',
        'gulf of aden', 'gulf of oman', 'desert storm', 'desert shield',
        'gulf war', 'chronic multisymptom', 'gulf war illness', 'gulf war syndrome',
        'fibromyalgia', 'chronic fatigue', 'irritable bowel',
        'medically unexplained', 'undiagnosed illness',
        'fatigue', 'joint pain', 'muscle pain', 'brain fog'
      ])
    );
    if (isGulfWarSignal) { return 'gulf-war-illness'; }

    // ── General toxic exposure — catch-all for known-toxic signals ──
    if (_hasKeyword(corpus, [
      'toxic', 'chemical exposure', 'contamination', 'hazardous material',
      'pesticide', 'depleted uranium', 'asbestos', 'mesothelioma', 'beryllium',
      'lead poisoning', 'solvent', 'jet fuel'
    ])) { return 'general-toxic-exposure'; }

    // ── Needs intake — insufficient data to classify ──
    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     _assessPresumptiveStatus
     Determines YES / POSSIBLE / UNKNOWN based on how
     completely era + location + condition signals align
     with the relevant presumptive statute.
     Returns { status: string, reasoning: string }
     ──────────────────────────────────────────────────────── */
  function _assessPresumptiveStatus(exposureType, profile, userInput) {
    var era    = _normalizeEra(profile.serviceEra);
    var corpus = _buildSearchCorpus(profile, userInput);

    switch (exposureType) {

      case 'burn-pit-exposure': {
        var hasLoc = _hasKeyword(corpus, [
          'iraq', 'afghanistan', 'djibouti', 'kuwait', 'qatar', 'uae', 'bahrain',
          'saudi', 'syria', 'jordan', 'yemen', 'somalia', 'uzbekistan', 'philippines',
          'burn pit', 'southwest asia', 'airborne hazard'
        ]);
        var hasEra = (era === ERA.POST_9_11 || era === ERA.GULF_WAR || hasLoc); // location confirms era for burn pits
        var hasCond = (profile.conditions && profile.conditions.length > 0) ||
          _hasKeyword(corpus, [
            'cancer', 'respiratory', 'bronchiolitis', 'lung', 'sinus', 'asthma',
            'rhinitis', 'sleep apnea', 'glioblastoma', 'head and neck', 'leukemia',
            'breathing', 'shortness of breath', 'cough', 'wheez', 'chest'
          ]);
        if (hasEra && hasLoc && hasCond) {
          return {
            status: 'YES',
            reasoning: 'Service in a PACT Act-covered location during Gulf War or post-9/11 era ' +
              'with a respiratory or cancer condition meets all three presumptive thresholds. ' +
              'No separate nexus letter is needed once a qualifying diagnosis is confirmed — ' +
              'service connection may be established by law. ' +
              'If you are describing symptoms only, you will need a medical diagnosis before filing.'
          };
        }
        if (hasEra || hasLoc) {
          return {
            status: 'POSSIBLE',
            reasoning: 'Partial signal present. To reach YES: confirm ' +
              (!hasEra ? 'service era (must be post-Aug 2, 1990) ' : '') +
              (!hasLoc ? 'specific Southwest Asia deployment location ' : '') +
              (!hasCond ? 'and a diagnosed condition ' : '') + '.'
          };
        }
        return {
          status: 'UNKNOWN',
          reasoning: 'Cannot confirm burn pit exposure without service era and deployment location. ' +
            'Provide: where you served and approximately when.'
        };
      }

      case 'agent-orange-exposure': {
        var hasAOEra = (era === ERA.VIETNAM);
        var hasAOLoc = _hasKeyword(corpus, [
          'vietnam', 'viet nam', 'thailand', 'guam', 'johnston atoll',
          'korea dmz', 'korean dmz', 'blue water', 'offshore vietnam',
          'u-tapao', 'ubon', 'korat', 'nakhon phanom', 'udorn', 'takhli', 'don muang'
        ]);
        var hasAOCond = _hasKeyword(corpus, [
          'prostate', 'diabetes', 'parkinson', 'non-hodgkin', 'ischemic heart', 'heart disease',
          'multiple myeloma', 'bladder cancer', 'hypertension', 'peripheral neuropathy',
          'hodgkin', 'soft tissue sarcoma', 'chloracne', 'al amyloidosis', 'mgus',
          'b-cell leukemia', 'porphyria', 'respiratory cancer', 'lung cancer'
        ]);
        if ((hasAOEra || hasAOLoc) && hasAOCond) {
          return {
            status: 'YES',
            reasoning: 'Vietnam-era service location confirmed with a listed Agent Orange presumptive condition. ' +
              'Service connection may be established by law once a qualifying diagnosis is confirmed — ' +
              'no separate nexus letter or proof of direct herbicide exposure required. ' +
              'If you are describing symptoms only, you will need a medical diagnosis before filing.'
          };
        }
        if (hasAOEra || hasAOLoc) {
          return {
            status: 'POSSIBLE',
            reasoning: 'Vietnam-era service or Agent Orange exposure location confirmed. ' +
              'Any listed presumptive condition diagnosed now or in the future qualifies without nexus proof. ' +
              'Confirm current diagnosis to complete claim.'
          };
        }
        return {
          status: 'UNKNOWN',
          reasoning: 'Need confirmation of Vietnam-era service, Thailand base assignment, ' +
            'Blue Water Navy service, or other confirmed Agent Orange exposure location.'
        };
      }

      case 'gulf-war-illness': {
        var hasGWEra = (era === ERA.GULF_WAR || era === ERA.POST_9_11);
        var hasGWLoc = _hasKeyword(corpus, [
          'kuwait', 'saudi', 'iraq', 'bahrain', 'qatar', 'oman', 'uae',
          'persian gulf', 'arabian sea', 'red sea', 'gulf of aden', 'gulf of oman',
          'desert storm', 'desert shield', 'gulf war', 'afghanistan', 'israel', 'egypt', 'turkey'
        ]);
        var hasGWCond = _hasKeyword(corpus, [
          'chronic multisymptom', 'fibromyalgia', 'chronic fatigue',
          'irritable bowel', 'functional gi', 'undiagnosed', 'medically unexplained',
          'gulf war illness', 'fatigue', 'joint pain', 'muscle pain', 'headache',
          'cognitive impairment', 'brain fog', 'rash', 'memory loss'
        ]);
        if ((hasGWEra || hasGWLoc) && hasGWCond) {
          return {
            status: 'YES',
            reasoning: 'Southwest Asia theater service confirmed with chronic multisymptom or ' +
              'functional illness. VA may presume these conditions are connected to Gulf War service ' +
              'once a qualifying diagnosis is confirmed — no proof of specific cause required. ' +
              'Theater remains active with no end date. ' +
              'If you are describing symptoms only, you will need a medical diagnosis before filing.'
          };
        }
        if (hasGWEra || hasGWLoc) {
          return {
            status: 'POSSIBLE',
            reasoning: 'Southwest Asia service confirmed. A physician-documented chronic multisymptom ' +
              'illness (must persist 6 months or more at 10% or greater degree) completes the presumptive claim.'
          };
        }
        return {
          status: 'UNKNOWN',
          reasoning: 'Need confirmation of Southwest Asia theater service (Aug 2, 1990–present) ' +
            'and documentation of chronic symptoms lasting 6+ months.'
        };
      }

      case 'camp-lejeune': {
        var hasCLLoc = _hasKeyword(corpus, ['camp lejeune', 'lejeune', 'new river']);
        var hasCLCond = _hasKeyword(corpus, [
          'bladder cancer', 'breast cancer', 'esophageal cancer', 'kidney cancer',
          'leukemia', 'multiple myeloma', 'non-hodgkin', 'rectal cancer',
          'hepatic steatosis', 'scleroderma', 'miscarriage', 'infertility',
          'myelodysplastic', 'neurobehavioral', 'renal toxicity', 'cancer'
        ]);
        if (hasCLLoc && hasCLCond) {
          return {
            status: 'YES',
            reasoning: 'Camp Lejeune service with a covered condition. ' +
              'PACT Act may establish presumptive service connection for all 8 listed cancers and additional conditions ' +
              'once a qualifying diagnosis is confirmed. ' +
              'Service period Aug 1, 1953 – Dec 31, 1987 (minimum 30 days) must be confirmed by service records. ' +
              'If you are describing symptoms only, you will need a medical diagnosis before filing.'
          };
        }
        if (hasCLLoc) {
          return {
            status: 'POSSIBLE',
            reasoning: 'Camp Lejeune / MCAS New River location confirmed. ' +
              'Three criteria must be met: (1) service Aug 1953 – Dec 1987, (2) minimum 30 days on base, ' +
              '(3) a covered condition. Confirm all three to lock in presumptive status.'
          };
        }
        return {
          status: 'UNKNOWN',
          reasoning: 'Need confirmed service at Camp Lejeune, NC or MCAS New River, NC ' +
            'during the period August 1, 1953 through December 31, 1987.'
        };
      }

      case 'radiation-exposure': {
        var hasRadLoc = _hasKeyword(corpus, [
          'bikini', 'enewetak', 'johnston island', 'christmas island',
          'nevada test site', 'palomares', 'thule', 'hiroshima', 'nagasaki',
          'nuclear test', 'atomic test', 'atomic veteran', 'nuclear weapons'
        ]);
        var hasRadCond = _hasKeyword(corpus, [
          'leukemia', 'thyroid cancer', 'breast cancer', 'lung cancer', 'bone cancer',
          'liver cancer', 'colon cancer', 'esophageal cancer', 'stomach cancer',
          'urinary tract cancer', 'lymphoma', 'salivary gland', 'multiple myeloma',
          'radiogenic', 'cancer'
        ]);
        if (hasRadLoc && hasRadCond) {
          return {
            status: 'YES',
            reasoning: 'Service at a nuclear testing or ionizing radiation exposure location ' +
              'with a radiogenic disease may qualify under 38 CFR 3.309(d) once a qualifying diagnosis is confirmed. ' +
              'No separate nexus letter is needed — the VA may presume radiation caused the condition. ' +
              'If you are describing symptoms only, you will need a medical diagnosis before filing.'
          };
        }
        if (hasRadLoc) {
          return {
            status: 'POSSIBLE',
            reasoning: 'Radiation exposure location confirmed. A diagnosed radiogenic disease ' +
              'from the 38 CFR 3.309(d) list is required to complete the presumptive claim. ' +
              'Request a DTRA radiation dose assessment to quantify exposure level.'
          };
        }
        return {
          status: 'UNKNOWN',
          reasoning: 'Need confirmed service at a nuclear testing site, Hiroshima/Nagasaki occupation, ' +
            'Palomares, Thule, or confirmed ionizing radiation duty assignment.'
        };
      }

      case 'general-toxic-exposure':
        return {
          status: 'POSSIBLE',
          reasoning: 'Toxic exposure signal detected but specific program not yet identified. ' +
            'Additional intake — specifically service location and diagnosed condition — ' +
            'is required to map to the applicable presumptive statute.'
        };

      default: // 'needs-intake'
        return {
          status: 'UNKNOWN',
          reasoning: 'Insufficient data to classify exposure type. ' +
            'Required: service era, deployment location, and current diagnosed conditions.'
        };
    }
  }


  /* ────────────────────────────────────────────────────────
     _determineRecommendedAction
     Returns NEW CLAIM / INCREASE / REVIEW based on
     profile disability signals and user input keywords.
     ──────────────────────────────────────────────────────── */
  function _determineRecommendedAction(profile, userInput) {
    var input = (userInput || '').toLowerCase();

    // Prior denial or appeal signal → Supplemental Claim reopen
    if (_hasKeyword(input, [
      'denied', 'denial', 'rejected', 'appeal', 'previously filed',
      'already filed', 'reopened', 'reopen', 'they denied'
    ])) { return 'REVIEW'; }

    var vaRating = (profile.vaRating !== null && profile.vaRating !== undefined)
      ? profile.vaRating : -1;

    // Has an existing rating — determine if worsening (INCREASE) or new condition (NEW CLAIM)
    if (vaRating > 0) {
      if (_hasKeyword(input, [
        'worse', 'worsened', 'increase', 'getting worse', 'deteriorated',
        'more severe', 'progressed', 'flare', 'worsening'
      ])) { return 'INCREASE'; }
      // New condition not previously claimed
      return 'NEW CLAIM';
    }

    // No existing rating or 0% — new claim
    return 'NEW CLAIM';
  }


  /* ────────────────────────────────────────────────────────
     _buildNextActions
     Returns ordered array of exact action strings tailored
     to exposure type, presumptive status, and claim action.
     Every action names a specific form, URL, or phone number.
     ──────────────────────────────────────────────────────── */
  function _buildNextActions(exposureType, presumptiveStatus, recommendedAction, profile) {
    var actions = [];
    var vaRating = (profile && profile.vaRating !== null && profile.vaRating !== undefined)
      ? profile.vaRating : -1;

    // ── Action 1: Intent to File — locks effective date for all new claims ──
    if (recommendedAction === 'NEW CLAIM') {
      actions.push(
        'File Intent to File (VA Form 21-0966) TODAY at va.gov/decision-reviews/intent-to-file — ' +
        'this locks in your effective date while you gather supporting documents. ' +
        'Takes 5 minutes online. Benefits paid back to this date if claim is approved.'
      );
    }

    // ── Action 2: VA healthcare enrollment if not yet in system ──
    if (vaRating < 0) {
      actions.push(
        'Enroll in VA healthcare at va.gov/health-care/apply or call 1-877-222-8387. ' +
        'PACT Act expanded eligibility — post-9/11 and Gulf War veterans qualify for 10 years ' +
        'from separation with no disability rating required. This is step zero.'
      );
    }

    // ── Action 3: Exposure-type registry or records request ──
    switch (exposureType) {
      case 'burn-pit-exposure':
        actions.push(
          'Register with the Airborne Hazards and Open Burn Pit Registry (AHOBPR) at ' +
          'va.gov/disability/eligibility/hazardous-materials-exposure/airborne-hazards-open-burn-pit-registry/ — ' +
          'documents your exposure history and connects you to a free health evaluation. ' +
          'Registry enrollment strengthens your claim file.'
        );
        break;
      case 'agent-orange-exposure':
        actions.push(
          'Request military records confirming deployment via milConnect at milconnect.dmdc.osd.mil ' +
          'or call the National Personnel Records Center: 1-314-801-0800. ' +
          'Your DD-214 with deployment stamps or unit orders to Vietnam/Thailand/Guam ' +
          'are the primary evidence for Agent Orange location verification.'
        );
        break;
      case 'gulf-war-illness':
        actions.push(
          'Schedule a Gulf War Registry Health Exam at your nearest VA Medical Center — ' +
          'free, no disability rating required. This exam officially documents your symptoms in VA records. ' +
          'Call 1-800-827-1000 to schedule or ask at any VA facility.'
        );
        break;
      case 'camp-lejeune':
        actions.push(
          'Request service records confirming Camp Lejeune or MCAS New River dates ' +
          'via milConnect or NPRC (1-314-801-0800). ' +
          'If a family member who lived on base, call 1-866-606-8198 for the ' +
          'Camp Lejeune Family Member Program — VA Form 10-10EZ for healthcare enrollment.'
        );
        break;
      case 'radiation-exposure':
        actions.push(
          'Request a Radiation Dose Assessment from the Defense Threat Reduction Agency (DTRA) ' +
          'at 1-800-462-3604 or email DTRA.MBX.ROTA@dtra.mil. ' +
          'This official dose record quantifies your exposure for the VA claim file. ' +
          'Also request your service records confirming testing site assignment.'
        );
        break;
      default:
        actions.push(
          'Request a Toxic Exposure Screening at your nearest VA Medical Center — ' +
          'required under PACT Act for all veterans seen at VA since 2022. ' +
          'This screening creates a formal record of your toxic exposure concerns. ' +
          'Call 1-800-827-1000 to schedule.'
        );
    }

    // ── Action 4: File the actual claim ──
    if (recommendedAction === 'REVIEW') {
      actions.push(
        'File a Supplemental Claim (VA Form 20-0995) at va.gov/decision-reviews/supplemental-claim. ' +
        'The PACT Act constitutes "new and relevant evidence" — this reopens any prior denial. ' +
        'Do NOT use the Higher-Level Review lane. Supplemental Claim is the correct path for PACT Act reopen. ' +
        'A VSO can help you build the strongest possible reopen package.'
      );
    } else {
      var nexusNote = (presumptiveStatus === 'YES')
        ? 'No nexus letter required — presumptive status eliminates the service connection proof burden.'
        : 'A nexus letter from a physician connecting your condition to service is required (condition not yet confirmed presumptive).';
      actions.push(
        'File VA Form 21-526EZ at va.gov/disability/apply or through your VSO. ' +
        nexusNote + ' ' +
        'Select "PACT Act" as the basis when filing to ensure the claim routes correctly.'
      );
    }

    // ── Action 5: VSO support — always last ──
    actions.push(
      'Contact a VSO for free claim representation: ' +
      'DAV (1-800-827-1000), VFW (vfw.org/assistance/va-claims-separation-benefits), ' +
      'or American Legion (legion.org/veteransbenefits). ' +
      'VSOs are accredited, free, and statistically improve claim outcomes. ' +
      'PACT Act hotline: 1-800-MyVA411 (1-800-698-2411).'
    );

    return actions;
  }


  /* ────────────────────────────────────────────────────────
     _buildContextBlock
     Injects the computed exposure assessment into the prompt
     as a structured system note. The AI uses this to open
     the EXPOSURE DETERMINATION block with correct values
     rather than making independent determinations.
     ──────────────────────────────────────────────────────── */
  function _buildContextBlock(result, profile) {
    var lines = [
      '## TOXIC EXPOSURE ASSESSMENT (system-computed — use these values verbatim in your response)'
    ];

    lines.push('Exposure type:         ' + result.exposureType);
    lines.push('Presumptive status:    ' + result.presumptiveStatus);
    lines.push('Recommended action:    ' + result.recommendedAction);
    lines.push('Reasoning:             ' + result.reasoning);

    if (profile.serviceEra)       { lines.push('Service era:           ' + profile.serviceEra); }
    if (profile.branch)           { lines.push('Branch:                ' + profile.branch); }
    if (profile.dischargeStatus)  { lines.push('Discharge:             ' + profile.dischargeStatus); }
    if (profile.vaRating !== null && profile.vaRating !== undefined) {
      lines.push('Current VA rating:     ' + profile.vaRating + '%');
    }
    if (profile.conditions && profile.conditions.length) {
      lines.push('Conditions on file:    ' + profile.conditions.join(', '));
    }
    if (profile.deployments && profile.deployments.length) {
      lines.push('Deployments on file:   ' + profile.deployments.join(', '));
    }

    lines.push('');
    lines.push('INSTRUCTION: Open your response with the EXPOSURE DETERMINATION block using the');
    lines.push('values above exactly as computed. Then explain WHY using the reasoning field.');
    lines.push('Then list exact next steps. Presumptive YES = no nexus letter. POSSIBLE = nexus');
    lines.push('may be required. UNKNOWN = ask ONE specific question before proceeding.');

    return lines.join('\n');
  }


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var PactActToxicExposure = {

    id: 'pact-act-toxic-exposure',
    name: 'PACT Act / Toxic Exposure',
    description: 'Decision engine for PACT Act toxic exposure eligibility — burn pits, Agent Orange, Gulf War illness, Camp Lejeune, radiation. Returns exposure classification, presumptive status, and exact next steps.',

    triggers: [
      'PACT Act', 'toxic exposure', 'burn pit', 'burn pits',
      'Agent Orange', 'Gulf War illness', 'Gulf War syndrome',
      'Camp Lejeune', 'Lejeune', 'atomic veteran', 'nuclear test',
      'radiation exposure', 'airborne hazards', 'open burn pit',
      'presumptive condition', 'toxic exposure registry',
      'Southwest Asia', 'Vietnam herbicide', 'Blue Water Navy',
      'chemical exposure', 'depleted uranium', 'contaminated water',
      'constrictive bronchiolitis', 'herbicide exposure',
      'PACT Act claim', 'PACT Act cancer'
    ],

    prompt: SKILL_PROMPT,

    phases: [
      { id: 'classify',    name: 'Classify exposure type'             },
      { id: 'presumptive', name: 'Determine presumptive status'       },
      { id: 'action',      name: 'Identify claim action'              },
      { id: 'file',        name: 'Execute registry + claim filing'    }
    ],

    requiredFields: ['serviceEra'],

    contextFields: ['serviceEra', 'branch', 'dischargeStatus', 'vaRating', 'conditions', 'deployments'],

    /**
     * Execute the skill against the current context.
     * Runs full exposure classification pipeline and returns
     * a structured result injected into the system prompt.
     *
     * @param {Object} context - { profile, history, userInput, missionPhase }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var profile    = (context && context.profile)   ? context.profile   : {};
      var userInput  = (context && context.userInput) ? context.userInput : '';
      var historyLen = (context && context.history)   ? context.history.length : 0;

      // ── Phase R6.8: read session context (read-only) ──────────────────────
      var _ctx = (window.AIOS && window.AIOS.Memory &&
                  typeof window.AIOS.Memory.getSkillContext === 'function')
        ? window.AIOS.Memory.getSkillContext()
        : { profile: {}, session: { symptoms: [], goals: [], lastActiveSkill: null,
            atRiskSignal: { flagged: false, turn: null, subtype: null } } };
      var _ctxProfile = _ctx.profile;
      var _ctxSession = _ctx.session;

      // ── Step 1: Classify exposure type ────────────────
      var exposureType = _classifyExposure(profile, userInput);

      // ── Phase R6.8: exposure context fallback from session ─────────────────
      // If classification is 'needs-intake' but a prior turn captured an exposure
      // type via extractSessionSignals, use it to maintain PACT_ACT reasoning
      // instead of falling through to the generic unknown response.
      if (exposureType === 'needs-intake' &&
          _ctxProfile.exposureContext && _ctxProfile.exposureContext.type) {
        var _expTypeMap = {
          'burn-pit':     'burn-pit-exposure',
          'agent-orange': 'agent-orange-exposure',
          'camp-lejeune': 'camp-lejeune',
          'gulf-war':     'gulf-war-illness',
          'radiation':    'radiation-exposure'
        };
        var _mapped = _expTypeMap[_ctxProfile.exposureContext.type];
        if (_mapped) {
          exposureType = _mapped;
          console.log('[AIOS][SKILL][PACT_ACT] Context fallback: needs-intake → ' + exposureType);
        }
      }

      // ── Step 2: Assess presumptive status ─────────────
      var presumptiveResult = _assessPresumptiveStatus(exposureType, profile, userInput);

      // ── Step 3: Determine recommended claim action ────
      var recommendedAction = _determineRecommendedAction(profile, userInput);

      // ── Step 4: Build ordered next actions ────────────
      var nextActions = _buildNextActions(
        exposureType,
        presumptiveResult.status,
        recommendedAction,
        profile
      );

      // ── Assemble structured exposure result ───────────
      var exposureResult = {
        exposureType:      exposureType,
        presumptiveStatus: presumptiveResult.status,
        recommendedAction: recommendedAction,
        reasoning:         presumptiveResult.reasoning,
        nextActions:       nextActions
      };

      // ── Flag unknown context fields ───────────────────
      var unknown = [];
      if (!profile.serviceEra)   { unknown.push('serviceEra'); }
      if (!profile.branch)       { unknown.push('branch'); }
      if (!profile.dischargeStatus) { unknown.push('dischargeStatus'); }
      if (profile.vaRating === null || profile.vaRating === undefined) { unknown.push('vaRating'); }
      if (!profile.conditions  || !profile.conditions.length)  { unknown.push('conditions'); }
      if (!profile.deployments || !profile.deployments.length) { unknown.push('deployments'); }

      // ── Build data payload ────────────────────────────
      var data = {
        canRespond:     true,
        exposureResult: exposureResult
      };

      if (unknown.length) { data.unknownFields = unknown; }

      // ── Healthcare expansion eligibility flag ─────────
      // High-value signal: veteran likely eligible for expanded VA healthcare
      // under PACT Act but may not be enrolled.
      var era = _normalizeEra(profile.serviceEra);
      if (
        era === ERA.POST_9_11 ||
        era === ERA.GULF_WAR  ||
        exposureType === 'burn-pit-exposure'    ||
        exposureType === 'agent-orange-exposure' ||
        exposureType === 'camp-lejeune'
      ) {
        data.healthcareExpansionEligible = true;
      }

      // ── Eligibility engine integration ───────────────
      var Elig = window.AIOS && window.AIOS.Eligibility;
      if (Elig && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        if (scores.DISABILITY_COMP !== undefined) { data.disabilityScore = scores.DISABILITY_COMP; }
        if (scores.HEALTHCARE      !== undefined) { data.healthcareScore = scores.HEALTHCARE; }
      }

      // ── Chain to next-action-planner after depth ──────
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Build your complete PACT Act action plan',
          sendText:      'Build me a complete PACT Act benefits action plan',
          missionType:   'toxic_exposure_claim',
          missionUpdate: {
            currentStep: 'Confirm exposure classification and file Intent to File',
            nextStep:    'Submit VA Form 21-526EZ with PACT Act presumptive basis'
          }
        };
      }

      // ── Combine context block into full prompt ────────
      var contextBlock = _buildContextBlock(exposureResult, profile);
      var fullPrompt   = SKILL_PROMPT + '\n\n' + contextBlock;

      return { prompt: fullPrompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['pact-act-toxic-exposure'] = PactActToxicExposure;

})();
