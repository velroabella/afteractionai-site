# PHASE 19 — Voice AIOS Integration
## AfterActionAI.org | AIOS Implementation

---

## PART A — FILES READ

| File | Key Finding |
|------|-------------|
| `js/realtime-voice.js` | WebRTC transport, data channel, callbacks. `onUserTranscript(text, isFinal)` fires when transcript is complete. `sendEvent()` sends raw data channel events. Transport is a sealed module — no changes needed. |
| `js/app.js` — `startVoiceSession()` | Wires all `RealtimeVoice` callbacks. Current `onUserTranscript` final path: quality gate → `addMessage` → `conversationHistory.push` → `checkCrisis`. No AIOS. |
| `js/app.js` — `callChatEndpoint()` | Text path AIOS integration (lines 1204–1278). Confirmed: AIOS routing only activates when `routeResult.skill !== null`. Falls back to legacy `SYSTEM_PROMPT` on failure or GENERAL_QUESTION. |
| `js/app.js` — topic bubble `session.update` (lines 607–630) | Only existing `session.update` usage. Sends full `SYSTEM_PROMPT + topicDirective` then delays `sendText` 200ms. Confirms `session.update` is the correct injection mechanism. |
| `netlify/functions/realtime-token.js` | Server-side session `instructions` is a minimal 2-sentence prompt. This is what voice sessions run on without AIOS. Cannot be changed without a deploy — Phase 19 overrides it client-side via `session.update`. |
| `js/aios/memory-manager.js` | `extractMemoryFromInput()` and `mergeMemory()` confirmed available. `profile` is a direct public property of `window.AIOS.Memory`. |
| `js/aios/mission-manager.js` | `detectMissionFromInput()` and `createMission()` confirmed available. `current` is a direct public property of `window.AIOS.Mission`. |

**Key finding:** `extractMemoryFromInput()` and `detectMissionFromInput()` are defined but **not yet called anywhere in `app.js`** — neither in text mode nor voice mode. Phase 19 adds these calls to the voice path. This makes voice mode the first path with active memory and mission extraction on each message.

---

## PART B — FILES MODIFIED

| File | Change |
|------|--------|
| `js/app.js` | Added `_aiosVoiceUpdate(transcript)` function (87 lines); added `_aiosVoiceUpdate(text)` call in `onUserTranscript` final path |

**Untouched:** `realtime-voice.js`, `realtime-token.js`, `request-builder.js`, `memory-manager.js`, `mission-manager.js`, `router.js`, `skill-loader.js`, all other AIOS modules, `index.html`, `css/styles.css`, voice transport architecture, DB.

---

## PART C — BACKUPS CREATED

| Backup File | Original |
|-------------|----------|
| `js/app.backup-before-phase19-voice-aios.js` | `js/app.js` (post-Phase 18 state) |

---

## PART D — EXACT CHANGES

### Change 1 — New function `_aiosVoiceUpdate(transcript)` (inserted at line 777, before `startVoiceSession`)

```javascript
function _aiosVoiceUpdate(transcript) {
  try {
    // Guards: AIOS loaded, transcript valid, voice session active
    if (!window.AIOS || ...) return;

    // 1. Memory extraction — same extractMemoryFromInput used by text path
    extracted = window.AIOS.Memory.extractMemoryFromInput(transcript);
    if (keys present) merge into window.AIOS.Memory.profile → save()

    // 2. Mission detection — only fires if no mission is already running
    missionSeed = window.AIOS.Mission.detectMissionFromInput(transcript);
    if (found) createMission() → window.AIOS.Mission.current = newMission

    // 3. Route intent — same Router.routeAIOSIntent used by text path
    routeResult = window.AIOS.Router.routeAIOSIntent(transcript);

    // 4. Only activate if skill is routed (GENERAL_QUESTION → no session.update)
    skill = SkillLoader.loadAIOSSkill(routeResult.skill);
    skillConfig = skill.run({ profile, history: conversationHistory, userInput: transcript });

    // 5. Build full AIOS system prompt
    aiosRequest = RequestBuilder.buildAIOSRequest({
      userMessage, routeResult, skillConfig, memoryContext
      // no pageContext — voice has no topic sidebar
    });

    // 6. Inject via session.update
    RealtimeVoice.sendEvent({
      type: 'session.update',
      session: { instructions: aiosRequest.system }
    });

  } catch (_aiosVErr) {
    log('AIOS:VOICE', 'FALLBACK — ' + error.message);
    // voice transport continues unaffected
  }
}
```

