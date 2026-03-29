# PHASE 20 — Developer AIOS Inspector
## AfterActionAI.org | AIOS Implementation

---

## PART A — FILES READ

| File | Key Finding |
|------|-------------|
| `js/app.js` | `log()` function uses `console.log('[AAAI] ...')`. AIOS integration block emits `[AIOS][ROUTER]`, `[AIOS][MEMORY]`, `[AIOS][MISSION]`, `[AIOS][SKILL]`, `[AIOS][REQUEST]` console lines — but no visual surface. |
| `index.html` | Script load order confirmed: AIOS modules → `app.js` → auth/analytics. Inspector must load after `app.js` to ensure `window.AIOS.RequestBuilder` is available for the hook. |
| `css/styles.css` | Existing AIOS styles use CSS vars `--gold`, `--gray-*`. Inspector uses identical values inline — no changes to `styles.css`. |
| `js/aios/suggestion-engine.js` | Exposes only `{ evaluate, hide }` — no internal state surface. DOM-based read (`#aiosSuggestion` visibility + text) is the correct approach. |
| `js/aios/memory-manager.js` | `buildMemorySummary()` returns compact one-liner. `getProfile()` returns all fields. Both safe to read from inspector. |
| `js/aios/mission-manager.js` | `Mission.current` is a public property. All mission fields (`name`, `type`, `status`, `currentStep`, `nextStep`, `blockers`) directly readable. |

---

## PART B — FILES MODIFIED

| File | Change |
|------|--------|
| `js/aios/inspector.js` | **NEW FILE** — 535-line self-contained IIFE |
| `index.html` | Added 1 `<script>` tag after `app.js` with dev comment |

**Untouched:** `app.js`, `styles.css`, all AIOS modules, voice transport, DB, `realtime-token.js`, all skill files.

---

## PART C — BACKUPS CREATED

| Backup File | Original |
|-------------|----------|
| `index.backup-before-phase20-inspector.html` | `index.html` (post-Phase 19 state) |

No backup of `styles.css` or `app.js` needed — neither was modified.

---

## PART D — EXACT CHANGES

### `js/aios/inspector.js` — New file

Complete self-contained IIFE. All CSS injected dynamically — no `styles.css` changes.

**Architecture:**
```
inspector.js
├── _isEnabled()          — checks localStorage 'aios_dev'==='1' or ?aios_dev=1 in URL
├── _hookRequestBuilder() — wraps buildAIOSRequest() to capture meta (non-destructive)
├── _buildPanel()         — creates floating <div id="aiosInspector"> + toggle button
├── _injectCSS()          — injects <style id="aiosInspCSS"> into <head>
├── _refresh()            — reads AIOS state, renders panel rows
├── _togglePanel()        — show/hide + start/stop poll
├── _startPoll()          — 2s setInterval (only when panel visible)
├── _stopPoll()           — clearInterval
├── _wireKeyboard()       — Ctrl+` keydown listener
├── _destroy()            — removes all DOM elements
└── window.AIOS.Inspector — public API: enable, disable, refresh, show, hide
```

**RequestBuilder hook (key mechanism):**
```javascript
var _orig = window.AIOS.RequestBuilder.buildAIOSRequest;
window.AIOS.RequestBuilder.buildAIOSRequest = function(opts) {
  var result = _orig.call(this, opts);    // original runs unchanged
  if (result && result.meta) {
    _lastMeta = result.meta;              // captures: intent, skill, confidence,
                                          //   systemPromptLength, hasMemory, hasMission
    if (_visible) _refresh();            // immediate panel update if open
  }
  return result;                          // identical return — zero behavior change
};
```

### `index.html` — 2-line addition

```diff
  <script src="js/app.js"></script>
+ <!-- Phase 20: AIOS Inspector — dev-only, off by default. Enable: localStorage.setItem('aios_dev','1') -->
+ <script src="js/aios/inspector.js"></script>

  <!-- AUTH MODAL -->
