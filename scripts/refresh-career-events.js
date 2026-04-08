#!/usr/bin/env node
/**
 * refresh-career-events.js
 *
 * Refresh pipeline for data/career-events.json.
 * Runs against all enabled official source adapters, merges with the
 * existing dataset, expires past events, deduplicates, validates schema,
 * and writes the result back to disk.
 *
 * Usage:
 *   node scripts/refresh-career-events.js            # full run
 *   node scripts/refresh-career-events.js --dry-run  # preview only, no write
 *
 * Automation:
 *   Triggered weekly by .github/workflows/refresh-career-events.yml
 *   Can also be run locally before a manual push.
 *
 * Source adapters:
 *   All sources are currently disabled (enabled: false) because
 *   fetch() implementations are placeholders pending HTML-parse
 *   validation on each official source page. When a source is ready,
 *   flip enabled: true and implement fetch() per the inline TODOs.
 *   Until then, the pipeline runs as an expiration-only pass:
 *   it removes past events from the existing seed data, deduplicates,
 *   and rewrites the file — keeping the dataset clean automatically.
 *
 * Exit codes:
 *   0 = success (or dry-run complete)
 *   1 = fatal error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'career-events.json');

// ── Config ──────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const NOW       = new Date();
NOW.setHours(0, 0, 0, 0);
const TODAY_STR = NOW.toISOString().slice(0, 10);  // YYYY-MM-DD

// ── Required schema fields ───────────────────────────────────────────────────
const REQUIRED_FIELDS = [
  'id', 'title', 'organizer', 'organizer_id',
  'start_date', 'end_date', 'timezone',
  'virtual', 'veteran_focus', 'clearance_focus', 'industries',
  'registration_url', 'source_url', 'source_type',
  'last_verified_at', 'confidence_score'
];
// Fields that ARE required but may hold null:
// city, state, notes — omitted from REQUIRED_FIELDS intentionally
// (their absence at the key level would fail JSON schema but null is valid)

// ── Source registry ──────────────────────────────────────────────────────────
//
// Each adapter shape:
//
//   id          {string}  Unique source key
//   name        {string}  Human-readable label for logging
//   type        {string}  'html_fetch' | 'rss' | 'manual_seed'
//   enabled     {bool}    Set true only when fetch() is fully implemented+tested
//   baseConf    {number}  Base confidence score this source earns (0–1)
//   organizer_id {string} Matches the organizer_id used in the schema
//   organizer   {string}  Display name
//   source_type {string}  'official' | 'nonprofit'
//   fetch()     {async → raw[] | null}
//               Returns:  array of raw objects on success
//                         null if source is temporarily unavailable (not an error)
//                         throw for hard errors
//   normalize(raw) {raw → record | null}
//               Maps one raw object to a canonical schema record.
//               Returns null to skip the item (invalid/incomplete data).

const SOURCES = [

  // ── RecruitMilitary / DAV ──────────────────────────────────────────────
  {
    id:           'recruitmilitary',
    name:         'RecruitMilitary / DAV',
    type:         'html_fetch',
    enabled:      false,   // flip true + implement fetch() when ready
    baseConf:     0.80,
    organizer_id: 'recruitmilitary',
    organizer:    'RecruitMilitary / DAV',
    source_type:  'official',

    // TODO: Parse https://recruitmilitary.com/career-fairs
    // The events table includes: event name, date, city, state, registration link.
    // No auth required. Recommend node-html-parser or cheerio once approved.
    // robots.txt at recruitmilitary.com allows crawling of /career-fairs.
    // Rate-limit: 1 request per run, cached for 7 days.
    async fetch() {
      // return null signals "source unavailable this run — preserve existing records"
      return null;
    },

    normalize(raw) {
      if (!raw || !raw.title || !raw.date_str) return null;
      const sd = parseDateStr(raw.date_str);
      if (!sd) return null;
      return {
        title:            raw.title.trim(),
        organizer:        this.organizer,
        organizer_id:     this.organizer_id,
        start_date:       sd,
        end_date:         sd,
        timezone:         inferTimezone(raw.state),
        city:             raw.city  || null,
        state:            raw.state || null,
        virtual:          false,
        veteran_focus:    true,
        clearance_focus:  false,
        industries:       ['defense', 'technology', 'logistics', 'general'],
        registration_url: raw.url   || 'https://recruitmilitary.com/career-fairs',
        source_url:       'https://recruitmilitary.com/career-fairs',
        source_type:      this.source_type,
        last_verified_at: TODAY_STR,
        confidence_score: this.baseConf,
        notes:            raw.notes || null
      };
    }
  },

  // ── Hiring Our Heroes ─────────────────────────────────────────────────
  {
    id:           'hiringourheroes',
    name:         'Hiring Our Heroes',
    type:         'html_fetch',
    enabled:      false,
    baseConf:     0.85,
    organizer_id: 'hiringourheroes',
    organizer:    'Hiring Our Heroes',
    source_type:  'nonprofit',

    // TODO: Parse https://www.hiringourheroes.org/hiring-events/
    // Page lists upcoming hiring events with date, installation/location,
    // virtual flag, and a registration link per event.
    async fetch() {
      return null;
    },

    normalize(raw) {
      if (!raw || !raw.title || !raw.date_str) return null;
      const sd = parseDateStr(raw.date_str);
      if (!sd) return null;
      const isVirtual = !!raw.virtual;
      return {
        title:            raw.title.trim(),
        organizer:        this.organizer,
        organizer_id:     this.organizer_id,
        start_date:       sd,
        end_date:         sd,
        timezone:         isVirtual ? 'ET' : inferTimezone(raw.state),
        city:             isVirtual ? null : (raw.city  || null),
        state:            isVirtual ? null : (raw.state || null),
        virtual:          isVirtual,
        veteran_focus:    true,
        clearance_focus:  false,
        industries:       ['general', 'technology', 'logistics', 'finance'],
        registration_url: raw.url  || 'https://www.hiringourheroes.org/hiring-events/',
        source_url:       'https://www.hiringourheroes.org/hiring-events/',
        source_type:      this.source_type,
        last_verified_at: TODAY_STR,
        confidence_score: this.baseConf,
        notes:            raw.notes || null
      };
    }
  },

  // ── ClearanceJobs ─────────────────────────────────────────────────────
  {
    id:           'clearancejobs',
    name:         'ClearanceJobs',
    type:         'html_fetch',
    enabled:      false,
    baseConf:     0.85,
    organizer_id: 'clearancejobs',
    organizer:    'ClearanceJobs',
    source_type:  'official',

    // TODO: Parse https://about.clearancejobs.com/candidates/career-events
    // Lists quarterly virtual and in-person cleared career events with
    // date, format, location, registration link.
    async fetch() {
      return null;
    },

    normalize(raw) {
      if (!raw || !raw.title || !raw.date_str) return null;
      const sd  = parseDateStr(raw.date_str);
      const ed  = raw.end_date_str ? parseDateStr(raw.end_date_str) : sd;
      if (!sd) return null;
      const isVirtual = !!raw.virtual;
      return {
        title:            raw.title.trim(),
        organizer:        this.organizer,
        organizer_id:     this.organizer_id,
        start_date:       sd,
        end_date:         ed || sd,
        timezone:         isVirtual ? 'ET' : inferTimezone(raw.state),
        city:             isVirtual ? null : (raw.city  || null),
        state:            isVirtual ? null : (raw.state || null),
        virtual:          isVirtual,
        veteran_focus:    true,
        clearance_focus:  true,
        industries:       ['defense', 'intelligence', 'cyber', 'IT'],
        registration_url: raw.url  || 'https://about.clearancejobs.com/candidates/career-events',
        source_url:       'https://about.clearancejobs.com/candidates/career-events',
        source_type:      this.source_type,
        last_verified_at: TODAY_STR,
        confidence_score: this.baseConf,
        notes:            raw.notes || null
      };
    }
  },

  // ── Hire Heroes USA ───────────────────────────────────────────────────
  {
    id:           'hireheroesusa',
    name:         'Hire Heroes USA',
    type:         'html_fetch',
    enabled:      false,
    baseConf:     0.85,
    organizer_id: 'hireheroesusa',
    organizer:    'Hire Heroes USA',
    source_type:  'nonprofit',

    // TODO: Parse https://www.hireheroesusa.org/
    // Events listed in news/events section. Primarily virtual recurring events.
    async fetch() {
      return null;
    },

    normalize(raw) {
      if (!raw || !raw.title || !raw.date_str) return null;
      const sd = parseDateStr(raw.date_str);
      if (!sd) return null;
      return {
        title:            raw.title.trim(),
        organizer:        this.organizer,
        organizer_id:     this.organizer_id,
        start_date:       sd,
        end_date:         sd,
        timezone:         'ET',
        city:             null,
        state:            null,
        virtual:          true,
        veteran_focus:    true,
        clearance_focus:  false,
        industries:       ['general', 'technology', 'healthcare', 'logistics'],
        registration_url: raw.url  || 'https://www.hireheroesusa.org/jobs/',
        source_url:       'https://www.hireheroesusa.org/',
        source_type:      this.source_type,
        last_verified_at: TODAY_STR,
        confidence_score: this.baseConf,
        notes:            raw.notes || null
      };
    }
  }

];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a flexible date string to YYYY-MM-DD.
 * Handles: "2026-04-15", "April 15, 2026", "Apr 15 2026", "04/15/2026"
 * Returns null on failure.
 */
