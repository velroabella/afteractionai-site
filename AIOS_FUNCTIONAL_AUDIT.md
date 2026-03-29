# AIOS FUNCTIONAL AUDIT — AfterActionAI.org
**Date:** 2026-03-29
**Auditor:** Claude (code audit, read-only)
**Synthetic Profile:** Michael Carter, US Army, 60% VA disability, Honorable discharge, Tampa FL, unemployed, goal: increase rating to 70%+

---

## PART A — ROUTER TRACE

### Test Input: "I served in the Army and I'm at 60%. I want to increase my disability rating."

**Router.routeAIOSIntent() trace:**
1. Crisis check → NO match (no crisis keywords)
2. AT_RISK check → NO match (no at-risk keywords)
3. Keyword rules scan (top-to-bottom):
   - DISABILITY_CLAIM: `"increase my rating"` → **MATCH** at `keywords[13]`
4. **Result:** `{ intent: 'DISABILITY_CLAIM', skill: 'va-disability-claim', confidence: 0.8, matched: 'increase my rating', tier: 'STANDARD' }`

**Verdict: CORRECT.** Router properly classifies disability intent on first pass.

### Edge Cases Tested (mentally traced):

| Input | Expected | Actual | OK? |
|---|---|---|---|
| "What benefits am I eligible for?" | BENEFITS_DISCOVERY | BENEFITS_DISCOVERY (`eligible`) | ✅ |
| "I live in Florida, what state benefits?" | STATE_BENEFITS | STATE_BENEFITS (`state benefits`) | ✅ |
| "I want to die" | CRISIS_SUPPORT | CRISIS_SUPPORT (`want to die`) | ✅ |
| "I'm homeless and losing everything" | AT_RISK_SUPPORT | AT_RISK_SUPPORT (`i'm homeless`) | ✅ |
| "Hello" | GENERAL_QUESTION | GENERAL_QUESTION (short, not in knownTerms, `needsClarification=true`) | ✅ |
| "What now?" | NEXT_STEP | NEXT_STEP (`what now`) | ✅ |
| "My DD-214 says..." | DOCUMENT_ANALYSIS | DOCUMENT_ANALYSIS (`dd-214`) | ✅ |

### Router Issues Found:

**R-1 (P2): GENERAL_QUESTION bypass means zero AIOS context for generic conversation.**
When intent is GENERAL_QUESTION, `skill === null`, so the entire AIOS block in `callChatEndpoint` (lines 1539-1578) is skipped. This means:
- No memory context injected
- No eligibility context injected
- No mission context injected
- No page context injected
The AI operates blind to everything AIOS has learned about the veteran. This is the single biggest conversational quality gap. A veteran who says "what should I focus on?" after 10 minutes of conversation gets no personalized context because the router classifies it as GENERAL_QUESTION (no keyword match → confidence 0.4).

**R-2 (P2): "status" keyword missing from DISABILITY_CLAIM.** "What's the status of my claim?" would not match DISABILITY_CLAIM because `claim status` is one entry but "status of my claim" doesn't hit it via `indexOf`. The router uses phrase matching, not word matching — `claim status` requires those exact words adjacent. "status of my claim" fails.

**R-3 (P3): No "name" extraction from user input.** The synthetic user said "people call me Mike" — Memory Manager has no name extraction logic. The `name` field stays null forever unless manually set. The SYSTEM_PROMPT explicitly asks for the veteran's name in Phase 1, but the response is never captured.

---

## PART B — MEMORY MANAGER TRACE

### Test Input: "I served in the Army and I'm at 60%. I want to increase my disability rating. I live in Tampa, Florida. I'm currently unemployed."

**extractMemoryFromInput() trace:**

1. **Branch:** RegEx scans MILITARY_BRANCHES top-to-bottom. `army` matches via fallback `\bArmy\b` → `extracted.branch = "Army"`
2. **Discharge:** No discharge pattern present → skipped
3. **State:** Pattern `\b(?:i\s+live\s+in|...) ([a-z][a-z\s]{1,19}?)` — "Tampa, Florida" → candidate "tampa" — NOT in US_STATES. Next: "florida" — candidate extraction depends on comma/period after it. Pattern `(?:\s*[.,\n]|$)` — "florida." with period at end → **"florida" extracted** → `US_STATES['florida'] === 1` → `extracted.state = "Florida"`
4. **Employment:** Pattern `\b(?:i\s+am|i'm|currently)\s+unemployed\b` → matches "currently unemployed" → `extracted.employmentStatus = "unemployed"`
5. **VA Rating:** Pattern `\b(\d{1,3})\s*%\s*(?:disability\s+)?(?:rating|...)?\b` → "60%" → `extracted.vaRating = 60`
6. **Goals:** Pattern `\bi\s+(?:want|need|...)\s+to\s+(.{10,100}?)` → "I want to increase my disability rating" → captures "increase my disability rating" (31 chars, ≥8, ≤120) → `extracted.currentGoals = "increase my disability rating"`

