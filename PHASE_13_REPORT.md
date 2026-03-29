# PHASE 13 — Active Mission UI Card
## AfterActionAI.org | AIOS Implementation

---

## PART A — FILES READ

| File | Purpose |
|------|---------|
| `js/aios/mission-manager.js` | Phase 10 — locked. Confirmed `window.AIOS.Mission.current` structure and `buildMissionSummary()` |
| `index.html` | Chat screen layout — located insertion point between `.chat-header` and `.chat-messages` |
| `css/styles.css` | Design tokens, existing AIOS component patterns (aios-next-step, aios-item) |

---

## PART B — FILES MODIFIED

| File | Change |
|------|--------|
| `index.html` | Added mission card HTML div (lines 225–235), added script tag for `mission-card.js` (line 336) |
| `css/styles.css` | Appended 65-line mission card CSS block at end of file (lines 8314–8385) |

---

## PART C — BACKUPS CREATED

| Backup File | Original |
|-------------|----------|
| `index.backup-before-phase13-mission-card.html` | `index.html` |
| `css/styles.backup-before-phase13-mission-card.css` | `css/styles.css` |

---

## PART D — EXACT CHANGES

### 1. `index.html` — Mission Card HTML (inserted between header and messages)

```html
<!-- AIOS Active Mission Card (Phase 13) — hidden when no mission is active -->
<div class="aios-mission-card" id="aiosMissionCard" style="display:none;"
     role="status" aria-live="polite" aria-label="Active mission status">
  <span class="aios-mission-card__label">Mission</span>
  <span class="aios-mission-card__type" id="aiosMissionType"></span>
  <span class="aios-mission-card__badge" id="aiosMissionStatus"></span>
  <span class="aios-mission-card__sep" aria-hidden="true">·</span>
  <span class="aios-mission-card__step" id="aiosMissionStep"></span>
  <span class="aios-mission-card__next" id="aiosMissionNext" style="display:none;"></span>
  <span class="aios-mission-card__blockers" id="aiosMissionBlockers" style="display:none;"></span>
</div>
```

### 2. `index.html` — Script tag (after mission-manager.js)

```html
<script src="js/aios/mission-card.js"></script>
```

### 3. `css/styles.css` — Appended block

```css
/* ══════════════════════════════════════════════════════
   AIOS — ACTIVE MISSION CARD  (Phase 13)
   ══════════════════════════════════════════════════════ */
.aios-mission-card {
  background: rgba(17, 17, 17, 0.97);
  border-bottom: 1px solid rgba(197, 165, 90, 0.18);
  border-left: 3px solid var(--gold);
  padding: 7px 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.75rem;
  line-height: 1.4;
}
.aios-mission-card__label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--gold);
  flex-shrink: 0;
}
.aios-mission-card__type {
  font-weight: 600;
  color: var(--white);
  flex-shrink: 0;
}
.aios-mission-card__badge {
  font-size: 0.63rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(197, 165, 90, 0.15);
  color: var(--gold-light);
  flex-shrink: 0;
}
.aios-mission-card__sep  { color: var(--gray-500); flex-shrink: 0; }
.aios-mission-card__step { color: var(--gray-300); flex-shrink: 0; }
.aios-mission-card__next { color: var(--gray-500); }
.aios-mission-card__next::before { content: '\2192\00A0'; color: var(--gold); }
.aios-mission-card__blockers { width: 100%; font-size: 0.7rem; color: #e07a7a; padding-left: 2px; }
```

### 4. `js/aios/mission-card.js` — New file (full)