function parseDateStr(str) {
  if (!str) return null;
  str = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Best-guess timezone abbreviation for a US state abbreviation.
 * Falls back to 'ET'.
 */
function inferTimezone(state) {
  if (!state) return 'ET';
  const PT = ['CA','OR','WA','NV','AK','HI'];
  const MT = ['MT','ID','WY','CO','UT','AZ','NM'];
  const CT = ['TX','OK','KS','NE','SD','ND','MN','IA','MO','WI','IL',
              'LA','AR','MS','AL'];
  if (PT.includes(state)) return 'PT';
  if (MT.includes(state)) return 'MT';
  if (CT.includes(state)) return 'CT';
  return 'ET';
}

/**
 * Build the deduplication key for an event.
 * Two events sharing a key are the same real-world occurrence.
 * Key: organizer_id + start_date + normalized location slug
 */
function dedupKey(r) {
  const loc = r.virtual
    ? 'virtual'
    : (r.city || r.state || 'unknown').toLowerCase().replace(/\s+/g, '_');
  return `${r.organizer_id || 'xx'}__${r.start_date || '0000-00-00'}__${loc}`;
}

/**
 * When two records share the same dedup key, return the preferred one:
 * higher confidence_score wins; ties broken by later last_verified_at.
 */
function preferRecord(a, b) {
  if (b.confidence_score > a.confidence_score) return b;
  if (a.confidence_score > b.confidence_score) return a;
  return (b.last_verified_at || '') >= (a.last_verified_at || '') ? b : a;
}

/**
 * Assign a stable deterministic ID to a record that lacks one.
 * Format: ce-<org4>-<YYYYMMDD>-<loc4>
 * Guarantees uniqueness within the current run via the usedIds Set.
 */
function assignId(r, usedIds) {
  const org  = (r.organizer_id || 'xx').slice(0, 4);
  const date = (r.start_date   || '00000000').replace(/-/g, '');
  const loc  = r.virtual
    ? 'virt'
    : (r.city || r.state || 'xx').slice(0, 4).toLowerCase().replace(/\s+/g, '');
  let base  = `ce-${org}-${date}-${loc}`;
  let id    = base;
  let n     = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);
  return id;
}