### Change 2 — Single-line call in `onUserTranscript` (line 937)

```diff
  addMessage(text, 'user');
  conversationHistory.push({ role: 'user', content: text });
  if (checkCrisis(text)) showCrisisBanner();
+ // Phase 19: AIOS voice intelligence — memory, mission, routing, session.update
+ _aiosVoiceUpdate(text);
```

---

## PART E — VOICE AIOS INTEGRATION STATUS

### Integration point

| Layer | Before Phase 19 | After Phase 19 |
|-------|-----------------|----------------|
| Voice system prompt | Hardcoded minimal string in `realtime-token.js` | AIOS-built system prompt via `session.update` when skill is routed |
| Memory extraction | Never called | Runs on every accepted final transcript |
| Mission detection | Never called | Runs on every accepted final transcript (once per session until mission set) |
| AIOS routing | Never called | Runs on every accepted final transcript |
| Skill activation | Never happened | Activates same skills as text mode when intent matches |

### Session.update timing

`session.update` is sent immediately after the quality gate passes and the transcript is final. OpenAI's Realtime API applies `session.update` to subsequent responses (and potentially the current in-flight response). The topic-bubble path (already proven working) uses the same mechanism.

### Guards and safety rules

| Safety rule | Implementation |
|-------------|----------------|
| Voice transport never breaks | Entire function wrapped in `try/catch`; AIOS failure is logged and swallowed |
| No duplicate AI responses | No `sendToAI()`, no `RealtimeVoice.sendText()` — only `session.update`, which changes instructions, not triggers |
| No looping | `session.update` updates instructions only; OpenAI Realtime does not auto-trigger a response |
| Text path unchanged | `_aiosVoiceUpdate` is only called from `onUserTranscript`; `callChatEndpoint` text path is not touched |
| GENERAL_QUESTION kept | When `routeResult.skill === null`, `_aiosVoiceUpdate` returns early after memory/mission steps — no `session.update` |
| Filler transcripts skipped | `_aiosVoiceUpdate` only receives transcripts that already passed the quality gate in `onUserTranscript` |
| START_CONVERSATION skipped | Explicit guard: `if (transcript === 'START_CONVERSATION') return` |
| Active mission not overwritten | Mission detection guards: `if (!window.AIOS.Mission.current)` |

---

## PART F — SHARED INTELLIGENCE LAYER STATUS

Voice and text now share the same AIOS intelligence layer:

| Component | Text Path | Voice Path (Phase 19) |
|-----------|-----------|----------------------|
| `Router.routeAIOSIntent()` | ✓ `callChatEndpoint` | ✓ `_aiosVoiceUpdate` |
| `SkillLoader.loadAIOSSkill()` | ✓ `callChatEndpoint` | ✓ `_aiosVoiceUpdate` |
| `skill.run()` | ✓ `callChatEndpoint` | ✓ `_aiosVoiceUpdate` |
| `RequestBuilder.buildAIOSRequest()` | ✓ `callChatEndpoint` | ✓ `_aiosVoiceUpdate` |
| `## VETERAN CONTEXT` injection | ✓ via `memoryContext` | ✓ via `memoryContext` |
| `## ACTIVE MISSION` injection | ✓ via `Mission.current` | ✓ via `Mission.current` |
| Memory extraction per message | ✗ (not yet wired in text) | ✓ `extractMemoryFromInput` |
| Mission detection per message | ✗ (not yet wired in text) | ✓ `detectMissionFromInput` |
| System prompt delivery | `systemPrompt` → `/api/chat` body | `session.update.instructions` → WebRTC data channel |
| Fallback | Legacy `SYSTEM_PROMPT` | `realtime-token.js` minimal prompt |

Note: Memory/mission extraction is not yet wired in the text path's `callChatEndpoint` — that's a future task. Phase 19 adds it to voice now.

---

## PART G — READY FOR NEXT STEP

Phase 19 complete and locked.

**Modified:** `js/app.js`
**Backup:** `js/app.backup-before-phase19-voice-aios.js`
**New function:** `_aiosVoiceUpdate(transcript)` — 87 lines, inserted at line 777
**New hook:** `_aiosVoiceUpdate(text)` — 1 line, inserted in `onUserTranscript` at line 937
**Syntax:** Verified clean (`node --check`)
**Line count:** 2432 → 2536 (+104 lines)

**Awaiting Phase 20 instructions.**
