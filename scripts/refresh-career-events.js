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
 * Fetch strategy:
 *   1. Try schema.org JSON-LD structured data (most stable — SEO-injected server-side)
 *   2. Fallback to lightweight regex against stable HTML patterns
 *   3. Return null on any error — pipeline preserves existing records
 *   No external npm dependencies — uses only Node.js built-in https/http modules.
 *
 * Exit codes:
 *   0 = success (or dry-run complete)
 *   1 = fatal error
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'career-events.json');

// ── Config ──────────────────────────────────────────────────────────────────
const DRY_RUN  = process.argv.includes('--dry-run');
const SAFE_MIN = 5;          // minimum events required to allow a write
const TIMEOUT  = 12000;      // ms per HTTP request

const NOW = new Date();
NOW.setHours(0, 0, 0, 0);
const TODAY_STR = NOW.toISOString().slice(0, 10);   // YYYY-MM-DD

// ── Required schema fields ───────────────────────────────────────────────────
const REQUIRED_FIELDS = [
  'id', 'title', 'organizer', 'organizer_id',
  'start_date', 'end_date', 'timezone',
  'virtual', 'veteran_focus', 'clearance_focus', 'industries',
  'registration_url', 'source_url', 'source_type',
  'last_verified_at', 'confidence_score'
];

// ── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Simple HTTPS GET with redirect-following and timeout.
 * Returns the full response body as a UTF-8 string.
 * Throws on non-200 status (after redirects) or network error.
 */
function httpsGet(url, redirects = 0) {
  if (redirects > 5) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent':      'AfterActionAI-EventBot/1.0 (+https://afteractionai.org)',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control':   'no-cache'
      }
    }, (res) => {
      // Follow redirects (301/302/303/307/308)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        res.resume();   // drain to free socket
        return httpsGet(next, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data',  c  => chunks.push(c));
      res.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error(`Timeout (${TIMEOUT}ms)`)); });
    req.on('error', reject);
  });
}

// ── HTML parsing helpers ─────────────────────────────────────────────────────

/**
 * Extract all schema.org Event (or subtype) objects from JSON-LD blocks.
 * Returns an array of plain objects; empty if none found.
 */
function extractJsonLd(html) {
  const results = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      for (const node of nodes) {
        const t = node['@type'] || '';
        if (/Event|JobFair|SocialEvent/i.test(t)) {
          results.push(node);
        }
      }
    } catch (_) { /* malformed JSON-LD — skip */ }
  }
  return results;
}

/**
 * Convert a schema.org Event JSON-LD node to the raw shape our
 * normalize() functions expect:
 *   { title, date_str, end_date_str, city, state, virtual, url, notes }
 */
function jsonLdToRaw(node) {
  const title = stripHtml(node.name || '').trim();
  if (!title) return null;

  // Dates — schema.org allows ISO datetime or date strings
  const date_str     = isoToDate(node.startDate);
  const end_date_str = isoToDate(node.endDate)   || date_str;
  if (!date_str) return null;

  // Location
  const loc      = node.location || {};
  const locType  = (loc['@type'] || '').toLowerCase();
  const isVirt   = locType === 'virtuallocation' || locType === 'onlineeventattendancemode';
  const addr     = loc.address || {};
  const city     = isVirt ? null : (addr.addressLocality || loc.name || null);
  const stateRaw = isVirt ? null : (addr.addressRegion   || null);
  // schema.org may give full state name; normalise to 2-letter abbrev if needed
  const state    = stateRaw ? stateRaw.slice(0, 2).toUpperCase() : null;

  const url = node.url || node['@id'] || null;

  return { title, date_str, end_date_str, city, state, virtual: isVirt, url, notes: null };
}

/** Strip all HTML tags from a string */
function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
                  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
}

/** Normalise an ISO date-or-datetime string to YYYY-MM-DD.  Returns null if unparseable. */
function isoToDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ── Source registry ──────────────────────────────────────────────────────────