```

---

## PART E — DEBUG SURFACES ADDED

### Panel location
Fixed-position, bottom-right corner (72px from bottom to clear mobile nav bars). Width 284px. On mobile: stretches to `calc(100vw - 24px)`.

### Enable methods (all off by default)

| Method | How |
|--------|-----|
| Persistent | `localStorage.setItem('aios_dev','1')` then reload |
| URL param | Add `?aios_dev=1` to any page URL |
| Console | `AIOS.Inspector.enable()` — sets localStorage + reloads |
| Disable | `AIOS.Inspector.disable()` — removes DOM + clears storage |

### Toggle
`Ctrl+`` ` (Ctrl + backtick) opens/closes the panel. Also: click the `⚙` button in the bottom-right corner.

### Panel sections and data sources

**ROUTING** — from `_lastMeta` (captured via RequestBuilder hook)

| Field | Source | Colors |
|-------|--------|--------|
| Intent | `_lastMeta.intent` | green=specific skill, amber=GENERAL_QUESTION, grey=none |
| Skill | `_lastMeta.skill` | green=active, grey=none |
| Confidence | `_lastMeta.confidence` | green≥0.8, amber≥0.4, grey<0.4 |
| Sys len | `_lastMeta.systemPromptLength` | green=injected, grey=zero |

**MEMORY** — from `window.AIOS.Memory.getProfile()` + `buildMemorySummary()`

| Field | Source | Colors |
|-------|--------|--------|
| Fields | Count of non-null profile keys | green>0, grey=0 |
| Profile | `buildMemorySummary()` stripped of prefix, split across rows | green |
| Injected | `_lastMeta.hasMemory` | green=yes, amber=no |

**MISSION** — from `window.AIOS.Mission.current`

| Field | Source | Colors |
|-------|--------|--------|
| Name | `current.name \|\| current.type` | green |
| Status | `current.status` | green=active, amber=other |
| Step | `current.currentStep` (first 60 chars) | default |
| Next | `current.nextStep` (first 60 chars) | default |
| Blockers | `current.blockers[]` joined or "none" | amber=present, grey=none |
| Injected | `_lastMeta.hasMission` | green=yes, amber=no |

**SUGGESTION** — from DOM (`#aiosSuggestion`)

| Field | Source |
|-------|--------|
| Active | `#aiosSuggestion.style.display !== 'none'` |
| Text | Visible text content (buttons stripped, max 80 chars) |

### What is NOT shown (intentional)
- Full system prompt content
- Raw conversation history
- Full profile object (shown as compact summary only)
- Personal data beyond what `buildMemorySummary` already exposes

### Console output (always, regardless of panel state)
- `[AIOS][INSPECTOR] RequestBuilder hooked`
- `[AIOS][INSPECTOR] ready — Ctrl+\` to toggle...`

---

## PART F — SAFETY / REMOVABILITY

| Rule | Status |
|------|--------|
| Zero production impact when disabled | ✓ `_isEnabled()` returns false → nothing initialises, no DOM, no polling, no hook |
| No chat flow interference | ✓ Inspector only READS AIOS state, never writes to it |
| No voice flow interference | ✓ No interaction with RealtimeVoice or data channel |
| No duplicate state | ✓ Reads `window.AIOS.Memory.profile`, `window.AIOS.Mission.current` directly |
| No expensive polling | ✓ 2s interval only when panel is visible AND enabled |
| No mobile layout impact | ✓ Panel hidden when closed; toggle button is 28×28px fixed, doesn't affect layout flow |
| Fully removable | Remove `<script src="js/aios/inspector.js"></script>` from index.html → zero trace |
| RequestBuilder hook | Non-destructive read-only capture; original function returns unchanged |
| Safe on error | All `_refresh()` data reads are wrapped in try/catch |

**To remove entirely from production:**
1. Delete `js/aios/inspector.js`
2. Remove the 2 lines from `index.html`
3. Done — no other files were changed

---

## PART G — READY FOR NEXT STEP

Phase 20 complete and locked.

**New file:** `js/aios/inspector.js` (535 lines, IIFE, self-contained CSS)
**Modified:** `index.html` (+2 lines, script tag + comment)
**Backup:** `index.backup-before-phase20-inspector.html`
**Syntax:** Verified clean (`node --check`)

**Default state:** Inspector is OFF. Production users see nothing.
**Developer activation:** `localStorage.setItem('aios_dev','1')` + reload, or `?aios_dev=1` in URL.

**Awaiting Phase 21 instructions.**