**_validateMemoryFields() trace:**
- branch: "Army" in VALID_BRANCHES → ✅ PASS
- state: "florida" in US_STATES → ✅ PASS
- employmentStatus: "unemployed" in VALID_EMPLOYMENT_STATUSES → ✅ PASS
- vaRating: 60, integer in 0-100 → ✅ PASS
- currentGoals: 31 chars, has letters → ✅ PASS

**Final profile after merge:**
```
{
  name: null,           // ← NEVER EXTRACTED (issue R-3)
  branch: "Army",
  serviceEra: null,     // ← No extraction logic for era
  dischargeStatus: null, // ← Not mentioned in input
  vaRating: 60,
  state: "Florida",
  employmentStatus: "unemployed",
  currentGoals: "increase my disability rating",
  primaryNeed: null,    // ← Never set by any code path
  needs: [],
  documents: [],
  activeMissions: null
}
```

### Memory Issues Found:

**M-1 (P1): `name` is never extracted.** No regex or pattern exists for name extraction. The SYSTEM_PROMPT asks "what do people call you?" but the response is never parsed. The entire conversation lacks personalization.

**M-2 (P2): `serviceEra` is never extracted.** Comment in code says "Not populated by extractMemoryFromInput today." This means the Eligibility Engine's GI Bill scoring has a blind spot — it can't boost for post-9/11 service.

**M-3 (P2): `primaryNeed` is never set.** No code path writes to `profile.primaryNeed`. It's declared in the profile schema but dead. The Benefit Path Finder checks for it as a contextField but it will always be flagged as unknown.

**M-4 (P3): `dischargeStatus` requires explicit mention.** Michael Carter's discharge status stays null unless he explicitly says "honorable discharge." The system never proactively asks or infers from uploaded DD-214 data feeding back into memory.

**M-5 (P2): Memory extraction runs ONLY in `submitUserText` escalation check path, NOT on AI responses or as a post-call hook.** The `extractMemoryFromInput` is never called in `callChatEndpoint` or `sendToAI`. It's only called if someone manually invokes `AIOS.Memory.extractMemoryFromInput()`. Looking at the code flow: `submitUserText` → `sendToAI` → `callChatEndpoint` — **memory extraction is never called in the actual send path.** The router runs in `callChatEndpoint` (line 1514) but `Memory.extractMemoryFromInput()` is NEVER called anywhere in app.js except inside the old `submitUserText` escalation check where `routeAIOSIntent` runs — but that only checks for crisis/at-risk tier for banner display, it doesn't call memory extraction.

Wait — re-reading carefully: `submitUserText` calls `routeAIOSIntent` at line 1157 but only uses the result for escalation banners. **Memory extraction is never invoked.** The Memory Manager module exists but is never called to extract data from user messages.

**This is a P0 bug.** The entire memory system is dead code in the live product. Memory is only populated if someone calls `AIOS.Memory.extractMemoryFromInput()` from the console or if loaded from Supabase via `Memory.load()` for authenticated users.

---

## PART C — SKILL LOADER + SKILL EXECUTION TRACE

### With route result: `{ skill: 'va-disability-claim', intent: 'DISABILITY_CLAIM', ... }`

**SkillLoader.loadAIOSSkill('va-disability-claim') trace:**
1. Checks `window.AIOS.Skills['va-disability-claim']` → found (registered by IIFE)
2. Sets `SkillLoader.activeSkill = skill`
3. Returns the skill module

**VADisabilityClaim.run() trace:**
```javascript
run({ profile: {/*empty because M-5*/}, history: messages, userInput: "...", tier: 'STANDARD' })
```
Returns:
```javascript
{
  prompt: '',  // ← EMPTY STRING
  data: {
    chain: {
      nextSkill: 'next-action-planner',
      label: 'Want a full veterans benefits action plan?',
      sendText: 'Build me a complete veterans benefits action plan',
      missionUpdate: {
        currentStep: 'Gather service records and buddy statements',
        nextStep: 'Submit VA Form 21-526EZ'
      }
    }
  }
}
```

