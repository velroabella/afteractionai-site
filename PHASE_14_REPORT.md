# PHASE 14 — AIOS Quick-Trigger Chips
## AfterActionAI.org | AIOS Implementation

---

## PART A — FILES READ

| File | Purpose |
|------|---------|
| `index.html` | Chat screen layout — located insertion point above `.chat-input` |
| `js/app.js` | Confirmed `sendTextMessage()` flow: reads `userInput.value` → `sendToAI()`. Confirmed `fileInput.click()` pattern for upload. Confirmed `btnSend`, `userInput`, `fileInput` IDs |
| `js/aios/router.js` | Verified keyword matching for all 5 chip trigger phrases |
| `css/styles.css` | Design tokens — matched chip style to existing AIOS component pattern. Confirmed `captions-overlay` is `position:absolute` (out of flex flow) |

---

## PART B — FILES MODIFIED

| File | Change |
|------|--------|
| `index.html` | Added chip tray HTML (11 lines) above `#chatInputText`; added `<script src="js/aios/chips.js">` after `mission-card.js` |
| `css/styles.css` | Appended 60-line chip CSS block at end of file |

---

## PART C — BACKUPS CREATED

| Backup File | Original |
|-------------|----------|
| `index.backup-before-phase14-chips.html` | `index.html` |
| `css/styles.backup-before-phase14-chips.css` | `css/styles.css` |

---

## PART D — EXACT CHANGES

### 1. `index.html` — Chip Tray HTML (inserted above `#chatInputText`)

```html
<!-- AIOS Quick-Trigger Chips (Phase 14) — hidden after first user action -->
<div class="aios-chips" id="aiosChips" role="toolbar" aria-label="Quick actions">
  <button class="aios-chip" type="button"
    onclick="window.AIOS&&window.AIOS.Chips&&window.AIOS.Chips.send('What benefits am I eligible for?')">
    <svg .../>  Find My Best Benefits
  </button>
  <button class="aios-chip" type="button"
    onclick="window.AIOS&&window.AIOS.Chips&&window.AIOS.Chips.send('I want to start a disability claim')">
    <svg .../>  Start a Disability Claim
  </button>
  <button class="aios-chip" type="button"
    onclick="window.AIOS&&window.AIOS.Chips&&window.AIOS.Chips.send('What state benefits am I eligible for?')">
    <svg .../>  Check State Benefits
  </button>
  <button class="aios-chip" type="button"
    onclick="window.AIOS&&window.AIOS.Chips&&window.AIOS.Chips.send('What should I do next?')">
    <svg .../>  What Should I Do Next?
  </button>
  <button class="aios-chip aios-chip--upload" type="button"
    onclick="window.AIOS&&window.AIOS.Chips&&window.AIOS.Chips.upload()">
    <svg .../>  Upload a Document
  </button>
</div>
```

### 2. `index.html` — Script tag

```html
<script src="js/aios/chips.js"></script>
```

### 3. `css/styles.css` — Appended chip styles

```css
/* AIOS — QUICK-TRIGGER CHIPS (Phase 14) */
.aios-chips {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; flex-shrink: 0;
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: var(--navy);
}
.aios-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: 20px;
  border: 1px solid rgba(197,165,90,0.35);
  background: rgba(197,165,90,0.07);
  color: var(--gray-300); font-size: 0.72rem;
  font-weight: 500; white-space: nowrap;
  cursor: pointer; flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.aios-chip:hover, .aios-chip:focus-visible {
  background: rgba(197,165,90,0.18);
  border-color: var(--gold); color: var(--gold-light);
}
.aios-chip--upload {
  border-color: rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.04); color: var(--gray-500);
}
```

### 4. `js/aios/chips.js` — New file (full)

```javascript
(function() {
  'use strict';
  var _hidden = false;
  function _el(id) { return document.getElementById(id); }

  function hide() {
    if (_hidden) return;
    var tray = _el('aiosChips');
    if (tray) { tray.style.display = 'none'; _hidden = true; }
  }

  function send(text) {
    var input = _el('userInput'), sendBtn = _el('btnSend');
    if (!input || !sendBtn) return;
    hide();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    sendBtn.click();  // delegates to sendTextMessage() → sendToAI()
  }

  function upload() {
    var fileInput = _el('fileInput');
    if (!fileInput) return;
    hide();
    fileInput.click();  // delegates to existing app.js upload handler
  }

  function _watchManualSend() {
    var sendBtn = _el('btnSend'), input = _el('userInput');
    if (sendBtn) sendBtn.addEventListener('click', function() {
      if (input && input.value.trim().length > 0) hide();
    });
    if (input) input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey && input.value.trim().length > 0) hide();
    });
  }

  function _init() { _watchManualSend(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else { _init(); }

  window.AIOS = window.AIOS || {};
  window.AIOS.Chips = { send: send, upload: upload, hide: hide };
})();
```

---

## PART E — CHIPS ADDED

| Chip Label | Trigger Text Injected | AIOS Intent | Skill |
|---|---|---|---|
| Find My Best Benefits | `"What benefits am I eligible for?"` | `BENEFITS_DISCOVERY` | `benefit-path-finder` |
| Start a Disability Claim | `"I want to start a disability claim"` | `DISABILITY_CLAIM` | `va-disability-claim` |
| Check State Benefits | `"What state benefits am I eligible for?"` | `STATE_BENEFITS` | `state-benefits` |
| What Should I Do Next? | `"What should I do next?"` | `NEXT_STEP` | `next-action-planner` |
| Upload a Document | *(no text — triggers file picker)* | via upload handler | `document-analyzer` (post-upload) |

All trigger phrases were verified against router.js keyword tables before being finalized.

---

## PART F — ROUTING INTEGRATION

**No parallel logic was created.** All chip routing flows through the existing path:

```
chip click
  → window.AIOS.Chips.send(text)
    → userInput.value = text
    → btnSend.click()
      → sendTextMessage()          ← existing app.js function (unchanged)
        → addMessage(text, 'user')
        → sendToAI(text)
          → callChatEndpoint()     ← AIOS integration layer (Phase 11)
            → Router.routeAIOSIntent()
            → SkillLoader.loadAIOSSkill()
            → RequestBuilder.buildAIOSRequest()
```

Upload chip:
```
chip click
  → window.AIOS.Chips.upload()
    → fileInput.click()            ← existing app.js upload handler (unchanged)
```

No changes to app.js, no new event dispatch patterns, no separate fetch calls.

---

## PART G — READY FOR NEXT STEP

Phase 14 complete and locked.

**New file:** `js/aios/chips.js`
**Modified:** `index.html` (chip tray HTML + script tag), `css/styles.css` (chip styles appended)
**Untouched:** `app.js`, `mission-manager.js`, `memory-manager.js`, `auth.js`, voice system, DB

Chips visible on chat open. Auto-hide after first chip click or first manual send.
On mobile: horizontal scroll, no line-wrap, no layout break.

**Awaiting Phase 15 instructions.**
