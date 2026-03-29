# PHASE 21 — AIOS Onboarding Card
## AfterActionAI.org | AIOS Implementation

---

## PART A — FILES READ

| File | Key Finding |
|------|-------------|
| `css/styles.css` | CSS vars confirmed: `--navy`, `--gold`, `--gray-*`, `--font`, `--radius`, `--radius-sm`. Existing AIOS suggestion card patterns (`.aios-suggestion`) used as style reference. File ends at line 8522. |
| `js/app.js` — `startChat()` (line 738) | Text mode path: `captionsOverlay` → `sendToAI('START_CONVERSATION')`. Insertion point for `_showOnboardingCard()` is immediately before that call. Voice mode path does NOT call onboarding (voice UX is different — correct). |
| `js/app.js` — `sendToAI()` (line 1174) | `realMsgCount === 1` block fires `aaai:audit_started` event on first real user message. This is the correct place to set `aaai_returning` and dismiss the card on first send. |
| `js/app.js` — `streamMessage()` (line 1252) | Called for every text-mode AI response (streaming word-by-word). Adding dismiss at the top handles text path AI response. |
| `js/app.js` — `addMessage()` (line 1428) | Called for voice mode AI responses and any direct message inserts. Dismiss goes at top of `role === 'ai'` branch. |
| `index.html` (lines 195–294) | Chips already in HTML: "Find My Best Benefits", "Start a Disability Claim", "Check State Benefits", "What Should I Do Next?", "Upload a Document". Onboarding card references these via hint text — no HTML changes needed. |

---

## PART B — FILES MODIFIED

| File | Change |
|------|--------|
| `css/styles.css` | Added `@keyframes aaai-onboard-in` + `.aios-onboard-card` block (+63 lines appended) |
| `js/app.js` | Added `_showOnboardingCard()` + `_dismissOnboardCard()` functions (+36 lines); added 5 hook calls at 4 insertion points |

**Untouched:** `index.html`, all AIOS modules, `realtime-voice.js`, `realtime-token.js`, `request-builder.js`, `inspector.js`, DB, voice transport.

---

## PART C — BACKUPS CREATED

| Backup File | Original |
|-------------|----------|
| `js/app.backup-before-phase21-onboarding.js` | `js/app.js` (post-Phase 20 state) |
| `css/styles.backup-before-phase21-onboarding.css` | `css/styles.css` (post-Phase 20 state) |

No backup of `index.html` needed — it was not modified.

---

## PART D — EXACT CHANGES

### `css/styles.css` — Appended block (63 lines)

```css
@keyframes aaai-onboard-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.aios-onboard-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--gray-900);
  border-left: 3px solid var(--gold);
  border-radius: var(--radius-sm);
  padding: 14px 16px 12px 16px;
  margin: 0 0 12px 0;
  animation: aaai-onboard-in 0.3s ease both;
  position: relative;
}
/* ... headline, body, hint, skip button, dismissed state */

.aios-onboard-card.aios-onboard-card--dismissed {
  display: none;
}
```

Design matches existing AIOS components: `--gray-900` background, `--gold` left border, `var(--font)`, `var(--radius-sm)`.

### `js/app.js` — New functions (inserted before `startChat` at line 735)

```javascript
// ══════════════════════════════════════════════════════
//  AIOS — ONBOARDING CARD  (Phase 21)
// ══════════════════════════════════════════════════════
function _showOnboardingCard() {
  if (localStorage.getItem('aaai_returning') === '1') return; // skip returning users
  if (document.getElementById('aiosOnboardCard')) return;     // no duplicate
  if (!chatMessages) return;                                  // safety guard

  var card = document.createElement('div');
  card.id = 'aiosOnboardCard';
  card.className = 'aios-onboard-card';
  card.innerHTML = /* headline + body + hint + skip button */;

  // Insert as first child — appears above the AI's opening message
  if (chatMessages.firstChild) {
    chatMessages.insertBefore(card, chatMessages.firstChild);
  } else {
    chatMessages.appendChild(card);
  }

  // Skip button listener
  var skipBtn = document.getElementById('aiosOnboardSkip');
  if (skipBtn) skipBtn.addEventListener('click', function() { _dismissOnboardCard(); });
}

function _dismissOnboardCard() {
  var card = document.getElementById('aiosOnboardCard');
  if (card) card.classList.add('aios-onboard-card--dismissed'); // CSS: display:none
}
```