### Skill Issues Found:

**S-1 (P0): `va-disability-claim` has an EMPTY prompt.** Line 24: `prompt: ''`. The skill returns `{ prompt: '', data: {...} }`. When RequestBuilder processes this, `opts.skillConfig.prompt` is `''` (falsy), so the skill prompt section is skipped entirely. The AIOS system prompt addition is: core-prompt only (~500 chars of generic identity text). **The disability claim skill contributes zero domain expertise to the system prompt.** The AI gets no guidance on how to help with disability claims.

**S-2 (P0): `state-benefits` has an EMPTY prompt.** Same issue — `prompt: ''`. Zero guidance injected.

**S-3 (P0): `next-action-planner` has an EMPTY prompt.** Same issue — `prompt: ''`. Zero guidance injected.

**S-4 (P1): Only `benefit-path-finder`, `crisis-support`, and `document-analyzer` have real prompts.** Three of six skills are empty shells that contribute nothing to the AI's system prompt. They register, they route, but they add no expertise.

**S-5 (P1): `va-disability-claim.run()` always returns a chain to `next-action-planner`.** The chain fires unconditionally — even if the veteran just asked a simple rating question. It should be conditional on conversation depth or profile completeness, not unconditional.

---

## PART D — REQUEST BUILDER TRACE

### With Michael Carter's profile (if memory worked — hypothetical):

**buildAIOSRequest() trace:**

1. **Core prompt** (always present): AIOS_CORE_PROMPT (~500 chars) — added to systemParts[0]

2. **Skill prompt:** `skillConfig.prompt = ''` → falsy → **SKIPPED** (S-1 bug)

3. **Escalation tier:** 'STANDARD' → **SKIPPED** (correct)