```javascript
(function() {
  'use strict';

  var _card = null, _typeEl = null, _statusEl = null;
  var _stepEl = null, _nextEl = null, _blockersEl = null;
  var _lastHash = null;

  function _initRefs() {
    if (_card) return true;
    _card       = document.getElementById('aiosMissionCard');
    _typeEl     = document.getElementById('aiosMissionType');
    _statusEl   = document.getElementById('aiosMissionStatus');
    _stepEl     = document.getElementById('aiosMissionStep');
    _nextEl     = document.getElementById('aiosMissionNext');
    _blockersEl = document.getElementById('aiosMissionBlockers');
    return !!_card;
  }

  function update(mission) {
    if (!_initRefs()) return;
    if (!mission || typeof mission !== 'object') {
      _card.style.display = 'none';
      _lastHash = null;
      return;
    }
    var blockerStr = (Array.isArray(mission.blockers) && mission.blockers.length)
      ? mission.blockers.join('|') : '';
    var hash = (mission.type||'') + '§' + (mission.status||'') + '§' +
               (mission.currentStep||'') + '§' + (mission.nextStep||'') + '§' + blockerStr;
    if (hash === _lastHash) return;
    _lastHash = hash;

    if (_typeEl)   _typeEl.textContent   = mission.name || _formatType(mission.type) || '';
    if (_statusEl) _statusEl.textContent = _formatStatus(mission.status);
    if (_stepEl)   _stepEl.textContent   = mission.currentStep ? 'Step: ' + mission.currentStep : '';

    if (_nextEl) {
      if (mission.nextStep && mission.nextStep !== mission.currentStep) {
        _nextEl.textContent = mission.nextStep;
        _nextEl.style.display = '';
      } else { _nextEl.style.display = 'none'; }
    }

    if (_blockersEl) {
      if (blockerStr) {
        _blockersEl.textContent = '\u26A0 ' + mission.blockers.join(' \u00B7 ');
        _blockersEl.style.display = '';
      } else { _blockersEl.style.display = 'none'; }
    }

    _card.style.display = '';
  }

  function _formatType(type) {
    if (!type) return '';
    return type.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  function _formatStatus(status) {
    if (!status) return '';
    var map = { not_started:'Not Started', in_progress:'In Progress',
                completed:'Completed', on_hold:'On Hold', abandoned:'Abandoned' };
    return map[status] || status.replace(/_/g, ' ');
  }

  function _tick() {
    var chatScreen = document.getElementById('chatScreen');
    if (!chatScreen || chatScreen.style.display === 'none') return;
    if (!window.AIOS || !window.AIOS.Mission) return;
    update(window.AIOS.Mission.current || null);
  }

  function _start() {
    setInterval(_tick, 2000);
    setTimeout(_tick, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _start);
  } else { _start(); }

  window.AIOS = window.AIOS || {};
  window.AIOS.MissionCard = { update: update };
})();
```

---

## PART E — ACTIVE MISSION UI STATUS

**Layout position:** Between `.chat-header` and `.chat-messages` inside `#chatScreen`
**Flex behavior:** `flex-shrink: 0` — takes only the space it needs, does not compress messages
**Visual style:** Dark strip matching the navy header; gold left-border accent; gold `MISSION` label; white mission name; gold-tinted status badge; gray step text; arrow → next step
**Blockers:** Renders as a second row in muted red — only shown when blockers array is non-empty
**Connection:** `window.AIOS.Mission.current` polled every 2 seconds while chat screen is visible; also callable directly via `window.AIOS.MissionCard.update(mission)`
**Change detection:** Hash-based diffing — DOM only updated when mission fields actually change

**Visual example (when active):**

```
[ MISSION ]  VA Disability Claim  [ IN PROGRESS ]  ·  Step: Gather evidence  →  File Form 21-526EZ
```

---

## PART F — EMPTY STATE BEHAVIOR

| Condition | Card behavior |
|-----------|--------------|
| `window.AIOS.Mission.current === null` | `display:none` — zero pixels, no layout impact |
| `window.AIOS.Mission` not loaded yet | Poll skips silently, card stays hidden |
| Chat screen hidden (voice, checklist, etc.) | Poll tick skips — no DOM work |
| Mission `blockers` array empty | Blockers row hidden, card remains single-line |
| Mission `nextStep === currentStep` | Next step span hidden, card compresses |
| User not logged in / anonymous | Card works normally (mission state is in-session only) |

No placeholder, no "no active mission" message — the element is fully invisible when empty.

---

## PART G — READY FOR NEXT STEP

Phase 13 is complete and stable.

- `js/aios/mission-card.js` — NEW file, locked
- `index.html` — mission card HTML + script tag added
- `css/styles.css` — mission card styles appended
- No changes to: app.js, mission-manager.js, memory-manager.js, auth.js, voice system, DB
- Backups created for both modified files

**Awaiting Phase 14 instructions.**