### `js/app.js` — Hook in `startChat()` (text mode branch)

```diff
+     // Phase 21: show onboarding card for first-time users
+     _showOnboardingCard();
      // Text mode: full API opening message
      sendToAI('START_CONVERSATION');
```

### `js/app.js` — Hook in `streamMessage()` (text-path AI response)

```diff
  function streamMessage(fullText, onComplete) {
+   _dismissOnboardCard(); // Phase 21
    var div = document.createElement('div');
```

### `js/app.js` — Hook in `addMessage()` (voice-path and direct AI response)

```diff
  if (role === 'ai') {
+   _dismissOnboardCard(); // Phase 21
    div.innerHTML = formatMessage(text);
```

### `js/app.js` — Hook in `sendToAI()` (first real user message)

```diff
  if (realMsgCount === 1) {
    window.dispatchEvent(new CustomEvent('aaai:audit_started'));
    log('Analytics', 'dispatched aaai:audit_started');
+   localStorage.setItem('aaai_returning', '1'); // Phase 21 — mark as returning
+   _dismissOnboardCard(); // Phase 21 — immediate dismiss on first real send
  }
```

---

## PART E — ONBOARDING CARD BEHAVIOUR

### Card content

```
┌─────────────────────────────────────────────────────┐
│ Your free veteran navigator is ready.               │
│                                                     │
│ I can help you understand your VA benefits, start   │
│ a disability claim, find state programs, and        │
│ navigate the paperwork — step by step.              │
│                                                     │
│ Tap a quick start below, or just type your          │
│ question.                                           │
│                                                     │
│ [Skip]                                              │
└─────────────────────────────────────────────────────┘
```

### Dismiss triggers (all paths covered)

| Trigger | Path | Function |
|---------|------|----------|
| AI first response starts streaming | Text mode | `streamMessage()` |
| AI response added directly | Voice mode / direct | `addMessage(role='ai')` |
| User sends first real message | Text + voice | `sendToAI()` at `realMsgCount===1` |
| User clicks Skip button | Any | Skip button `click` listener |

### Returning user detection

`localStorage.getItem('aaai_returning') === '1'` is checked in `_showOnboardingCard()`. The key is set in `sendToAI()` on first real message. On subsequent sessions the card is never created.

### Chip integration

No changes to chip HTML needed. The card's hint text ("Tap a quick start below, or just type your question.") refers to the existing chips rendered below the chat area by the existing chip infrastructure.

---

## PART F — SAFETY / REMOVABILITY

| Rule | Status |
|------|--------|
| No chat flow interference | ✓ Card is purely visual — never blocks sends, AI calls, or voice transport |
| No DOM conflicts | ✓ `id="aiosOnboardCard"` uniqueness guard prevents duplicates |
| No voice mode card | ✓ `_showOnboardingCard()` only called from text mode branch of `startChat()` |
| No memory / mission side effects | ✓ Functions only touch DOM and one localStorage key |
| Safe repeated calls | ✓ `_dismissOnboardCard()` is idempotent — safe to call many times |
| Safe on missing DOM | ✓ All functions guard for `!chatMessages`, missing `card` |
| Fully removable | Remove CSS block from `styles.css`, remove two functions and 5 hook lines from `app.js` → zero trace |
| No styles.css conflicts | ✓ New class names `.aios-onboard-card*` are unique; no existing selectors touched |

**To remove entirely:**
1. Delete the `/* Phase 21 */` CSS block from `styles.css`
2. Delete `_showOnboardingCard()` and `_dismissOnboardCard()` from `app.js`
3. Remove the 5 hook call lines (all marked `// Phase 21`)
4. Done — no other files changed

---

## PART G — READY FOR NEXT STEP

Phase 21 complete and locked.

**Modified:** `js/app.js` (+41 lines, 2540 → 2581), `css/styles.css` (+63 lines)
**Backups:** `app.backup-before-phase21-onboarding.js`, `styles.backup-before-phase21-onboarding.css`
**New functions:** `_showOnboardingCard()`, `_dismissOnboardCard()`
**New hooks:** 5 call sites across `startChat()`, `streamMessage()`, `addMessage()`, `sendToAI()`
**Syntax:** Verified clean (`node --check`)

**Default state:** Card shows for first-time users only. Returning users (any prior session where they sent a message) see nothing.
**Dismiss paths:** Skip button, first AI response (stream or direct), first user message send.

**Awaiting Phase 22 instructions.**