4. **Memory context (hypothetical if M-5 didn't exist):**
   ```
   ## VETERAN CONTEXT
   - Branch: Army
   - VA Rating: 60%
   - State: Florida
   - Employment: unemployed
   - Current goal: increase my disability rating
   ```

5. **Eligibility context:** `hasUsefulSignal({branch, vaRating, state, employmentStatus})` → true
   - VA_DISABILITY: 0.10 + 0.15 (branch) + 0.25 (honorable—wait, discharge is null) + 0.35 (rating > 0) = 0.60
   - Actually discharge is null so honorable boost doesn't fire: 0.10 + 0.15 + 0.35 = 0.60
   - VA_HEALTHCARE: 0.10 + 0.15 + 0.25 (rating ≥ 50) = 0.50
   - VR_E: 0.05 + 0.10 + 0.45 (rating ≥ 10) + 0.10 (unemployed) = 0.70
   - EMPLOYMENT_SUPPORT: 0.05 + 0.10 + 0.50 (unemployed) = 0.65
   - STATE_BENEFITS: 0.05 + 0.10 + 0.50 (state known) = 0.65
   - buildSummary(scores, 0.50): High (≥0.72): none. Moderate (≥0.50): VR&E (0.70), Employment (0.65), State Benefits (0.65), VA Disability (0.60), VA Healthcare (0.50)
   ```
   ## ELIGIBILITY CONTEXT
   - Moderate relevance: Vocational Rehab (VR&E), Employment Support, State Veterans Benefits, VA Disability Claim, VA Healthcare
   - Note: Scores are relevance estimates only — not legal determinations.
   ```

6. **Mission context:** `Mission.current = null` → **SKIPPED** (no mission created yet — nothing calls `detectMissionFromInput` or `createMission` automatically)

7. **Confidence scoring:**
   - routerConf = 0.8 → +2 (strong-intent-match)
   - memFields: branch(1) + vaRating(1) + state(1) + employmentStatus(1) = 4 → +2 (rich-profile)
   - eligibility signal present → +1
   - mission: no current → +0
   - Total = 5 → level = 'high'
   → No CONFIDENCE CONTEXT injected (correct — only injected for 'low')

8. **Prompt budget:** ~500 (core) + ~200 (memory) + ~200 (eligibility) ≈ 900 chars → well under 7000 limit → no trimming

### Request Builder Issues Found:

**RB-1 (P0): With empty skill prompt (S-1), the AIOS addition is basically just the core-prompt + memory + eligibility.** The core-prompt is 500 chars of generic identity text. Combined with SYSTEM_PROMPT's 300+ lines, the AIOS block contributes identity repetition (AIOS says "be action-oriented" while SYSTEM_PROMPT says "be concise") but zero skill-specific guidance.

**RB-2 (P1): Mission detection never fires automatically.** `MissionManager.detectMissionFromInput()` exists but is never called by app.js or any AIOS module. Missions are only created via Chain.consume() when a skill chains to another. For the first message, there's never a mission.

**RB-3 (P2): MAX_PROMPT_LENGTH = 7000 chars is extremely conservative.** The SYSTEM_PROMPT alone is ~8000+ chars. The AIOS system addition would only ever be trimmed if it exceeded 7000 chars on its own — which it rarely would. But this also means the budget trimming logic is essentially dead code for typical requests.

---

## PART E — CHAT ENDPOINT (SERVER-SIDE) TRACE

### chat.js (Netlify Function) analysis:

**Payload received from client:**
```javascript
{
  system: SYSTEM_PROMPT + '\n\n' + aiosRequest.system,  // ~9000+ chars
  messages: conversationHistory,                          // trimmed to last 20
  system_suffix: topicBlock                               // if topics selected
}
```

**Server-side processing:**
1. `systemPrompt = body.system || SYSTEM_PROMPT` — uses client-sent system prompt ✅
2. If `body.system_suffix` exists: `systemPrompt += body.system_suffix` ✅
3. `messages.slice(-20)` — trims to 20 ✅
4. Sends to Anthropic API with `MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '1024', 10)`

### Chat Endpoint Issues Found:

**CE-1 (P0): MAX_TOKENS defaults to 1024.** This is the most critical production issue. The reports, action plans, and templates that SYSTEM_PROMPT promises to generate require 2000-4000 tokens. At 1024, every detailed response gets truncated mid-sentence. The user sees incomplete reports, cut-off action plans, and broken templates. **This makes the core deliverable of the product — the personalized report — unreliable.**

**CE-2 (P1): Server has its OWN copy of SYSTEM_PROMPT (lines 9-125 of chat.js).** This is a divergent copy — it doesn't include the Phase 34 fixes, the CONVERSATION CONTINUITY RULE, or the OPTIONS system. The server SYSTEM_PROMPT is only used as a fallback when `body.system` is empty, but this divergence is a maintenance hazard.

**CE-3 (P2): `messages.slice(-20)` is aggressive for report generation.** A full intake conversation can easily reach 20+ exchanges. By the time the veteran asks for their report, the earliest intake data (branch, discharge, state) may have been trimmed from the message history. Combined with the memory extraction bug (M-5), the AI has no way to recall early conversation data.

**CE-4 (P2): Client sends full system prompt to server.** The system prompt (~9000 chars) is sent with every request. This is ~2000+ tokens of input consumed by the system prompt alone, leaving less room for conversation history within the model's context window.

---

## PART F — VOICE PATH AUDIT

### realtime-voice.js analysis:

1. **Token endpoint** (`realtime-token.js`): Model = `'gpt-realtime'`
2. **Connection:** WebRTC via `/v1/realtime/calls` with SDP exchange
3. **Voice system prompt:** ~200 words, single paragraph (vs 300+ lines for text mode)

### Voice Issues Found:

**V-1 (P0): Model ID `gpt-realtime` is likely invalid.** OpenAI's Realtime API models are `gpt-4o-realtime-preview` or `gpt-4o-realtime-preview-2024-12-17`. The string `gpt-realtime` doesn't match any known model. If OpenAI accepts it (perhaps via alias), it's undocumented. If it rejects it, voice mode is completely broken.

**V-2 (P0): Voice system prompt is ~200 words vs text mode's ~8000+ chars.** The voice AI has no knowledge of:
- The OPTIONS system
- Intake phases (branch → discharge → state → etc.)
- Template generation rules
- Legal document capabilities
- Benefit categories
- State-specific guidance
- Conversation continuity rules
Voice mode is essentially a different, much dumber product.

**V-3 (P1): No VAD (Voice Activity Detection) configuration.** The Realtime API supports server-side VAD tuning (`turn_detection.threshold`, `prefix_padding_ms`, `silence_duration_ms`). None are configured. Default VAD may trigger on ambient noise or cut off the veteran mid-sentence.

**V-4 (P1): No interruption handling.** When the AI is speaking and the veteran interrupts, there's no `response.cancel` sent. The AI's response plays to completion regardless of user interruption. This creates a poor conversational experience.

**V-5 (P2): Voice transcripts are not fed back to Memory Manager.** `onUserTranscript` in app.js calls `submitUserText(trimmed, {voiceOnly:true})` which renders the bubble and checks for crisis, but `voiceOnly: true` returns before `sendToAI`. The transcript is never added to `conversationHistory`. Voice mode conversation data is completely invisible to the text-mode AI and to memory extraction.

**V-6 (P2): AI voice responses are not added to `conversationHistory`.** `onAIMessage` and `onAITranscript` are handled in app.js for display, but the AI's spoken responses are never pushed to `conversationHistory`. If the veteran switches from voice to text, the text AI has zero context about what was discussed in voice mode.

---

## PART G — SUGGESTION ENGINE AUDIT

### With Michael Carter's profile (hypothetical, if memory worked):

**evaluate() trace after 4 AI messages:**
1. Crisis gate: not active → continue
2. AT_RISK gate: not active → continue
3. Processing gate: not processing → continue
4. Chips visible: no → continue
5. AI message count: 4 ≥ MIN_AI_MSGS (3) → continue
6. Chain pending: no → skip S0
7. Mission active: no → skip S1
8. OTH discharge: profile.dischargeStatus is null, not 'Other Than Honorable' → skip S3
9. Build candidates:
   - S2 (state benefits): profile.state="Florida", aiCount≥4, no goals (wait—goals ARE set), no mission → `!profile.currentGoals` = false → **SKIPPED** (currentGoals blocks this)
   - S4 (rating increase): vaRating=60, <100, aiCount≥5 → **needs 5 msgs** → skipped at 4
   - S6 (VR&E): vaRating≥10, unemployed, aiCount≥4 → **CANDIDATE** (score=VR_E=0.70)
   - S7 (employment): unemployed, aiCount≥4, no mission → **CANDIDATE** (score=EMPLOYMENT_SUPPORT=0.65)
   - S5 (stuck nudge): aiCount≥6 → not yet, no mission, but branch IS set → **SKIPPED** (`!profile.branch` = false)
10. Sorted by score: S6 (0.70) > S7 (0.65)
11. S6 passes cooldown → **SHOWN: "Your disability rating may qualify you for VA Vocational Rehab..."**

**Verdict: REASONABLE** behavior — VR&E is a high-value suggestion for this profile.

### Suggestion Engine Issues Found:

**SE-1 (P2): S2 (state benefits) is blocked when `currentGoals` is set.** The condition `!profile.currentGoals && !mission` means any veteran who expresses a goal never gets state benefit suggestions via the suggestion engine. This seems like an over-aggressive filter.

**SE-2 (P2): S4 requires 5 AI messages (vs 4 for others).** Rating increase is arguably the highest-value suggestion for a 60% veteran, but it requires one more exchange than VR&E. The VR&E suggestion fires first and then S4 is on cooldown. The veteran may never see the rating increase suggestion.

---

## PART H — CHAIN MANAGER AUDIT

### After va-disability-claim.run() returns chain data:

**Chain.set() trace:**
```javascript
Chain.set({
  nextSkill: 'next-action-planner',
  label: 'Want a full veterans benefits action plan?',
  sendText: 'Build me a complete veterans benefits action plan',
  missionUpdate: { currentStep: '...', nextStep: '...' }
}, 'STANDARD')
```
1. Crisis gate: tier='STANDARD', banner not visible → pass
2. AT_RISK gate: tier='STANDARD', no AT_RISK messages → pass
3. Anti-loop cooldown: `_lastChained['next-action-planner']` not set → pass
4. Anti-loop history: `_recent` empty → pass
5. `_pending` set ✅

**After response streams, suggestion engine fires:**
- S0 check: `Chain.hasPending()` = true
- `Chain.consume()`: creates mission via `Mission.createMission('disability_claim', missionUpdate)` — wait, the `next-action-planner` skill is chained but the missionType is not set on this chain (only missionUpdate). Actually re-reading: the chain from `va-disability-claim` sets `missionUpdate` but no `missionType`. So `_pending.missionType = null`. In `consume()`: `missionType && !Mission.isActive()` → null is falsy → mission creation skipped. `Mission.current && missionUpdate` → `Mission.current` is null → update skipped. **No mission is ever created from this chain.**

### Chain Issues Found:

**CH-1 (P1): va-disability-claim's chain sets `missionUpdate` but no `missionType`.** Result: `Chain.consume()` skips mission creation AND mission update because `Mission.current` is null. The chain fires, the suggestion appears, but no mission state is created. If the user accepts, `next-action-planner` runs with no active mission context.

**CH-2 (P1): benefit-path-finder's chain sets `missionType: 'disability_claim'` correctly.** But it only fires when disability signals are present. The disability skill itself (the one that should create the mission) has no missionType. The chain system works correctly for benefit-path-finder → va-disability-claim but fails for va-disability-claim → next-action-planner.

---

## PART I — ELIGIBILITY ENGINE AUDIT

### Score calculation for Michael Carter (hypothetical full profile):

| Category | Base | Boosts Hit | Score |
|---|---|---|---|
| VA_DISABILITY | 0.10 | +0.15 (branch) +0.35 (rating>0) = | **0.60** |
| VA_HEALTHCARE | 0.10 | +0.15 (branch) +0.25 (rating≥50) = | **0.50** |
| GI_BILL | 0.05 | +0.10 (branch) +0.10 (branch known) = | **0.25** |
| VR_E | 0.05 | +0.10 (branch) +0.45 (rating≥10) +0.10 (unemployed) = | **0.70** |
| STATE_BENEFITS | 0.05 | +0.10 (branch) +0.50 (state known) = | **0.65** |
| HOUSING | 0.05 | +0.10 (branch) = | **0.15** |
| EMPLOYMENT | 0.05 | +0.10 (branch) +0.50 (unemployed) = | **0.65** |

Note: `dischargeStatus` is null (M-4), so honorable discharge boosts don't fire for ANY category. This significantly underscores VA_DISABILITY (missing +0.25), VA_HEALTHCARE (missing +0.35), GI_BILL (missing +0.20), and STATE_BENEFITS (missing +0.15).

**Verdict:** Eligibility Engine logic is sound and well-designed, but its effectiveness is crippled by Memory Manager not extracting discharge status (M-4) and not being called at all (M-5).

---

## PART J — TELEMETRY AUDIT

### Telemetry module design: Clean.

- In-memory only, no PII, sanitized fields, FIFO cap at 100 events
- Dedup within 500ms window
- Events: `aios_fallback`, `prompt_trimmed`, `low_confidence`, `suggestion_suppressed`, `chain_blocked`, `escalation_triggered`, `link_summary`
- No UI — developer console only via `AIOS.Telemetry.getEvents()` and `getSummary()`

### Telemetry Issues:

**T-1 (P3): No telemetry for memory extraction events.** Since memory extraction doesn't run (M-5), this is moot, but even if it did, there's no `memory_extracted` or `memory_updated` event type.

**T-2 (P3): No telemetry for skill activation.** Which skills fire, how often, and what prompts they return — none of this is tracked. The console logs exist but aren't captured in the telemetry system.

---

## RANKED ISSUE SUMMARY

### P0 — Critical (product is broken or fundamentally weakened)

| # | Issue | Module | Impact |
|---|---|---|---|
| **M-5** | Memory extraction is never called | memory-manager / app.js | Entire memory system is dead code. Profile is always empty for anonymous users. |
| **CE-1** | MAX_TOKENS defaults to 1024 | chat.js | Reports, templates, and action plans truncated mid-sentence. Core deliverable broken. |
| **S-1** | va-disability-claim has empty prompt | va-disability-claim.js | #1 use case (disability claims) gets zero skill guidance from AIOS. |
| **S-2** | state-benefits has empty prompt | state-benefits.js | State benefits skill adds nothing to AI context. |
| **S-3** | next-action-planner has empty prompt | next-action-planner.js | Action plan skill adds nothing to AI context. |
| **V-1** | Voice model ID `gpt-realtime` likely invalid | realtime-token.js | Voice mode may be completely non-functional. |
| **V-2** | Voice system prompt is ~200 words vs 8000+ chars | realtime-token.js | Voice mode is a fundamentally different, weaker product. |
| **R-1** | GENERAL_QUESTION skips all AIOS context | router.js + app.js | Most conversational messages get no memory/eligibility/mission context. |

### P1 — High (feature is significantly degraded)

| # | Issue | Module | Impact |
|---|---|---|---|
| **M-1** | Name is never extracted | memory-manager.js | No personalization — AI can't address veteran by name from memory. |
| **S-4** | Only 3 of 6 skills have real prompts | skills/*.js | Half the skill routing infrastructure is wiring with no content. |
| **S-5** | va-disability-claim always chains unconditionally | va-disability-claim.js | Chain fires even for simple questions, creating unnecessary suggestions. |
| **CH-1** | va-disability-claim chain has no missionType | va-disability-claim.js | Chain.consume() never creates a mission from the #1 skill. |
| **RB-2** | Mission detection never fires automatically | app.js | Missions only created via chain consumption, not from user intent. |
| **V-3** | No VAD configuration for voice | realtime-voice.js | Default VAD may misfire on ambient noise. |
| **V-4** | No interruption handling in voice | realtime-voice.js | AI speaks to completion regardless of user interruption. |
| **CE-2** | Server has divergent SYSTEM_PROMPT copy | chat.js | Maintenance hazard — two prompts drift over time. |

### P2 — Medium (degraded experience, workarounds exist)

| # | Issue | Module | Impact |
|---|---|---|---|
| **M-2** | serviceEra never extracted | memory-manager.js | GI Bill eligibility scoring has a blind spot. |
| **M-3** | primaryNeed is dead field | memory-manager.js | Benefit Path Finder always flags it as unknown. |
| **M-4** | dischargeStatus requires explicit mention | memory-manager.js | Honorable discharge boosts never fire for most users. |
| **R-2** | "status" keyword gap in DISABILITY_CLAIM | router.js | "status of my claim" misroutes to GENERAL_QUESTION. |
| **SE-1** | State benefits suggestion blocked by goals | suggestion-engine.js | Goal-oriented veterans miss state benefit nudges. |
| **SE-2** | Rating increase needs 5 msgs (vs 4 for others) | suggestion-engine.js | Highest-value suggestion for rated veterans is delayed. |
| **V-5** | Voice transcripts not in conversationHistory | app.js | Text AI has no context from voice conversations. |
| **V-6** | AI voice responses not in conversationHistory | app.js | Voice-to-text switch loses all conversation context. |
| **CE-3** | messages.slice(-20) aggressive for reports | chat.js | Early intake data lost before report generation. |
| **CE-4** | Full system prompt sent with every request | app.js + chat.js | ~2000 tokens consumed per request by system prompt alone. |

### P3 — Low (cosmetic, maintenance, or future concern)

| # | Issue | Module | Impact |
|---|---|---|---|
| **R-3** | No name extraction from input | memory-manager.js | Name stays null unless manually set. |
| **RB-3** | MAX_PROMPT_LENGTH rarely triggers | request-builder.js | Budget trimming is essentially dead code. |
| **T-1** | No memory extraction telemetry | telemetry.js | Can't monitor memory quality (moot until M-5 fixed). |
| **T-2** | No skill activation telemetry | telemetry.js | Can't track skill usage patterns. |

---

## TOP 5 FIXES BY IMPACT (in priority order)

1. **Fix M-5: Wire memory extraction into `sendToAI` or `callChatEndpoint`.** Call `AIOS.Memory.extractMemoryFromInput(lastUserMsg)` and `AIOS.Memory.mergeMemory()` on every user message. This single fix activates the entire memory → eligibility → suggestion pipeline.

2. **Fix CE-1: Raise MAX_TOKENS to 4096.** Set `MAX_TOKENS=4096` in Netlify environment variables. No code change needed — just env var.

3. **Fix R-1: Inject AIOS memory/eligibility context even for GENERAL_QUESTION.** When `routeResult.skill === null`, still run `buildAIOSRequest()` with a null skillConfig to get memory + eligibility + mission + page context appended to SYSTEM_PROMPT. This gives the AI conversational memory without requiring a specific skill.

4. **Write real prompts for S-1, S-2, S-3.** Give `va-disability-claim`, `state-benefits`, and `next-action-planner` the same quality of domain-specific prompt that `benefit-path-finder` and `document-analyzer` have.

5. **Fix V-1: Update voice model to `gpt-4o-realtime-preview`.** Test that voice mode actually connects and responds. Then progressively sync the voice system prompt with the text-mode SYSTEM_PROMPT.
