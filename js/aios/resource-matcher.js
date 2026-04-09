/* ══════════════════════════════════════════════════════════
   AIOS — Resource Matcher  (Phase 50)

   Intelligence layer that connects AI response text to the
   platform's internal resource datasets and pages.

   Input:   ResponseContract + user profile context
   Output:  Array of matched resources with name, page, category,
            confidence score, and source dataset.

   DESIGN PRINCIPLES:
   - Read-only: NEVER modifies data/*.json files.
   - Lazy-loading: fetches datasets on first use, caches in memory.
   - Graceful degradation: if any fetch fails, returns empty matches.
   - Keyword-based matching with weighted scoring.
   - Zero dependencies beyond window.AIOS namespace.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Dataset Registry
     Maps dataset keys to their fetch path, internal page,
     and field accessors (different schemas across files).
     ──────────────────────────────────────────────────────── */

  var DATASETS = {
    resources: {
      path: 'data/resources.json',
      page: 'resources.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    hotlines: {
      path: 'data/hotlines-escalation.json',
      page: 'hotlines-escalation.html',
      nameField: 'name',
      descField: 'description',
      catField:  'issue_type',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    families: {
      path: 'data/families-support.json',
      page: 'families-support.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) {
        if (raw && raw.resources && Array.isArray(raw.resources)) return raw.resources;
        if (Array.isArray(raw)) return raw;
        return [];
      }
    },
    grants: {
      path: 'data/grants-scholarships.json',
      page: 'grants-scholarships.html',
      nameField: 'program_name',
      descField: 'eligibility',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    state_benefits: {
      path: 'data/state-benefits.json',
      page: 'state-benefits.html',
      nameField: 'benefit_name',
      descField: 'summary',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    wellness: {
      path: 'data/wellness.json',
      page: 'wellness.html',
      nameField: 'name',
      descField: 'desc',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    service_dogs: {
      path: 'data/service_dogs.json',
      page: 'service-dogs.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    licensure: {
      path: 'data/licensure.json',
      page: 'licensure.html',
      nameField: 'civilian_pathway',
      descField: 'requirements_summary',
      catField:  'military_job_code',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    document_templates: {
      path: 'data/document-templates.json',
      page: 'document-templates.html',
      nameField: 'title',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    military_discounts: {
      path: 'data/military-discounts.json',
      page: 'military-discounts.html',
      nameField: 'name',
      descField: 'discount',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    elected_officials: {
      path: 'data/elected-officials.json',
      page: 'elected-officials.html',
      nameField: 'full_name',
      descField: 'title',
      catField:  'chamber',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    medical_resources: {
      path: 'data/medical-resources.json',
      page: 'medical-help.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category_normalized',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    hidden_benefits: {
      path: 'data/hidden-benefits.json',
      page: 'hidden-benefits.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    emergency_assistance: {
      path: 'data/emergency-assistance.json',
      page: 'emergency-assistance.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    transition_resources: {
      path: 'data/transition-resources.json',
      page: 'transition-guide.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    financial_resources: {
      path: 'data/financial-resources.json',
      page: 'financial-optimization.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    outdoor_recreation: {
      path: 'data/outdoor-recreation.json',
      page: 'outdoor-recreation.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    },
    contractor_careers: {
      path: 'data/contractor-careers.json',
      page: 'contractor-careers.html',
      nameField: 'name',
      descField: 'description',
      catField:  'category',
      extract: function(raw) { return Array.isArray(raw) ? raw : []; }
    }
  };


  /* ────────────────────────────────────────────────────────
     Keyword Families
     Map topic keywords to the datasets most likely to contain
     relevant matches. Higher weight = stronger signal.
     ──────────────────────────────────────────────────────── */

  var KEYWORD_FAMILIES = [
    {
      keywords: ['disability', 'va claim', 'va rating', 'compensation', 'service-connected', 'service connected', 'nexus', 'c&p exam', 'dbq'],
      datasets: ['resources', 'document_templates', 'hidden_benefits'],
      categoryHint: 'disability_compensation',
      weight: 3
    },
    {
      keywords: ['healthcare', 'health care', 'va hospital', 'medical', 'enrollment', 'mental health', 'ptsd', 'tbi', 'therapy', 'counseling'],
      datasets: ['hotlines', 'resources', 'wellness', 'medical_resources'],
      categoryHint: 'healthcare',
      weight: 3
    },
    {
      keywords: ['education', 'gi bill', 'school', 'degree', 'college', 'training', 'voc rehab', 'vr&e', 'chapter 31', 'chapter 33', 'scholarship', 'grant', 'grants and scholarships', 'tuition'],
      datasets: ['grants', 'resources', 'licensure'],
      categoryHint: 'education',
      weight: 3
    },
    {
      keywords: ['employment', 'job', 'career', 'resume', 'interview', 'hiring', 'transition', 'work', 'usajobs', 'federal resume'],
      datasets: ['resources', 'licensure', 'document_templates'],
      categoryHint: 'employment',
      weight: 2
    },
    {
      keywords: ['housing', 'home loan', 'va loan', 'mortgage', 'rent', 'homeless', 'hud-vash', 'ssvf', 'shelter'],
      datasets: ['grants', 'resources', 'hotlines', 'emergency_assistance', 'hidden_benefits'],
      categoryHint: 'housing',
      weight: 3
    },
    {
      keywords: ['crisis', 'suicide', 'emergency', 'hotline', '988', 'crisis line', 'distress'],
      datasets: ['hotlines', 'emergency_assistance'],
      categoryHint: 'crisis_support',
      weight: 5
    },
    {
      keywords: ['family', 'spouse', 'dependent', 'survivor', 'gold star', 'caregiver', 'dic', 'champva'],
      datasets: ['families', 'grants'],
      categoryHint: 'family_survivor',
      weight: 2
    },
    {
      keywords: ['legal', 'power of attorney', 'will', 'appeal', 'claim letter', 'personal statement', 'hipaa', 'records request'],
      datasets: ['document_templates', 'resources'],
      categoryHint: 'legal',
      weight: 2
    },
    {
      keywords: ['state benefit', 'state veteran', 'property tax', 'state program'],
      datasets: ['state_benefits'],
      categoryHint: 'state_benefits',
      weight: 2
    },
    {
      keywords: ['service dog', 'therapy dog', 'emotional support', 'canine'],
      datasets: ['service_dogs'],
      categoryHint: null,
      weight: 2
    },
    {
      keywords: ['wellness', 'fitness', 'yoga', 'meditation', 'adaptive sport'],
      datasets: ['wellness'],
      categoryHint: null,
      weight: 2
    },
    {
      keywords: ['outdoor', 'recreation', 'park pass', 'national park', 'state park', 'hunting license', 'fishing license', 'camping', 'ski', 'hiking', 'bass pro', 'cabela', 'adventure program', 'adaptive outdoor', 'fly fishing veteran'],
      datasets: ['outdoor_recreation', 'wellness'],
      categoryHint: null,
      weight: 2
    },
    {
      keywords: ['contractor', 'defense contractor', 'clearance', 'security clearance', 'cleared job', 'lockheed', 'raytheon', 'northrop', 'booz allen', 'saic', 'leidos', 'dod 8570', 'dod 8140', 'cissp', 'security plus', 'contractor career', 'intelligence career', 'cleared professional', 'skillbridge employer'],
      datasets: ['contractor_careers'],
      categoryHint: 'contractor_career',
      weight: 3
    },
    {
      keywords: ['tdiu', 'individual unemployability', 'total disability'],
      datasets: ['resources', 'document_templates'],
      categoryHint: 'tdiu',
      weight: 3
    },
    {
      keywords: ['license', 'certification', 'mos', 'credential', 'civilian pathway'],
      datasets: ['licensure'],
      categoryHint: 'employment',
      weight: 2
    },
    {
      keywords: ['discount', 'military discount', 'veteran discount', 'save money', 'savings', 'deals', 'offers', 'cheap', 'coupon', 'promo'],
      datasets: ['military_discounts'],
      categoryHint: null,
      weight: 2
    },
    {
      keywords: ['congressman', 'senator', 'representative', 'elected official', 'legislator', 'congress', 'advocate', 'veteran affairs committee'],
      datasets: ['elected_officials'],
      categoryHint: null,
      weight: 2
    },
    {
      keywords: ['treatment', 'alternative therapy', 'psychedelic', 'ketamine', 'ibogaine', 'psilocybin', 'ayahuasca', 'holistic', 'telehealth', 'brain injury treatment'],
      datasets: ['medical_resources'],
      categoryHint: 'healthcare',
      weight: 2
    },
    {
      keywords: ['hidden benefit', 'hidden veteran', 'overlooked benefit', 'unclaimed', 'missing benefit', 'benefits missing', 'benefits am i missing', 'benefit i', 'benefits i', 'other benefit', 'what else', 'am i getting everything', 'don\'t know about', 'clothing allowance', 'life insurance veteran', 'vmli', 'sdvi', 'vgli', 'tax exemption veteran', 'property tax exemption', 'national park pass', 'commissary access'],
      datasets: ['hidden_benefits'],
      categoryHint: null,
      weight: 3
    },
    {
      keywords: ['transition', 'transitioning', 'getting out', 'got out', 'leaving military', 'left military', 'separating', 'separation', 'ets', 'civilian life', 'after the military', 'after military', 'next steps', 'post military', 'post-military', 'dd-214', 'dd214', 'skillbridge', 'tap program'],
      datasets: ['transition_resources', 'resources', 'licensure', 'grants'],
      categoryHint: 'employment',
      weight: 3
    },
    {
      keywords: ['financial optimization', 'save money', 'saving money', 'financial position', 'financial health', 'maximize benefits', 'money management', 'budgeting', 'budget plan', 'income strategy', 'tax savings', 'tax exemption', 'property tax', 'financial planning', 'debt management', 'win financially'],
      datasets: ['financial_resources', 'military_discounts', 'hidden_benefits', 'state_benefits'],
      categoryHint: null,
      weight: 3
    },
    {
      keywords: ['emergency assistance', 'emergency help', 'urgent help', 'financial emergency', 'financial crisis', 'financial distress', 'financial assist', 'need help now', 'can\'t pay rent', 'can\'t pay my', 'can\'t pay bills', 'can\'t afford', 'cant afford', 'lose my home', 'food bank', 'food pantry', 'food assistance', 'no food', 'hungry', 'groceries', 'utility shutoff', 'utility bill', 'shutoff notice', 'electric bill', 'gas bill', 'water bill', 'power shut', 'about to be evicted', 'homeless veteran', 'need help paying', 'need money for', 'nowhere to turn', 'desperate', 'behind on my', 'low on money', 'running out of money', 'help with utilities', 'help with bills', 'programs to help'],
      datasets: ['emergency_assistance', 'hotlines'],
      categoryHint: 'crisis_support',
      weight: 5
    }
  ];


  /* ────────────────────────────────────────────────────────
     In-Memory Cache
     ──────────────────────────────────────────────────────── */
  var _cache = {};       // datasetKey → records[]
  var _loading = {};     // datasetKey → Promise
  var _failed = {};      // datasetKey → true (permanently skip)


  /* ────────────────────────────────────────────────────────
     Internal Helpers
     ──────────────────────────────────────────────────────── */

  /** Fetch + cache a single dataset. Returns a Promise of records[]. */
  function _loadDataset(key) {
    if (_cache[key]) return Promise.resolve(_cache[key]);
    if (_failed[key]) return Promise.resolve([]);
    if (_loading[key]) return _loading[key];

    var ds = DATASETS[key];
    if (!ds) return Promise.resolve([]);

    _loading[key] = fetch(ds.path)
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(raw) {
        var records = ds.extract(raw);
        _cache[key] = records;
        delete _loading[key];
        return records;
      })
      .catch(function(err) {
        console.warn('[AIOS][RESOURCE-MATCHER] failed to load ' + key + ':', err.message || err);
        _failed[key] = true;
        delete _loading[key];
        return [];
      });

    return _loading[key];
  }


  /**
   * Extract keyword signals from contract text.
   * Scans raw text + recommended_actions + resources for keyword matches.
   * Returns: { matchedFamilies: [], relevantDatasets: Set, textLower: string }
   */
  function _extractSignals(contract) {
    // Build a single searchable string from all contract text
    var parts = [];
    if (contract.raw)     parts.push(contract.raw);
    if (contract.summary) parts.push(contract.summary);
    if (contract.recommended_actions) {
      for (var i = 0; i < contract.recommended_actions.length; i++) {
        if (contract.recommended_actions[i].text) {
          parts.push(contract.recommended_actions[i].text);
        }
      }
    }
    if (contract.follow_up_question) parts.push(contract.follow_up_question);

    var textLower = parts.join(' ').toLowerCase();
    var matchedFamilies = [];
    var relevantDatasets = {};

    for (var f = 0; f < KEYWORD_FAMILIES.length; f++) {
      var family = KEYWORD_FAMILIES[f];
      var hitCount = 0;
      for (var k = 0; k < family.keywords.length; k++) {
        if (textLower.indexOf(family.keywords[k]) !== -1) {
          hitCount++;
        }
      }
      if (hitCount > 0) {
        matchedFamilies.push({
          family: family,
          hitCount: hitCount,
          score: hitCount * family.weight
        });
        for (var d = 0; d < family.datasets.length; d++) {
          relevantDatasets[family.datasets[d]] = true;
        }
      }
    }

    // Sort families by score descending
    matchedFamilies.sort(function(a, b) { return b.score - a.score; });

    return {
      matchedFamilies: matchedFamilies,
      relevantDatasets: Object.keys(relevantDatasets),
      textLower: textLower
    };
  }


  /**
   * Score an individual resource record against the AI response text.
   * Returns 0-1 confidence score.
   */
  function _scoreRecord(record, ds, textLower) {
    var name = (record[ds.nameField] || '').toLowerCase();
    var desc = (record[ds.descField] || '').toLowerCase();
    var score = 0;

    // Exact name match in AI text: very strong signal
    if (name.length > 3 && textLower.indexOf(name) !== -1) {
      score += 0.6;
    }

    // Name word overlap (partial match): moderate signal
    var nameWords = name.split(/\s+/).filter(function(w) { return w.length > 3; });
    var wordHits = 0;
    for (var i = 0; i < nameWords.length; i++) {
      if (textLower.indexOf(nameWords[i]) !== -1) wordHits++;
    }
    if (nameWords.length > 0) {
      score += 0.25 * (wordHits / nameWords.length);
    }

    // Description keyword overlap: weak signal (just checks key terms)
    var descWords = desc.split(/\s+/).filter(function(w) { return w.length > 5; });
    var descHits = 0;
    var descSample = descWords.slice(0, 20); // cap to avoid noise
    for (var j = 0; j < descSample.length; j++) {
      if (textLower.indexOf(descSample[j]) !== -1) descHits++;
    }
    if (descSample.length > 0) {
      score += 0.15 * (descHits / descSample.length);
    }

    return Math.min(score, 1.0);
  }


  /* ════════════════════════════════════════════════════════
     PUBLIC API — ResourceMatcher
     ════════════════════════════════════════════════════════ */

  var ResourceMatcher = {

    /**
     * Match AI response contract to internal resource datasets.
     *
     * @param {Object} contract — ResponseContract.parse() output
     * @param {Object} profile  — AIOS.Memory.getProfile() output (optional)
     * @returns {Promise<Array>} Matched resources, sorted by confidence descending.
     *
     * Each result:
     *   {
     *     name:       string,   — resource display name
     *     category:   string,   — resource category from the dataset
     *     page:       string,   — internal page URL (relative)
     *     dataset:    string,   — which dataset it came from
     *     confidence: number,   — 0-1 match confidence
     *     website:    string|null — external link if present
     *   }
     */
    match: function(contract, profile) {
      if (!contract || !contract.raw) return Promise.resolve([]);

      var signals = _extractSignals(contract);

      // No keyword matches → no resources to look up
      if (signals.relevantDatasets.length === 0) return Promise.resolve([]);

      // State filter for state_benefits dataset
      var stateFilter = (profile && profile.state) ? profile.state : null;

      // Load all relevant datasets in parallel
      var loadPromises = [];
      for (var i = 0; i < signals.relevantDatasets.length; i++) {
        loadPromises.push(
          (function(dsKey) {
            return _loadDataset(dsKey).then(function(records) {
              return { key: dsKey, records: records };
            });
          })(signals.relevantDatasets[i])
        );
      }

      return Promise.all(loadPromises).then(function(loaded) {
        var results = [];
        var MIN_CONFIDENCE = 0.15;
        var MAX_RESULTS = 8;

        for (var li = 0; li < loaded.length; li++) {
          var dsKey = loaded[li].key;
          var records = loaded[li].records;
          var ds = DATASETS[dsKey];
          if (!ds || !records) continue;

          for (var ri = 0; ri < records.length; ri++) {
            var record = records[ri];

            // State filter: skip state_benefits from other states
            if (dsKey === 'state_benefits' && stateFilter) {
              if (record.state && record.state !== stateFilter) continue;
            }

            var confidence = _scoreRecord(record, ds, signals.textLower);

            // Boost score if dataset's category matches a keyword family hint
            for (var fi = 0; fi < signals.matchedFamilies.length; fi++) {
              var fam = signals.matchedFamilies[fi];
              if (fam.family.categoryHint) {
                var recCat = (record[ds.catField] || '').toLowerCase();
                if (recCat === fam.family.categoryHint ||
                    recCat.indexOf(fam.family.categoryHint) !== -1) {
                  confidence = Math.min(confidence + 0.1, 1.0);
                  break;
                }
              }
            }

            if (confidence >= MIN_CONFIDENCE) {
              results.push({
                name:       record[ds.nameField] || record.name || 'Unknown',
                category:   record[ds.catField] || '',
                page:       ds.page,
                dataset:    dsKey,
                confidence: Math.round(confidence * 100) / 100,
                website:    record.website || record.official_link || record.application_link || null,
                _dedupKey:  record.canonical_id || record.id || null
              });
            }
          }
        }

        // Sort by confidence descending
        results.sort(function(a, b) { return b.confidence - a.confidence; });

        // ── Canonical dedup (Phase R2.3) ──────────────────────
        // When multiple results share the same canonical_id,
        // keep only the highest-scoring one (already first after
        // sort). If scores tie, the sort is stable so the record
        // from the first-loaded dataset wins — DATASETS puts
        // 'resources' first, matching the preferred canonical.
        var seen = {};
        var deduped = [];
        for (var di = 0; di < results.length; di++) {
          var key = results[di]._dedupKey;
          if (key && seen[key]) continue;   // skip duplicate
          if (key) seen[key] = true;
          deduped.push(results[di]);
        }
        // Clean internal field before returning
        for (var ci = 0; ci < deduped.length; ci++) {
          delete deduped[ci]._dedupKey;
        }

        return deduped.slice(0, MAX_RESULTS);
      });
    },


    /**
     * Pre-response resource matching — runs BEFORE the AI call.
     * Uses the user's message (not AI response) to find relevant
     * resources from internal datasets. Results are injected into
     * the system prompt so the AI can cite real, verified data.
     *
     * Reuses all existing internals: _extractSignals, _loadDataset,
     * _scoreRecord, canonical dedup. Does NOT modify match().
     *
     * @param {string} userMessage  — the user's raw input text
     * @param {Object} profile      — AIOS.Memory.getProfile() output (optional)
     * @param {Object} routeResult  — Router.routeAIOSIntent() output (optional)
     * @returns {Promise<{resources: Array, promptBlock: string}>}
     */
    preMatch: function(userMessage, profile, routeResult) {
      if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length < 3) {
        return Promise.resolve({ resources: [], promptBlock: '' });
      }

      // ── Phase R3.5: Synonym expansion for pre-response matching ──
      // User vocabulary differs from resource names/descriptions.
      // "job" ≠ "employment", "school" ≠ "education", etc.
      // Expand user text with common veteran-domain synonyms so
      // _scoreRecord sees more overlap. Only used in preMatch.
      var _SYNONYMS = {
        'job':         ['employment', 'career', 'hiring', 'work', 'vocation'],
        'work':        ['employment', 'career', 'hiring'],
        'school':      ['education', 'training', 'college', 'university', 'degree', 'tuition'],
        'college':     ['education', 'university', 'degree'],
        'disability':  ['disabled', 'service-connected', 'compensation', 'claim'],
        'benefits':    ['benefit', 'entitlement', 'eligibility'],
        'money':       ['financial', 'funds', 'grant'],
        'financial':   ['funds', 'grant', 'monetary'],
        'emergency':   ['urgent', 'crisis', 'immediate'],
        'help':        ['support', 'aid'],
        'military':    ['veteran', 'servicemember'],
        'leaving':     ['transition', 'separating', 'separation', 'post-military'],
        'housing':     ['home', 'rent', 'mortgage', 'shelter', 'homeless'],
        'family':      ['spouse', 'dependent', 'survivor', 'caregiver'],
        'mental':      ['psychological', 'ptsd', 'counseling', 'therapy'],
        'health':      ['healthcare', 'medical', 'treatment'],
        'training':    ['education', 'certification', 'course', 'credential'],
        'resume':      ['career', 'employment', 'hiring', 'interview']
      };

      var _rawLower = userMessage.toLowerCase();
      var _expandedParts = [_rawLower];
      var _rawWords = _rawLower.split(/\s+/);
      for (var _si = 0; _si < _rawWords.length; _si++) {
        var _sw = _rawWords[_si].replace(/[^a-z]/g, '');
        if (_SYNONYMS[_sw]) {
          _expandedParts.push(_SYNONYMS[_sw].join(' '));
        }
      }
      var _expandedText = _expandedParts.join(' ');

      // Build synthetic contract from user message for _extractSignals
      var syntheticContract = {
        raw: userMessage,
        summary: (routeResult && routeResult.intent) ? routeResult.intent.replace(/_/g, ' ').toLowerCase() : '',
        recommended_actions: null,
        follow_up_question: null
      };

      var signals = _extractSignals(syntheticContract);

      // Intent boost: ensure intent-relevant datasets are always queried
      var _INTENT_DATASETS = {
        DISABILITY_CLAIM:       ['medical_resources', 'resources', 'hidden_benefits'],
        EMPLOYMENT_TRANSITION:  ['transition_resources', 'contractor_careers', 'licensure'],
        FAMILY_SURVIVOR:        ['families', 'resources'],
        STATE_BENEFITS:         ['state_benefits'],
        CRISIS_SUPPORT:         ['hotlines', 'emergency_assistance'],
        BENEFITS_DISCOVERY:     ['resources', 'hidden_benefits', 'grants'],
        AT_RISK_SUPPORT:        ['hotlines', 'emergency_assistance'],
        NEXT_STEP:              ['resources', 'hidden_benefits']
      };
      // Track which datasets were added by intent (not keyword match)
      var _intentBoostedDs = {};
      if (routeResult && routeResult.intent && _INTENT_DATASETS[routeResult.intent]) {
        var intentDs = _INTENT_DATASETS[routeResult.intent];
        for (var ib = 0; ib < intentDs.length; ib++) {
          var alreadyPresent = false;
          for (var ic = 0; ic < signals.relevantDatasets.length; ic++) {
            if (signals.relevantDatasets[ic] === intentDs[ib]) { alreadyPresent = true; break; }
          }
          if (!alreadyPresent) {
            signals.relevantDatasets.push(intentDs[ib]);
            _intentBoostedDs[intentDs[ib]] = true;
          }
        }
      }

      if (signals.relevantDatasets.length === 0) {
        return Promise.resolve({ resources: [], promptBlock: '' });
      }

      var stateFilter = (profile && profile.state) ? profile.state : null;

      // ── Phase R4.4: Eligibility-based dataset boosting ──────────
      // Compute eligibility scores from the veteran's profile and convert
      // to a dataset boost map. Records in eligibility-aligned datasets
      // get a small additive confidence boost, promoting them in ranking.
      // Empty/unknown profiles produce an empty map → zero boost.
      var _eligBoosts = {};
      var _Elig = window.AIOS && window.AIOS.Eligibility;
      if (_Elig && profile && _Elig.hasUsefulSignal(profile)) {
        var _eligScores = _Elig.score(profile);

        var _ELIG_DATASET_MAP = {
          VA_DISABILITY:      ['resources', 'hidden_benefits', 'medical_resources'],
          VA_HEALTHCARE:      ['medical_resources', 'wellness', 'service_dogs'],
          GI_BILL:            ['resources', 'grants', 'hidden_benefits'],
          VR_E:               ['transition_resources', 'licensure', 'contractor_careers'],
          STATE_BENEFITS:     ['state_benefits'],
          HOUSING_SUPPORT:    ['resources', 'grants', 'financial_resources'],
          EMPLOYMENT_SUPPORT: ['transition_resources', 'contractor_careers', 'licensure', 'resources']
        };

        var _eligCats = Object.keys(_eligScores);
        for (var _ei = 0; _ei < _eligCats.length; _ei++) {
          var _eCat = _eligCats[_ei];
          var _eScore = _eligScores[_eCat];
          var _eDatasets = _ELIG_DATASET_MAP[_eCat];
          if (!_eDatasets || _eScore < 0.30) continue;

          // Scale: 0.30 → +0.00, 0.90 → +0.10 (linear interpolation)
          var _eBoost = Math.round((((_eScore - 0.30) / 0.60) * 0.10) * 100) / 100;

          for (var _ej = 0; _ej < _eDatasets.length; _ej++) {
            var _eDsKey = _eDatasets[_ej];
            if (!_eligBoosts[_eDsKey] || _eligBoosts[_eDsKey] < _eBoost) {
              _eligBoosts[_eDsKey] = _eBoost;
            }
          }
        }
      }

      var PRE_MAX = 8;   // R3.5: raised from 5 → 8 for broader coverage

      var loadPromises = [];
      for (var i = 0; i < signals.relevantDatasets.length; i++) {
        loadPromises.push(
          (function(dsKey) {
            return _loadDataset(dsKey).then(function(records) {
              return { key: dsKey, records: records };
            });
          })(signals.relevantDatasets[i])
        );
      }

      return Promise.all(loadPromises).then(function(loaded) {
        var results = [];
        var MIN_CONFIDENCE = 0.08;  // R3.5: lowered from 0.15 → 0.08

        for (var li = 0; li < loaded.length; li++) {
          var dsKey = loaded[li].key;
          var records = loaded[li].records;
          var ds = DATASETS[dsKey];
          if (!ds || !records) continue;

          for (var ri = 0; ri < records.length; ri++) {
            var record = records[ri];

            if (dsKey === 'state_benefits' && stateFilter) {
              if (record.state && record.state !== stateFilter) continue;
            }

            // ── Phase R3.5: Enhanced pre-response scoring ──
            // Uses synonym-expanded text and boosted description weight.
            // Does NOT modify _scoreRecord (post-response match() untouched).
            var _preName = (record[ds.nameField] || '').toLowerCase();
            var _preDesc = (record[ds.descField] || '').toLowerCase();
            var confidence = 0;

            // Exact name match in expanded text: very strong signal
            if (_preName.length > 3 && _expandedText.indexOf(_preName) !== -1) {
              confidence += 0.6;
            }

            // Name word overlap with multi-word tolerance:
            // Names with many words (e.g. "VA Vocational Rehabilitation & Employment
            // (VR&E / Chapter 31)") are penalized by dividing hits/total. Cap the
            // divisor at 4 so 1 hit on a 8-word name = 0.25*(1/4) = 0.0625, not 0.031.
            var _preNameWords = _preName.split(/\s+/).filter(function(w) { return w.length > 3; });
            var _preWordHits = 0;
            for (var _ni = 0; _ni < _preNameWords.length; _ni++) {
              if (_expandedText.indexOf(_preNameWords[_ni]) !== -1) _preWordHits++;
            }
            if (_preNameWords.length > 0) {
              var _nameDivisor = Math.min(_preNameWords.length, 4);
              confidence += 0.25 * (_preWordHits / _nameDivisor);
            }

            // Description overlap: boosted weight (0.25 vs 0.15), more words sampled
            // (40 vs 20), lower word-length filter (>3 vs >5).
            var _preDescWords = _preDesc.split(/\s+/).filter(function(w) { return w.length > 3; });
            var _preDescSample = _preDescWords.slice(0, 40);
            var _preDescHits = 0;
            for (var _di = 0; _di < _preDescSample.length; _di++) {
              if (_expandedText.indexOf(_preDescSample[_di]) !== -1) _preDescHits++;
            }
            if (_preDescSample.length > 0) {
              confidence += 0.25 * (_preDescHits / _preDescSample.length);
            }

            confidence = Math.min(confidence, 1.0);

            // Intent-dataset boost: records from intent-mapped datasets get +0.06
            if (_intentBoostedDs[dsKey]) {
              confidence = Math.min(confidence + 0.06, 1.0);
            }

            // Phase R4.4: Eligibility-based dataset boost
            if (_eligBoosts[dsKey]) {
              confidence = Math.min(confidence + _eligBoosts[dsKey], 1.0);
            }

            // Category hint boost (same as before)
            for (var fi = 0; fi < signals.matchedFamilies.length; fi++) {
              var fam = signals.matchedFamilies[fi];
              if (fam.family.categoryHint) {
                var recCat = (record[ds.catField] || '').toLowerCase();
                if (recCat === fam.family.categoryHint ||
                    recCat.indexOf(fam.family.categoryHint) !== -1) {
                  confidence = Math.min(confidence + 0.1, 1.0);
                  break;
                }
              }
            }

            if (confidence >= MIN_CONFIDENCE) {
              var rName = record[ds.nameField] || record.name || 'Unknown';
              var rDesc = record[ds.descField] || '';
              results.push({
                name:       rName,
                category:   record[ds.catField] || '',
                page:       ds.page,
                dataset:    dsKey,
                confidence: Math.round(confidence * 100) / 100,
                website:    record.website || record.official_link || record.application_link || null,
                description: rDesc,
                _dedupKey:  record.canonical_id || record.id || null
              });
            }
          }
        }

        // Sort by confidence descending
        results.sort(function(a, b) { return b.confidence - a.confidence; });

        // Canonical dedup (same as match)
        var seen = {};
        var deduped = [];
        for (var di = 0; di < results.length; di++) {
          var key = results[di]._dedupKey;
          if (key && seen[key]) continue;
          if (key) seen[key] = true;
          deduped.push(results[di]);
        }
        for (var ci = 0; ci < deduped.length; ci++) {
          delete deduped[ci]._dedupKey;
        }

        var top = deduped.slice(0, PRE_MAX);

        // Build formatted prompt block
        var lines = [];
        for (var pi = 0; pi < top.length; pi++) {
          var r = top[pi];
          var descSnippet = '';
          if (r.description) {
            var firstSentence = r.description.split(/[.!?]\s/)[0];
            descSnippet = firstSentence.length > 120
              ? firstSentence.substring(0, 117) + '...'
              : firstSentence;
          }
          var line = '- [' + r.name + '](/' + r.page + ')';
          if (descSnippet) line += ' — ' + descSnippet;
          line += ' (' + r.confidence.toFixed(2) + ')';
          lines.push(line);
        }

        // Clean description from returned resources (not needed downstream)
        for (var qi = 0; qi < top.length; qi++) {
          delete top[qi].description;
        }

        return {
          resources: top,
          promptBlock: lines.join('\n')
        };
      }).catch(function(err) {
        console.warn('[AIOS][PRE-MATCH] error:', err.message || err);
        return { resources: [], promptBlock: '' };
      });
    },


    /**
     * Bridge map: resource-mapper category ID → action-engine issue key.
     * Used by openResourcePage to resolve destinations from the canonical
     * ISSUE_TO_RESOURCES in action-engine.js (single source of truth).
     *
     * Categories without an ISSUE_TO_RESOURCES match (disability_compensation,
     * tdiu) fall back to the existing CATEGORIES.destination field.
     */
    _CATEGORY_TO_ISSUE: {
      healthcare:     'va_healthcare',
      education:      'education',
      employment:     'career',
      housing:        'va_loan',
      state_benefits: 'property_tax',
      crisis_support: 'mental_health_crisis',
      family_survivor:'dependent',
      legal:          'will',
      discounts:      'budget'
    },

    /**
     * Open an internal resource page with optional filters.
     * Helper function for ActionBar and dashboard integration.
     *
     * Routing priority:
     *   1. ISSUE_TO_RESOURCES (canonical, via _CATEGORY_TO_ISSUE bridge)
     *   2. CATEGORIES.destination (legacy fallback for unmapped categories)
     *   3. DATASETS page map (fallback for unknown categories)
     *   4. resources.html (last resort)
     *
     * @param {string} category — resource-mapper category id (e.g. 'healthcare')
     * @param {Object} filters  — optional { state, rating, branch } for query params
     */
    openResourcePage: function(category, filters) {
      var dest = null;

      // ── Priority 1: Canonical ISSUE_TO_RESOURCES lookup ──
      var issueKey = this._CATEGORY_TO_ISSUE[category];
      var actionEngine = window.AAAI && window.AAAI.actions;
      if (issueKey && actionEngine && actionEngine.ISSUE_TO_RESOURCES) {
        var entries = actionEngine.ISSUE_TO_RESOURCES[issueKey];
        if (entries && entries.length > 0) {
          var entry = entries[0];
          dest = entry.page;
          // Append canonical filter if present
          if (entry.filter) {
            dest += (dest.indexOf('?') !== -1 ? '&' : '?') + 'category=' + encodeURIComponent(entry.filter);
          }
        }
      }

      // ── Priority 2: Legacy CATEGORIES.destination fallback ──
      if (!dest) {
        var Resources = window.AIOS && window.AIOS.Resources;
        if (Resources) {
          var cat = null;
          var keys = Object.keys(Resources.CATEGORIES);
          for (var i = 0; i < keys.length; i++) {
            if (Resources.CATEGORIES[keys[i]].id === category) {
              cat = Resources.CATEGORIES[keys[i]];
              break;
            }
          }
          if (cat) {
            dest = cat.destination || 'resources.html';
          }
        }
      }

      // ── Priority 3: DATASETS page map fallback ──
      if (!dest) {
        var dsKeys = Object.keys(DATASETS);
        for (var d = 0; d < dsKeys.length; d++) {
          var ds = DATASETS[dsKeys[d]];
          if (dsKeys[d] === category || ds.page.indexOf(category) !== -1) {
            dest = ds.page;
            break;
          }
        }
      }

      // ── Priority 4: Last resort ──
      if (!dest) {
        dest = 'resources.html';
      }

      // Append profile-based filters as query params
      if (filters) {
        var parts = [];
        if (filters.state) parts.push('state=' + encodeURIComponent(filters.state));
        if (filters.rating) parts.push('rating=' + encodeURIComponent(String(filters.rating)));
        if (filters.branch) parts.push('branch=' + encodeURIComponent(filters.branch));
        if (parts.length > 0) {
          dest += (dest.indexOf('?') !== -1 ? '&' : '?') + parts.join('&');
        }
      }

      window.location.href = dest;
    },


    /** Expose dataset definitions for testing/inspector. */
    DATASETS: DATASETS,

    /** Expose keyword families for testing/inspector. */
    KEYWORD_FAMILIES: KEYWORD_FAMILIES,

    /** Clear cache (for testing). */
    _clearCache: function() {
      _cache = {};
      _loading = {};
      _failed = {};
    }
  };


  /* ── Register ─────────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.ResourceMatcher = ResourceMatcher;

})();
