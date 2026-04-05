# FULL SITE QA AUDIT — AfterActionAI.org
**Date:** March 31, 2026
**Scope:** Every HTML page, all CSS, all shared JS, all JSON data files
**Method:** Static code inspection only (no browser/live validation)

---

## PART A — FULL SITE INVENTORY

### Resource / Dataset Pages (11 pages)

| # | Page | Type | System | Verdict | Status |
|---|------|------|--------|---------|--------|
| 1 | medical-help.html | Resource | MODERN mh-* | Reference implementation. Custom hero class (page-hero-text instead of rp-hero), custom crisis section (mh-crisis-section), curated filter model, modal detail view. Most complex page. | **PASS** |
| 2 | service-dogs.html | Resource + Editorial | MODERN mh-* (org section) | Hybrid: static editorial content (sd-* classes) above, mh-* sidebar grid for org directory below. PAGE_SIZE=12 (differs from standard 24). Inline `<style>` block (80+ lines) for sd-* classes. | **PASS** |
| 3 | grants-scholarships.html | Resource | MODERN mh-* | Clean implementation. 3 filter groups, sort, result count, load-more, clear-all. No remaining rp-*/setPill references. | **PASS** |
| 4 | hotlines-escalation.html | Resource (Crisis) | MODERN mh-* | Clean implementation. 1 filter group, no sort dropdown (intentional for crisis page). Crisis bar and QA bar preserved. Set-based multi-select. | **PASS** |
| 5 | wellness.html | Resource | LEGACY rp-* | setPill() single-select, no mh-sidebar-header, no clear-all button, no sort dropdown, inline-styled search input. **46 programs hardcoded inline in `<script>` tag** (not external JSON). Florida sort bias removed but `florida` boolean field still on all data objects. | **FAIL** |
| 6 | licensure.html | Resource | LEGACY rp-* | setPill() single-select, no mh-sidebar-header, no clear-all button, no sort dropdown, inline-styled search input. Conditional VA sub-filter group (page-specific behavior). FL PRIORITY badge removed. Dual card renderers (renderCard + renderVACard). | **FAIL** |
| 7 | state-benefits.html | Resource | LEGACY rp-* | setPill() single-select, no mh-sidebar-header, no clear-all button, no sort dropdown, inline-styled search input. State dropdown (appropriate for 50 states — pills won't work). Multi-file JSON loading (4 files via Promise.all). | **FAIL** |
| 8 | elected-officials.html | Resource | LEGACY rp-* | setPill() single-select, no mh-sidebar-header, no clear-all button, no sort dropdown, inline-styled search input. State dropdown. Hardcoded sort (Senate first → state → name). | **FAIL** |
| 9 | document-templates.html | Resource | LEGACY rp-* | setPill() single-select, no mh-sidebar-header, no clear-all button, no sort dropdown, inline-styled search input. **No load-more** (all items rendered at once). 24 items — acceptable dataset size for no pagination. Disclaimer banner above QA bar. | **FAIL** |
| 10 | families-support.html | Resource | PARTIAL fam-* | Has sort dropdown (3 options), sidebar header with clear-all, search input with fam-search-input class. togglePill() single-select-per-group (not true Set-based multi-select). Custom crisis section (fam-crisis-section). **No esc() function — renders user data directly into innerHTML (XSS risk)**. Location filter limited to 5 states. | **FAIL** |
| 11 | resources.html | Resource | LEGACY custom | **Completely different architecture.** Single-column flat layout, no sidebar, horizontal filter-btn bar, filterByCategory() single-select. **209 resources hardcoded inline.** No load-more, no sort, no clear-all, no sidebar header. Loads resources-upgrade.css for theming. Has user submission form with localStorage. | **FAIL** |

### Static / Editorial / Legal / App Pages (13 pages)

| # | Page | Type | Verdict | Status |
|---|------|------|---------|--------|
| 12 | index.html | App/SPA | Sophisticated three-screen SPA (landing, chat, checklist). Voice + text AI. Not a resource page. | **PASS** |
| 13 | profile.html | App/SPA | Authenticated user dashboard. Mission progress, checklist, documents. Not a resource page. | **PASS** |
| 14 | about.html | Editorial | Standard editorial page. page-hero-image hero. Consistent nav/footer. | **PASS** |
| 15 | blog.html | Editorial | Blog with date-based publish logic fetching from blog-posts.json. | **PASS** |
| 16 | board.html | Editorial | Board member profiles. 1 filled + 4 open seats. | **PASS** |
| 17 | contact.html | Support | Contact form. **localStorage submission (MVP) — no Supabase integration yet.** | **PARTIAL** |
| 18 | education.html | Editorial | Static educational content. Yellow "content expanding" banner. | **PASS** |
| 19 | faq.html | Support | 9-item accordion. Single-open behavior. | **PASS** |
| 20 | gallery.html | Editorial | Placeholder page — no images, CTA to share stories. | **PASS** |
| 21 | privacy.html | Legal | Comprehensive privacy policy with data retention table. | **PASS** |
| 22 | terms.html | Legal | Full terms of service. Florida jurisdiction. | **PASS** |
| 23 | disclaimer.html | Legal | 15-section disclaimer covering VA non-affiliation, AI limitations. | **PASS** |
| 24 | template-flow.html | App | Document builder flow. Relies on template-flow.js (95K lines). | **PASS** |

### Summary: 4 PASS, 7 FAIL, 1 PARTIAL out of 11 resource pages. 12 PASS, 1 PARTIAL out of 13 non-resource pages.

---

## PART B — RESOURCE PAGE SCORECARD

| Page | System | Search | Filters | Multi-Select | Sort | Result Count (sidebar) | Load More | Empty State | Clear All | Sidebar Header | Data Source | Requires |
|------|--------|--------|---------|-------------|------|----------------------|-----------|-------------|-----------|---------------|------------|----------|
| medical-help | mh-* | ✓ | 6 groups | ✓ Set | ✓ 4 opts | ✓ | ✓ 24/pg | ✓ | ✓ | ✓ | External JSON | No action |
| service-dogs | mh-* | ✓ | 6 groups | ✓ Set | ✓ 4 opts | ✓ | ✓ 12/pg | ✓ | ✓ | ✓ | External JSON | No action |
| grants-scholarships | mh-* | ✓ | 3 groups | ✓ Set | ✓ 3 opts | ✓ | ✓ 24/pg | ✓ | ✓ | ✓ | External JSON | No action |
| hotlines-escalation | mh-* | ✓ | 1 group | ✓ Set | ✗ (intentional) | ✓ | ✓ 24/pg | ✓ | ✓ | ✓ | External JSON | No action |
| **wellness** | rp-* | ✓ | 3 groups | ✗ single | ✗ | ✗ main only | ✓ 24/pg | ✓ | ✗ | ✗ | **INLINE** | **Full migration** |
| **licensure** | rp-* | ✓ | 3 groups | ✗ single | ✗ | ✗ main only | ✓ 24/pg | ✓ | ✗ | ✗ | External JSON | **Full migration** |
| **state-benefits** | rp-* | ✓ | dropdown+pills | ✗ single | ✗ | ✗ main only | ✓ 24/pg | ✓ | ✗ | ✗ | External JSON (4) | **Full migration** |
| **elected-officials** | rp-* | ✓ | dropdown+pills | ✗ single | ✗ | ✗ main only | ✓ 24/pg | ✓ | ✗ | ✗ | External JSON | **Full migration** |
| **document-templates** | rp-* | ✓ | 2 groups | ✗ single | ✗ | ✗ main only | ✗ none | ✓ | ✗ | ✗ | External JSON | **Full migration** |
| **families-support** | fam-* | ✓ | 4 groups | ✗ per-group | ✓ 3 opts | ✓ (both) | ✓ 24/pg | ✓ | ✓ | ✓ | External JSON | **Migration + esc() fix** |
| **resources** | custom | ✓ | horiz bar | ✗ single | ✗ | ✗ | ✗ none | ✓ | ✗ | ✗ | **INLINE** | **Full rebuild** |

---

## PART C — GLOBAL INCONSISTENCIES

### C1: Three parallel CSS class systems for the same pattern
The site defines `.mh-page-wrapper`, `.rp-page-wrapper`, and `.fam-page-wrapper` in styles.css with identical grid structure (260px + 1fr). Each has its own sidebar, pill, filter-group, grid, load-more, and empty-state classes. All three responsive breakpoints are duplicated (900px, 520px). This is 3x the maintenance surface for the same layout.

### C2: Hero section class inconsistency
medical-help.html uses `page-hero-text` class. All other resource pages use `rp-hero`. Static pages use `page-hero-image`, `page-hero-bar`, or `page-hero`. There are at least 4 hero variants with no shared base.

### C3: Card class inconsistency
medical-help.html renders cards as `mh-card aa-card` (using the shared aa-card base). All other resource pages render cards as `rp-card` (which has its own complete styling). families-support renders as `fam-card aa-card`. The shared `aa-card` base exists (line 7648) but only 2 of 11 resource pages use it.

### C4: JS function naming convention inconsistency
medical-help.html uses unprefixed functions: `togglePill()`, `applyFilters()`, `loadMore()`. service-dogs uses `sd*` prefix. grants-scholarships uses `gs*`. hotlines uses `hl*`. Legacy pages use unprefixed `setPill()`, `filterAndRender()`. families-support uses unprefixed `togglePill()`, `applyFilters()`. There is no consistent convention.

### C5: Quick-access function naming inconsistency
medical-help uses `setCurated()`. grants-scholarships, hotlines, and all legacy pages use `applyQA()`. families-support uses `setQA()`. Three different function names for the same UX pattern.

### C6: Filter pill data attribute inconsistency
medical-help.html uses `data-filter`, `data-value`, and an additional `data-active-class` attribute for per-condition color styling. All other mh-* pages use only `data-filter` and `data-value`. Legacy rp-* pages use `data-filter-group` and `data-filter-value` (different attribute names). families-support uses `data-filter` and `data-value` (fam-pill variant).

### C7: Result count placement inconsistency
Modern mh-* pages show result count inside the sidebar (`mh-result-count`). Legacy rp-* pages show it in the main content area as an inline `resultsCount` div. families-support shows it in both sidebar and toolbar.

### C8: esc() function presence/absence inconsistency
All mh-* pages and most rp-* pages have a null-safe `esc()` function. **families-support.html has no esc() function at all** and renders data directly into innerHTML via template literals. resources.html uses `escapeHTML()` (different name).

### C9: Two pages have inline hardcoded data
wellness.html (46 programs) and resources.html (209 resources) store data directly in `<script>` tags. Every other resource page fetches from external JSON. This prevents independent data updates and creates maintenance divergence.

### C10: Page-specific CSS files proliferation
10 separate CSS files exist: styles.css (shared), plus 9 page-specific `-upgrade.css` files (landing, about, blog, board, contact, education, gallery, legal-modal, resources). The upgrade files range from 177 to 12,244 lines. Some may contain redundant or conflicting rules.

### C11: Sort dropdown inconsistency
4 pages have sort dropdowns (medical-help, service-dogs, grants-scholarships, families-support). 1 page intentionally omits it (hotlines — crisis-first sort). 6 pages have no sort at all (wellness, licensure, state-benefits, elected-officials, document-templates, resources). Most of the missing-sort pages have hardcoded sorts in JS that the user cannot control.

---

## PART D — CRITICAL ISSUES

### D1: families-support.html — No HTML escaping (XSS vulnerability)
**Severity: HIGH.** The `renderCard()` function at line 394 inserts `r.name`, `r.website`, `r.contact_info`, and `r.description` directly into innerHTML with no `esc()` function. If any data field contains HTML characters (`<`, `>`, `"`, `&`), the page will render broken HTML or execute injected scripts. All other resource pages have esc() protection.

### D2: 7 of 11 resource pages still use legacy filter systems
**Severity: HIGH (site standardization).** wellness, licensure, state-benefits, elected-officials, document-templates still use rp-* / setPill() single-select. families-support uses fam-* / togglePill() single-select-per-group. resources uses custom / filterByCategory(). Only 4 pages match the target mh-* standard.

### D3: wellness.html — 46 programs hardcoded inline
**Severity: MEDIUM.** Data embedded in HTML instead of external JSON. Prevents data management, makes content updates require HTML editing, breaks the pattern every other data-driven page follows.

### D4: resources.html — 209 resources hardcoded inline + no sidebar layout
**Severity: MEDIUM-HIGH.** The most architecturally divergent page on the site. Single-column flat layout, horizontal filter buttons, no sidebar, no pagination, no sort, inline data. This page will look and feel completely different from every other resource page.

### D5: contact.html — Form submits to localStorage only
**Severity: MEDIUM.** The contact form saves submissions to localStorage instead of Supabase. Data is lost when browser storage is cleared. No backend receives the submissions.

---

## PART E — NON-CRITICAL GAPS

### E1: service_dogs.json data quality
36 of 52 records (69%) are missing the `phone` field. 18 records (35%) have null `region` data. 4 records are missing `website`. Cards with missing phone/website will render without contact links.

### E2: Orphaned JSON files
`data/blog-queue.json` (28 items) and `data/committees.json` (18 items) are not referenced by any active HTML page. They may be prepared for future features or may be dead data.

### E3: families-support.html location filter limited to 5 states
Location pills offer only: national, CA, GA, MA, VA. 45 states are unrepresented. This is an arbitrary subset that doesn't match the geographic breadth of the data.

### E4: PAGE_SIZE inconsistency
service-dogs.html uses PAGE_SIZE=12. All other pages use PAGE_SIZE=24. No visible reason for the difference.

### E5: medical-help.html — `treatment` Set declared but never populated
The filters object includes `treatment: new Set()` but no pill in the sidebar populates it, and `applyFilters()` does not check it. Dead filter dimension.

### E6: document-templates.html — No load-more pagination
All 24 templates render at once. Acceptable at current dataset size but inconsistent with the standard pattern.

### E7: Footer link inconsistency
service-dogs.html adds an extra "Service Dogs" link in the footer Resource Hub section that no other page has.

### E8: medical-help.html data file location inconsistency
`afteractionai_resources_database.json` is in the root directory while all other data files are in `data/`. This is a deployment/path organization inconsistency.

---

## PART F — CONTENT PRESERVATION WARNINGS

### F1: wellness.html inline data
When migrating wellness.html to mh-* with external JSON, the 46 inline program objects must be extracted exactly as-is. Each has: name, category, sub, org, website, desc, location, cost, priority, florida (boolean), tags (array). The `florida` field and `priority` field must be preserved even if not used in the new filter system — they are part of the dataset.

### F2: resources.html inline data
When rebuilding resources.html, the 209 inline resource objects must be extracted. Each has: name, category, description, eligibility, website, cost, sourceType. The user submission form (lines 159-193) and its localStorage logic must also be accounted for.

### F3: licensure.html conditional VA sub-filter
The VA sub-category filter group (hidden by default, shown only when "VA Approved" specialty is selected) is page-specific behavior that must be preserved or reimplemented during migration. It contains 9 sub-category pills.

### F4: state-benefits.html and elected-officials.html state dropdowns
These pages use `<select>` dropdowns for state selection (50 states + DC). This is correct UX — 51 options cannot be pills. Migration must preserve the dropdown while wrapping it in mh-* layout.

### F5: families-support.html crisis section
The fam-crisis-section contains 5 crisis buttons (TAPS, Veterans Crisis Line, VA Caregiver, DV Hotline, Military OneSource) with specific phone numbers and URLs. This content must be preserved exactly during any migration.

### F6: families-support.html QA_MAP curated sets
The quick-access system uses a QA_MAP object that maps button values to specific filter criteria (audience + category combinations). This curated logic must be preserved or reimplemented.

### F7: document-templates.html disclaimer banner
The yellow AI-generated content disclaimer banner (lines 110-113) appears between the hero and quick-access bar. It must be preserved during migration.

### F8: elected-officials.html hardcoded sort
The Senate-first → state → name sort order is intentional UX for political data. Migration should preserve this as the default sort.

---

## PART G — FILES OF INTEREST (Priority Watchlist)

### Tier 1: Files that need migration work
1. `wellness.html` — rp-* → mh-*, extract inline data to JSON
2. `licensure.html` — rp-* → mh-*, preserve VA sub-filter
3. `state-benefits.html` — rp-* → mh-*, preserve state dropdown
4. `elected-officials.html` — rp-* → mh-*, preserve state dropdown
5. `document-templates.html` — rp-* → mh-*
6. `families-support.html` — fam-* → mh-*, add esc(), fix filter logic
7. `resources.html` — full rebuild: flat → sidebar, extract inline data

### Tier 2: Data files requiring attention
8. `data/service_dogs.json` — 69% missing phone, 35% missing region
9. `afteractionai_resources_database.json` — should move to data/ directory

### Tier 3: CSS files to consolidate eventually
10. `css/styles.css` — contains 3 parallel class systems (mh-*, rp-*, fam-*)
11. `css/resources-upgrade.css` — page-specific override for legacy resources.html

### Tier 4: Orphaned / dead data
12. `data/blog-queue.json` — 28 items, no consuming page
13. `data/committees.json` — 18 items, no consuming page

---

## PART H — QA CONFIDENCE LEVEL

### Code / Static Inspection — COMPLETED
Every HTML file read in full. Every JSON data file read and item-counted. CSS class systems mapped with line numbers. JS filter logic traced for all resource pages. esc() presence/absence verified. Data attribute naming verified. Card class usage verified. Filter group counts verified. Sort dropdown presence verified. Load-more presence verified. Empty state patterns verified. Quick-access button counts and labels verified. Crisis section content verified. Footer consistency verified. Navigation structure verified.

### Browser / Live Validation — NOT COMPLETED
No pages were loaded in a browser. The following remain unverified:
- Visual rendering of all layouts at desktop and mobile widths
- Filter click → correct card filtering behavior
- Search → correct results
- Load-more button → correct batch rendering
- Empty state → correct display on zero results
- Quick-access → correct filter activation
- Sort dropdown → correct reordering
- Crisis bar links → correct tel:/sms:/https: routing
- Card links → correct external URLs
- Console errors on page load
- CSS class rendering (especially whether rp-card and aa-card produce consistent visuals)
- Mobile sidebar collapse behavior
- Navigation dropdown hover/click behavior
- Auth modal functionality

### Not Verified
- Actual data file network loading (fetch failures, CORS, 404s)
- Supabase connection and auth flow
- Voice API (realtime-voice.js) functionality
- Template flow (template-flow.js) document generation
- Action engine (action-engine.js) matching behavior
- Blog post date-based publish filtering in real browser
- Contact form localStorage save/retrieve

---

## PART I — FINAL VERDICT

**SITE NEEDS SUBSTANTIAL STANDARDIZATION.**

4 of 11 resource pages match the target mh-* system. 7 do not. The 7 non-conforming pages use 3 different legacy systems (rp-*, fam-*, custom). The CSS contains 3 parallel class systems for the same layout pattern. 2 pages have inline hardcoded data instead of external JSON. 1 page has no HTML escaping. The site does not feel like one product when navigating across resource pages.

The 4 modern pages (medical-help, service-dogs, grants-scholarships, hotlines-escalation) and all 13 static/app pages are production-ready. The 7 legacy resource pages are functionally operational but structurally inconsistent with the target standard.

---

## PART J — RECOMMENDED NEXT ORDER OF OPERATIONS

### Phase 1: Safety fix (no migration needed)
1. **families-support.html** — Add `esc()` function and apply it to all data rendered into innerHTML. This is a security fix, not a migration.

### Phase 2: Small migrations (simple pages, external JSON already exists)
2. **document-templates.html** — 2 filter groups, 24 items, external JSON. Simplest migration. No load-more needed at 24 items. No sort needed (phase-based ordering is correct).
3. **licensure.html** — 3 filter groups + conditional VA sub-filter. External JSON. Medium complexity due to sub-filter preservation.

### Phase 3: Dropdown-bearing pages
4. **elected-officials.html** — State dropdown + 2 pill groups, external JSON. Must preserve dropdown within mh-* wrapper.
5. **state-benefits.html** — State dropdown + category pills, 4 JSON files via Promise.all. Must preserve dropdown and multi-file loading.

### Phase 4: Data extraction + migration
6. **wellness.html** — Extract 46 inline programs to `data/wellness.json`, then migrate rp-* → mh-*. Address remaining `florida` field (data-level decision: keep as filterable dimension or remove).

### Phase 5: Full rebuild
7. **resources.html** — Extract 209 inline resources to `data/resources.json`. Rebuild from flat layout to mh-* sidebar+grid. Address submission form (move from localStorage to Supabase or remove). Largest single effort.

### Phase 6: Final family migration
8. **families-support.html** — Migrate fam-* → mh-*. Preserve crisis section, QA_MAP curated logic, sort dropdown. Add proper esc() throughout. Expand location filter beyond 5 states.

### Phase 7: Cleanup
9. Remove rp-* and fam-* class definitions from css/styles.css (after all pages migrated)
10. Move `afteractionai_resources_database.json` into `data/` directory
11. Resolve orphaned `data/blog-queue.json` and `data/committees.json`
12. Address service_dogs.json data quality (missing phone/region fields)
13. Address contact.html localStorage submission (connect to Supabase)