/**
 * Validate one record against the required schema.
 * Returns an array of error strings; empty array = valid.
 */
function validateRecord(r) {
  const errs = [];
  for (const f of REQUIRED_FIELDS) {
    if (r[f] === undefined) errs.push(`missing required field: "${f}"`);
  }
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (r.start_date && !isoRe.test(r.start_date))
    errs.push(`start_date not ISO YYYY-MM-DD: "${r.start_date}"`);
  if (r.end_date && !isoRe.test(r.end_date))
    errs.push(`end_date not ISO YYYY-MM-DD: "${r.end_date}"`);
  if (r.last_verified_at && !isoRe.test(r.last_verified_at))
    errs.push(`last_verified_at not ISO YYYY-MM-DD: "${r.last_verified_at}"`);
  if (typeof r.confidence_score !== 'number' ||
      r.confidence_score < 0 || r.confidence_score > 1)
    errs.push(`confidence_score out of [0,1]: ${r.confidence_score}`);
  if (!Array.isArray(r.industries))
    errs.push('industries must be an array');
  if (typeof r.virtual !== 'boolean')
    errs.push('virtual must be boolean');
  return errs;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function run() {
  const log  = (msg) => console.log(`[ce-refresh] ${msg}`);
  const warn = (msg) => console.warn(`[ce-refresh][WARN] ${msg}`);

  log(`Career Events Refresh — ${TODAY_STR}${DRY_RUN ? '  [DRY RUN]' : ''}`);
  log('─'.repeat(60));

  // ── Step 1: Load existing dataset ────────────────────────────────────────
  let existing = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      existing  = JSON.parse(raw);
      log(`Loaded ${existing.length} existing records from data/career-events.json`);
    } catch (e) {
      warn(`Could not parse existing data file: ${e.message} — starting fresh`);
    }
  } else {
    warn(`data/career-events.json not found — will create new file`);
  }

  // ── Step 2: Fetch from enabled sources ───────────────────────────────────
  const incoming = [];
  let sourcesRan = 0;

  for (const src of SOURCES) {
    if (!src.enabled) {
      log(`Source [${src.id}] disabled — skipping`);
      continue;
    }
    sourcesRan++;
    log(`Fetching from [${src.id}]...`);
    let rawItems;
    try {
      rawItems = await src.fetch();
    } catch (e) {
      warn(`Source [${src.id}] fetch() threw: ${e.message} — skipping source`);
      continue;
    }
    if (rawItems === null) {
      log(`Source [${src.id}] unavailable (returned null) — existing records preserved`);
      continue;
    }
    log(`Source [${src.id}] returned ${rawItems.length} raw records`);
    let normalized = 0;
    for (const item of rawItems) {
      const rec = src.normalize(item);
      if (!rec) {
        warn(`Source [${src.id}] normalize() skipped an item (null)`);
        continue;
      }
      incoming.push(rec);
      normalized++;
    }
    log(`Source [${src.id}] produced ${normalized} normalized records`);
  }

  if (sourcesRan === 0) {
    log('No enabled sources — running as expiration-only pass');
  }
  log(`Total incoming from sources: ${incoming.length}`);

  // ── Step 3: Merge existing + incoming ────────────────────────────────────
  const pool = [...existing, ...incoming];
  log(`Pool size before processing: ${pool.length}`);

  // ── Step 4: Expire past events ───────────────────────────────────────────
  const active = [];
  let expiredCount = 0;
  for (const r of pool) {
    const endDate = r.end_date || r.start_date;
    if (endDate && endDate < TODAY_STR) {
      log(`  Expired: [${r.id || '—'}] "${r.title}" (end: ${endDate})`);
      expiredCount++;
    } else {
      active.push(r);
    }
  }
  log(`Expired ${expiredCount} past events — ${active.length} remain`);

  // ── Step 5: Deduplicate ───────────────────────────────────────────────────
  const byKey   = new Map();   // dedupKey → record
  let dupCount  = 0;
  for (const r of active) {
    const key = dedupKey(r);
    if (byKey.has(key)) {
      const winner = preferRecord(byKey.get(key), r);
      if (winner !== byKey.get(key)) {
        log(`  Dedup: replaced record for key "${key}" with higher-confidence/newer entry`);
      }
      byKey.set(key, winner);
      dupCount++;
    } else {
      byKey.set(key, r);
    }
  }
  const deduped = Array.from(byKey.values());
  log(`Dedup removed ${dupCount} duplicate(s) — ${deduped.length} remain`);

  // ── Step 6: Assign IDs to any record missing one ─────────────────────────
  const usedIds = new Set(deduped.filter(r => r.id).map(r => r.id));
  for (const r of deduped) {
    if (!r.id) {
      r.id = assignId(r, usedIds);
      log(`  Assigned ID: ${r.id} → "${r.title}"`);
    }
  }

  // ── Step 7: Validate ─────────────────────────────────────────────────────
  let dropCount = 0;
  const validated = [];
  for (const r of deduped) {
    const errs = validateRecord(r);
    if (errs.length > 0) {
      warn(`Dropping invalid record [${r.id}] "${r.title}": ${errs.join('; ')}`);
      dropCount++;
    } else {
      validated.push(r);
    }
  }
  if (dropCount > 0) warn(`${dropCount} record(s) failed schema validation and were dropped`);

  // ── Step 8: Sort by start_date ascending ────────────────────────────────
  validated.sort((a, b) => a.start_date.localeCompare(b.start_date));

  // ── Step 9: Final duplicate-ID guard ─────────────────────────────────────
  const finalIds = validated.map(r => r.id);
  const dupIds   = finalIds.filter((id, i) => finalIds.indexOf(id) !== i);
  if (dupIds.length > 0) {
    warn(`Duplicate IDs in final output (should not occur): ${dupIds.join(', ')}`);
  }

  // ── Step 10: Write ───────────────────────────────────────────────────────
  const output = JSON.stringify(validated, null, 2);
  if (DRY_RUN) {
    log('DRY RUN — no file written');
    log(`Would write ${validated.length} records to data/career-events.json`);
    if (validated.length > 0) {
      log('First record preview:');
      console.log(JSON.stringify(validated[0], null, 2));
    }
  } else {
    fs.writeFileSync(DATA_FILE, output, 'utf8');
    log(`Wrote ${validated.length} records to data/career-events.json`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  log('─'.repeat(60));
  log('Run complete.');
  log(`  Existing records loaded : ${existing.length}`);
  log(`  Incoming from sources   : ${incoming.length}`);
  log(`  Expired and removed     : ${expiredCount}`);
  log(`  Duplicates removed      : ${dupCount}`);
  log(`  Schema validation drops : ${dropCount}`);
  log(`  Final record count      : ${validated.length}`);
  log('─'.repeat(60));

  return validated.length;
}

// ── Entry ────────────────────────────────────────────────────────────────────
run().catch(err => {
  console.error('[ce-refresh][FATAL]', err.message);
  process.exit(1);
});