const SOURCES = [

  // ── RecruitMilitary / DAV ──────────────────────────────────────────────
  {
    id:           'recruitmilitary',
    name:         'RecruitMilitary / DAV',
    type:         'html_fetch',
    enabled:      true,
    baseConf:     0.80,
    organizer_id: 'recruitmilitary',
    organizer:    'RecruitMilitary / DAV',
    source_type:  'official',

    async fetch() {
      try {
        const url  = 'https://recruitmilitary.com/career-fairs';
        const html = await httpsGet(url);

        // Strategy 1 — JSON-LD structured data
        const ld = extractJsonLd(html);
        if (ld.length > 0) {
          return ld.map(jsonLdToRaw).filter(Boolean);
        }

        // Strategy 2 — Lightweight regex targeting stable list patterns.
        // RecruitMilitary career-fairs page renders event rows with:
        //   <a href="/career-fairs/slug">Title — City, ST</a>  plus a date element.
        // We look for href + title + date proximity in the same block.
        const items = [];
        // Match anchor + nearby date text (covers JS-injected and SSR variants)
        const blockRe = /href="(\/career-fairs\/[^"]+)"[^>]*>([\s\S]{1,300}?)<\/a>[\s\S]{0,400}?(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b)/gi;
        let m;
        while ((m = blockRe.exec(html)) !== null) {
          const [, href, rawTitle, rawDate] = m;
          const title = stripHtml(rawTitle);
          if (!title || title.length > 120) continue;
          // Extract city/state from title pattern "Event Name — City, ST"
          const locM = title.match(/[–—\-]\s*(.+),\s*([A-Z]{2})\s*$/);
          items.push({
            title,
            date_str:     rawDate.trim(),
            end_date_str: null,
            city:         locM ? locM[1].trim() : null,
            state:        locM ? locM[2]        : null,
            virtual:      false,
            url:          'https://recruitmilitary.com' + href,
            notes:        null
          });
        }
        return items.length > 0 ? items : null;
      } catch (_) {
        return null;   // fail silently — pipeline keeps existing records
      }
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
        end_date:         parseDateStr(raw.end_date_str) || sd,
        timezone:         inferTimezone(raw.state),
        city:             raw.city  || null,
        state:            raw.state || null,
        virtual:          !!raw.virtual,
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
    enabled:      true,
    baseConf:     0.85,
    organizer_id: 'hiringourheroes',
    organizer:    'Hiring Our Heroes',
    source_type:  'nonprofit',

    async fetch() {
      try {
        const url  = 'https://www.hiringourheroes.org/hiring-events/';
        const html = await httpsGet(url);

        // Strategy 1 — JSON-LD
        const ld = extractJsonLd(html);
        if (ld.length > 0) {
          return ld.map(jsonLdToRaw).filter(Boolean);
        }

        // Strategy 2 — HOH event cards typically render:
        //   <div class="tribe-events-calendar-list__event-...">
        //   with a <time datetime="2026-04-XX"> element and an <h2> or <h3> for title.
        const items = [];
        // Match <time datetime="YYYY-MM-DD"> near a title heading
        const blockRe = /<time[^>]+datetime="(\d{4}-\d{2}-\d{2})[^"]*"[\s\S]{0,800}?<(?:h2|h3|a)[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]{1,200}?)<\/(?:h2|h3|a)>/gi;
        let m;
        while ((m = blockRe.exec(html)) !== null) {
          const [, dateStr, rawTitle] = m;
          const title = stripHtml(rawTitle);
          if (!title || title.length > 150) continue;
          const isVirt = /virtual|online/i.test(title);
          const locM   = title.match(/[–—\-]\s*([A-Za-z\s]+),\s*([A-Z]{2})\b/);
          items.push({
            title,
            date_str:     dateStr,
            end_date_str: null,
            city:         (!isVirt && locM) ? locM[1].trim() : null,
            state:        (!isVirt && locM) ? locM[2]        : null,
            virtual:      isVirt,
            url:          url,
            notes:        null
          });
        }

        // Alternate pattern — simpler anchor+date blocks
        if (items.length === 0) {
          const altRe = /href="(https:\/\/www\.hiringourheroes\.org\/hiring-events\/[^"]+)"[^>]*>([\s\S]{1,200}?)<\/a>[\s\S]{0,400}?(\b20\d{2}\b)/gi;
          while ((m = altRe.exec(html)) !== null) {
            const [, href, rawTitle, year] = m;
            const title = stripHtml(rawTitle);
            if (!title || title.length > 150) continue;
            const nearDate = html.slice(m.index, m.index + 600).match(
              /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/i
            );
            if (!nearDate) continue;
            const isVirt = /virtual|online/i.test(title);
            items.push({
              title,
              date_str:     nearDate[0],
              end_date_str: null,
              city:         null,
              state:        null,
              virtual:      isVirt,
              url:          href,
              notes:        null
            });
          }
        }

        return items.length > 0 ? items : null;
      } catch (_) {
        return null;
      }
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
        end_date:         parseDateStr(raw.end_date_str) || sd,
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
    enabled:      true,
    baseConf:     0.85,
    organizer_id: 'clearancejobs',
    organizer:    'ClearanceJobs',
    source_type:  'official',

    async fetch() {
      try {
        const url  = 'https://about.clearancejobs.com/candidates/career-events';
        const html = await httpsGet(url);

        // Strategy 1 — JSON-LD
        const ld = extractJsonLd(html);
        if (ld.length > 0) {
          return ld.map(jsonLdToRaw).filter(Boolean);
        }

        // Strategy 2 — ClearanceJobs career-events page typically renders
        // events in section/article blocks with date, title, and location.
        // Look for heading + date + optional virtual indicator near each other.
        const items = [];
        const blockRe = /<(?:h2|h3|h4)[^>]*>([\s\S]{1,200}?)<\/(?:h2|h3|h4)>[\s\S]{0,600}?(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s+20\d{2}\b)/gi;
        let m;
        while ((m = blockRe.exec(html)) !== null) {
          const [, rawTitle, rawDate] = m;
          const title = stripHtml(rawTitle);
          if (!title || title.length > 150) continue;
          if (/cookie|privacy|terms|menu|nav/i.test(title)) continue;
          const isVirt = /virtual|online|remote/i.test(title + rawDate);
          const locM   = title.match(/[–—\-]\s*([A-Za-z\s]+),\s*([A-Z]{2})\b/);
          // Handle date ranges: "April 10-11, 2026" → start=10, end=11
          const rangeM = rawDate.match(/(\w+ \d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})/);
          let date_str, end_date_str;
          if (rangeM) {
            date_str     = `${rangeM[1]}, ${rangeM[3]}`;
            end_date_str = `${rangeM[1].replace(/\d+$/, '')}${rangeM[2]}, ${rangeM[3]}`;
          } else {
            date_str     = rawDate;
            end_date_str = null;
          }
          // Try to find registration link near this block
          const block    = html.slice(Math.max(0, m.index - 200), m.index + 600);
          const linkM    = block.match(/href="(https?:\/\/[^"]*clearancejobs[^"]*)"/) ||
                           block.match(/href="(https?:\/\/[^"]{10,100})"/);
          items.push({
            title,
            date_str,
            end_date_str,
            city:    (!isVirt && locM) ? locM[1].trim() : null,
            state:   (!isVirt && locM) ? locM[2]        : null,
            virtual: isVirt,
            url:     linkM ? linkM[1] : url,
            notes:   null
          });
        }
        return items.length > 0 ? items : null;
      } catch (_) {
        return null;
      }
    },

    normalize(raw) {
      if (!raw || !raw.title || !raw.date_str) return null;
      const sd  = parseDateStr(raw.date_str);
      const ed  = parseDateStr(raw.end_date_str) || sd;
      if (!sd) return null;
      const isVirtual = !!raw.virtual;
      return {
        title:            raw.title.trim(),
        organizer:        this.organizer,
        organizer_id:     this.organizer_id,
        start_date:       sd,
        end_date:         ed,
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
    enabled:      true,
    baseConf:     0.85,
    organizer_id: 'hireheroesusa',
    organizer:    'Hire Heroes USA',
    source_type:  'nonprofit',

    async fetch() {
      try {
        const url  = 'https://www.hireheroesusa.org/events/';
        const html = await httpsGet(url);

        // Strategy 1 — JSON-LD
        const ld = extractJsonLd(html);
        if (ld.length > 0) {
          return ld.map(jsonLdToRaw).filter(Boolean);
        }

        // Strategy 2 — The Hire Heroes USA site uses The Events Calendar plugin
        // (WordPress), which renders <time datetime="YYYY-MM-DD"> near event titles.
        const items = [];
        const blockRe = /<time[^>]+datetime="(\d{4}-\d{2}-\d{2})[^"]*"[\s\S]{0,600}?<(?:h2|h3)[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]{1,200}?)<\/a>/gi;
        let m;
        while ((m = blockRe.exec(html)) !== null) {
          const [, dateStr, href, rawTitle] = m;
          const title = stripHtml(rawTitle);
          if (!title || title.length > 150) continue;
          items.push({
            title,
            date_str:     dateStr,
            end_date_str: null,
            city:         null,
            state:        null,
            virtual:      true,   // HHUSA events are primarily virtual
            url:          href.startsWith('http') ? href : 'https://www.hireheroesusa.org' + href,
            notes:        null
          });
        }

        // Alternate: reverse order (title before time tag)
        if (items.length === 0) {
          const altRe = /<a[^>]+href="(https:\/\/www\.hireheroesusa\.org\/[^"]+)"[^>]*>([\s\S]{1,200}?)<\/a>[\s\S]{0,500}?<time[^>]+datetime="(\d{4}-\d{2}-\d{2})/gi;
          while ((m = altRe.exec(html)) !== null) {
            const [, href, rawTitle, dateStr] = m;
            const title = stripHtml(rawTitle);
            if (!title || title.length > 150) continue;
            items.push({
              title,
              date_str:     dateStr,
              end_date_str: null,
              city:         null,
              state:        null,
              virtual:      true,
              url:          href,
              notes:        null
            });
          }
        }

        return items.length > 0 ? items : null;
      } catch (_) {
        return null;
      }
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
        end_date:         parseDateStr(raw.end_date_str) || sd,
        timezone:         'ET',
        city:             null,
        state:            null,
        virtual:          true,
        veteran_focus:    true,
        clearance_focus:  false,
        industries:       ['general', 'technology', 'healthcare', 'logistics'],
        registration_url: raw.url  || 'https://www.hireheroesusa.org/events/',
        source_url:       'https://www.hireheroesusa.org/events/',
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
  const PT = ['CA', 'OR', 'WA', 'NV', 'AK', 'HI'];
  const MT = ['MT', 'ID', 'WY', 'CO', 'UT', 'AZ', 'NM'];
  const CT = ['TX', 'OK', 'KS', 'NE', 'SD', 'ND', 'MN', 'IA', 'MO', 'WI', 'IL',
              'LA', 'AR', 'MS', 'AL'];
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
  let base = `ce-${org}-${date}-${loc}`;
  let id   = base;
  let n    = 2;
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
    warn('data/career-events.json not found — will create new file');
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
    log(`Fetching from [${src.id}] — ${src.name} ...`);
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
  const byKey  = new Map();
  let dupCount = 0;
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

  // ── Step 10: Safety check — never overwrite with dangerously small set ───
  if (validated.length < SAFE_MIN && existing.length >= SAFE_MIN) {
    warn(`SAFETY ABORT: Would write only ${validated.length} records (minimum is ${SAFE_MIN}).`);
    warn('Existing dataset preserved. Check source adapters or seed data.');
    log('─'.repeat(60));
    log('Run complete (SAFETY ABORT — no file written).');
    log(`  Existing records loaded : ${existing.length}`);
    log(`  Incoming from sources   : ${incoming.length}`);
    log(`  Expired and removed     : ${expiredCount}`);
    log(`  Final candidate count   : ${validated.length}`);
    log(`  Required minimum        : ${SAFE_MIN}`);
    log('─'.repeat(60));
    return existing.length;
  }

  // ── Step 11: Write ───────────────────────────────────────────────────────
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
