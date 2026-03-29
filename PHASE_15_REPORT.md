# PHASE 15 — Proactive Suggestion Engine
## AfterActionAI.org | AIOS Implementation

---

## PART A — FILES READ

| File | Purpose |
|------|---------|
| `js/app.js` | Confirmed `streamMessage()` lifecycle: div gets `message--streaming` class removed then `onComplete` fires, which re-enables `btnSend`. Confirmed `checkCrisis()` + `crisisBanner` pattern. Confirmed custom events: `aaai:audit_started`, `aaai:audit_completed`, `aaai:report_generated` |
| `index.html` | Located insertion point for suggestion bar (between chips row and `#chatInputText`) |
| `js/aios/router.js` | Confirmed intent keywords for suggestion action phrases |
| `css/styles.css` | Matched suggestion bar style to existing AIOS component palette |

---

## PART B — FILES MODIFIED

| File | Change |
|------|--------|
| `index.html` | Added suggestion bar HTML (3 lines) + `<script src="js/aios/suggestion-engine.js">` |
| `css/styles.css` | Appended 65-line suggestion bar CSS block at end |

---

## PART C — BACKUPS CREATED

| Backup File | Original |
|-------------|----------|
| `index.backup-before-phase15-suggestions.html` | `index.html` |
| `css/styles.backup-before-phase15-suggestions.css` | `css/styles.css` |

---

## PART D — EXACT CHANGES

### 1. `index.html` — Suggestion bar HTML (above `#chatInputText`)

```html
<!-- AIOS Proactive Suggestion (Phase 15) — hidden when no suggestion is active -->
<div class="aios-suggestion" id="aiosSuggestion" style="display:none;"
     role="status" aria-live="polite" aria-atomic="true"></div>
```

### 2. `index.html` — Script tag

```html
<script src="js/aios/suggestion-engine.js"></script>
```

### 3. `css/styles.css` — Suggestion bar styles (appended)

```css
.aios-suggestion {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px 7px 14px; flex-shrink: 0;
  background: rgba(17,17,17,0.98);
  border-top: 1px solid rgba(197,165,90,0.22);
  border-left: 3px solid rgba(197,165,90,0.55);
  font-size: 0.75rem; line-height: 1.4;
  animation: aios-suggestion-in 0.2s ease;
}
@keyframes aios-suggestion-in {
  from { opacity:0; transform:translateY(4px); }
  to   { opacity:1; transform:translateY(0);   }
}
/* + __icon, __text, __btn, __dismiss sub-classes */
```

### 4. `js/aios/suggestion-engine.js` — Full new file

Key structure:
```javascript
(function() {
  'use strict';

  // Config
  var COOLDOWN_MS = 5 * 60 * 1000;  // 5min per suggestion type
  var MIN_AI_MSGS = 3;               // don't suggest until 3 AI replies
  var AUTO_DISMISS_MS = 12000;       // auto-hide after 12s

  // Gates: _isCrisisActive(), _isProcessing(), _chipsVisible()
  // Cooldown: _cooldownOk(id) — per-type, session-scoped

  // Hook: MutationObserver on btnSend[disabled]
  // When disabled→false: streamMessage onComplete just fired → evaluate()

  // evaluate() checks 5 conditions in priority order:
  //   S1 → S2 → S3 → S4 → S5 (first matching, cooldown-ok wins)

  // Events: aaai:audit_started → hide()
  //         aaai:audit_completed → evaluate() after 3s

  window.AIOS.Suggestions = { evaluate, hide };
})();
```

---

## PART E — PROACTIVE TRIGGER CONDITIONS

| ID | Condition | Suggestion Text | Action |
|----|-----------|----------------|--------|
| S1 | Mission `in_progress` + `nextStep ≠ currentStep` | `"Next step: [nextStep]"` | `"Help me with this"` → `"What should I do next?"` |
| S2 | `profile.state` set, 4+ AI msgs, no goals or mission | `"[State] has state-specific veteran benefits beyond federal programs."` | `"Check State Benefits"` |
| S3 | `dischargeStatus === 'Other Than Honorable'`, 3+ msgs | `"Veterans with OTH discharges can apply for a Character of Discharge review."` | `"Learn more"` |
| S4 | `vaRating < 100`, 5+ AI msgs | `"At [X]%, you may qualify for a higher combined rating."` | `"Explore this"` |
| S5 | 6+ AI msgs, no mission, no branch, no goals | `"Not sure where to start? I can map out your best benefits path."` | `"Find My Benefits"` |

**Priority:** S1 → S2 → S3 → S4 → S5. First matching, cooldown-OK condition wins. Nothing fires if none match.

---

## PART F — UI / RESPONSE INTEGRATION

**No app.js changes.** Integration is purely event-driven:

```
streamMessage() completes
  → div.classList.remove('message--streaming')
  → onComplete() fires
    → btnSend.disabled = false        ← MutationObserver detects this
      → setTimeout(evaluate, 2000)    ← 2s delay ensures full settle

evaluate()
  → gates: crisis? processing? chips? aiCount < 3? → skip
  → check S1–S5 in order → first match → _show(suggestion)
    → builds DOM: icon + text + action btn + × dismiss
    → el.style.display = 'flex'
    → setTimeout(_hide, 12000)        ← auto-dismiss
```

**Hooks to app.js custom events:**
- `aaai:audit_started` → `_hide()` — clears any suggestion when user begins intake
- `aaai:audit_completed` → `evaluate()` after 3s — natural moment to suggest next step

**Zero parallel logic.** Suggestion action buttons call `window.AIOS.Chips.send()` / `window.AIOS.Chips.upload()` (Phase 14) which flows through `sendTextMessage()` → `sendToAI()` unchanged.

---

## PART G — READY FOR NEXT STEP

Phase 15 complete and locked.

**New file:** `js/aios/suggestion-engine.js`
**Modified:** `index.html` (suggestion HTML + script tag), `css/styles.css` (suggestion styles)
**Untouched:** `app.js`, `mission-manager.js`, `memory-manager.js`, `auth.js`, voice system, DB

**Safety summary:**
- Crisis gate: `crisisBanner` visibility checked on every evaluate() call
- Processing gate: `btnSend.disabled` checked
- Chips-visible gate: no layering with Phase 14 chips
- Minimum 3 AI messages before any suggestion fires
- 5-minute cooldown per suggestion type prevents spam
- All suggestion texts are factual — no fabricated eligibility claims
- Auto-dismisses in 12 seconds
- Fully removable: delete the file + 3 HTML lines + CSS block

**Awaiting Phase 16 instructions.**
