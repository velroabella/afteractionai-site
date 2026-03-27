/* ══════════════════════════════════════════════════════════
   AfterAction AI — Analytics Module v1
   Modular, privacy-conscious event tracking
   Writes to activity_logs via AAAI.auth.logActivity()
   Works for logged-in users only — anonymous users not tracked
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── CONSTANTS ─────────────────────────────────────────────────────────────

  // Page slug derived from URL — normalized to remove .html extension
  var PAGE_SLUG = (function() {
    var path = window.location.pathname.replace(/\.html$/, '').replace(/^\//, '') || 'home';
    return path.split('/').pop() || 'home';
  })();

  // Category tag map — maps page slugs to category + tags
  var PAGE_CATEGORY_MAP = {
    'index':             { category: 'home',        tags: ['home'] },
    'home':              { category: 'home',        tags: ['home'] },
    'about':             { category: 'about',       tags: ['about'] },
    'board':             { category: 'about',       tags: ['about', 'board'] },
    'blog':              { category: 'content',     tags: ['blog'] },
    'gallery':           { category: 'content',     tags: ['gallery'] },
    'contact':           { category: 'engagement',  tags: ['contact'] },
    'resources':         { category: 'resources',   tags: ['resources', 'partner_orgs'] },
    'medical-help':      { category: 'health',      tags: ['medical', 'mental_health', 'health'] },
    'families-support':  { category: 'family',      tags: ['family_support', 'spouse', 'survivor', 'caregiver'] },
    'hotlines-escalation': { category: 'crisis',   tags: ['crisis', 'mental_health', 'hotlines'] },
    'education':         { category: 'education',   tags: ['education', 'gi_bill', 'transition'] },
    'licensure':         { category: 'employment',  tags: ['licensure', 'employment', 'certification', 'transition'] },
    'grants-scholarships': { category: 'financial', tags: ['grants', 'scholarships', 'financial'] },
    'state-benefits':    { category: 'benefits',    tags: ['benefits', 'state_benefits'] },
    'document-templates': { category: 'legal',     tags: ['legal', 'documents', 'templates'] },
    'elected-officials': { category: 'advocacy',    tags: ['advocacy', 'officials'] },
    'profile':           { category: 'account',     tags: ['account', 'dashboard'] },
    'privacy':           { category: 'legal',       tags: ['legal', 'privacy'] },
    'terms':             { category: 'legal',       tags: ['legal', 'terms'] },
    'disclaimer':        { category: 'legal',       tags: ['legal', 'disclaimer'] }
  };

  // Canonical segment tags — all events should use these
  var SEGMENT_TAGS = {
    MENTAL_HEALTH:    'mental_health',
    FAMILY_SUPPORT:   'family_support',
    BENEFITS:         'benefits',
    TRANSITION:       'transition',
    GRANTS:           'grants',
    EMPLOYMENT:       'employment',
    CAREGIVER:        'caregiver',
    SPOUSE:           'spouse',
    SURVIVOR:         'survivor',
    EDUCATION:        'education',
    LEGAL:            'legal',
    FINANCIAL:        'financial',
    HOUSING:          'housing',
    CRISIS:           'crisis',
    MEDICAL:          'medical',
    BUSINESS:         'business'
  };

  // Session ID — persists for this browser session (not stored in DB except on events)
  var SESSION_ID = (function() {
    try {
      var existing = sessionStorage.getItem('aaai_sid');
      if (existing) return existing;
      var sid = 'sid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      sessionStorage.setItem('aaai_sid', sid);
      return sid;
    } catch(e) {
      return 'sid_' + Date.now();
    }
  })();

  // ── CORE TRACK FUNCTION ───────────────────────────────────────────────────

  /**
   * Track an event. Fire-and-forget — never blocks UI.
   * @param {string} eventType   - e.g. 'page_view', 'resource_click', 'filter_used'
   * @param {object} [data]      - { category, tags, metadata, pageSlug }
   */
  function track(eventType, data) {
    // Only track if auth module is available and user is logged in
    if (!window.AAAI || !window.AAAI.auth || !window.AAAI.auth.isLoggedIn()) {
      console.log('[AAAI Analytics] SKIPPED (not logged in):', eventType);
      return;
    }
    if (!window.AAAI.auth.logActivity) {
      console.log('[AAAI Analytics] SKIPPED (logActivity missing):', eventType);
      return;
    }

    var pageContext = PAGE_CATEGORY_MAP[PAGE_SLUG] || { category: PAGE_SLUG, tags: [] };

    var payload = {
      action: eventType,
      eventType: eventType,
      pageSlug: data && data.pageSlug ? data.pageSlug : PAGE_SLUG,
      category: data && data.category ? data.category : pageContext.category,
      tags: data && data.tags
        ? (pageContext.tags || []).concat(data.tags)
        : (pageContext.tags || []),
      metadata: data && data.metadata ? data.metadata : {},
      sessionId: SESSION_ID
    };

    // Deduplicate tags
    payload.tags = payload.tags.filter(function(t, i, arr) { return arr.indexOf(t) === i; });

    // DEBUG LOG — remove after confirming events are flowing
    console.log('[AAAI Analytics] LOGGING EVENT:', eventType, '| page:', PAGE_SLUG, '| category:', payload.category, '| tags:', payload.tags);

    // Fire async — never await
    try {
      window.AAAI.auth.logActivity(payload);
    } catch(e) {
      console.warn('[AAAI Analytics] logActivity error:', e);
    }
  }

  // ── AUTO PAGE VIEW ────────────────────────────────────────────────────────

  function trackPageView() {
    track('page_view', {
      metadata: {
        referrer: document.referrer || null,
        title: document.title
      }
    });
  }

  // ── RESOURCE CLICK TRACKING ───────────────────────────────────────────────
  // Uses event delegation — no per-element listeners needed

  function initResourceClickTracking() {
    document.addEventListener('click', function(e) {
      var target = e.target;

      // Walk up to 4 levels to find a trackable element
      for (var i = 0; i < 4; i++) {
        if (!target || target === document.body) break;

        // data-track-click attribute explicitly marks trackable elements
        var trackAttr = target.getAttribute('data-track-click');
        if (trackAttr) {
          track('resource_click', {
            metadata: {
              label: target.textContent.trim().substring(0, 80),
              href: target.href || null,
              trackId: trackAttr
            }
          });
          break;
        }

        // Auto-track external links on resource pages
        if (target.tagName === 'A' && target.href &&
            target.hostname !== window.location.hostname &&
            isResourcePage()) {
          var pageContext = PAGE_CATEGORY_MAP[PAGE_SLUG] || {};
          track('resource_click', {
            category: pageContext.category,
            tags: pageContext.tags,
            metadata: {
              label: target.textContent.trim().substring(0, 80),
              href: target.href,
              host: target.hostname
            }
          });
          break;
        }

        target = target.parentElement;
      }
    }, true); // capture phase
  }

  function isResourcePage() {
    var resourcePages = ['resources', 'medical-help', 'families-support', 'hotlines-escalation',
      'education', 'licensure', 'grants-scholarships', 'state-benefits',
      'document-templates', 'elected-officials'];
    return resourcePages.indexOf(PAGE_SLUG) !== -1;
  }

  // ── FILTER TRACKING ───────────────────────────────────────────────────────
  // Hooks into ResourceHub's onFilter callback and filter button clicks

  function initFilterTracking() {
    // Hook filter button clicks via delegation
    document.addEventListener('click', function(e) {
      var target = e.target;
      // ResourceHub filter buttons have data-filter attribute
      if (target && target.getAttribute('data-filter')) {
        var filterValue = target.getAttribute('data-filter');
        if (filterValue !== 'all') {
          track('filter_used', {
            metadata: {
              filter_type: 'category',
              filter_value: filterValue
            }
          });
        }
      }
    });

    // Hook state selector changes
    document.addEventListener('change', function(e) {
      var target = e.target;
      if (target && (target.id === 'stateFilter' || target.getAttribute('data-state-filter'))) {
        if (target.value) {
          track('filter_used', {
            metadata: {
              filter_type: 'state',
              filter_value: target.value
            }
          });
        }
      }
    });
  }

  // ── CAPTURE POINT TRACKING ────────────────────────────────────────────────

  // Track "Save My Plan" / "Continue Later" / "Email My Report" button clicks
  function initCapturePointTracking() {
    document.addEventListener('click', function(e) {
      var target = e.target;
      if (!target) return;

      var text = target.textContent.trim().toLowerCase();
      var id = (target.id || '').toLowerCase();
      var cls = (target.className || '').toLowerCase();

      // Save plan / continue later
      if (id.includes('save') || cls.includes('save-plan') ||
          text.includes('save my plan') || text.includes('save plan') ||
          text.includes('continue later')) {
        track('save_progress', {
          metadata: { button_text: target.textContent.trim().substring(0, 60) }
        });
      }

      // Email report
      if (text.includes('email my report') || text.includes('email report') ||
          id.includes('email-report')) {
        track('email_capture', {
          metadata: { source: 'email_report_button' }
        });
      }

      // Download document
      if (text.includes('download') && (text.includes('doc') || text.includes('word') || text.includes('pdf'))) {
        track('document_saved', {
          metadata: { button_text: target.textContent.trim().substring(0, 60) }
        });
      }
    });
  }

  // ── CHAT AUDIT TRACKING ───────────────────────────────────────────────────
  // Listens for custom events fired by app.js at key conversation moments

  function initChatTracking() {
    // audit_started — fired when first user message is sent
    window.addEventListener('aaai:audit_started', function() {
      track('audit_started', { category: 'chat', tags: ['chat', 'ai_navigator'] });
    });

    // audit_completed — fired when report is generated
    window.addEventListener('aaai:audit_completed', function(e) {
      var detail = e.detail || {};
      track('audit_completed', {
        category: 'chat',
        tags: ['chat', 'ai_navigator', 'report'].concat(detail.tags || []),
        metadata: { report_id: detail.reportId || null }
      });
    });

    // report_generated — fired when plan is saved to Supabase
    window.addEventListener('aaai:report_generated', function(e) {
      var detail = e.detail || {};
      track('report_generated', {
        category: detail.category || 'chat',
        tags: ['report'].concat(detail.tags || []),
        metadata: { report_id: detail.reportId || null }
      });
    });

    // email_capture — fired when newsletter subscribed from chat
    window.addEventListener('aaai:email_capture', function(e) {
      var detail = e.detail || {};
      track('email_capture', {
        category: 'chat',
        metadata: { source: detail.source || 'chat_flow' }
      });
    });

    // ── AIOS CHECKLIST EVENTS ──────────────────────────
    // checklist_viewed — user opens the checklist dashboard
    window.addEventListener('aaai:checklist_viewed', function(e) {
      var detail = e.detail || {};
      track('checklist_viewed', {
        category: 'checklist',
        tags: ['checklist', 'dashboard'],
        metadata: { total: detail.total || 0, active: detail.active || 0, completed: detail.completed || 0 }
      });
    });

    // checklist_item_started — user moves a task to in_progress
    window.addEventListener('aaai:checklist_item_started', function(e) {
      var detail = e.detail || {};
      track('checklist_item_started', {
        category: 'checklist',
        tags: ['checklist', detail.itemCategory || 'task'],
        metadata: { item_id: detail.itemId || null, title: detail.title || null, category: detail.itemCategory || null }
      });
    });

    // checklist_item_completed — user marks a task done
    window.addEventListener('aaai:checklist_item_completed', function(e) {
      var detail = e.detail || {};
      track('checklist_item_completed', {
        category: 'checklist',
        tags: ['checklist', detail.itemCategory || 'task'],
        metadata: { item_id: detail.itemId || null, title: detail.title || null, category: detail.itemCategory || null }
      });
    });

    // checklist_item_skipped — user skips a task
    window.addEventListener('aaai:checklist_item_skipped', function(e) {
      var detail = e.detail || {};
      track('checklist_item_skipped', {
        category: 'checklist',
        tags: ['checklist', detail.itemCategory || 'task'],
        metadata: { item_id: detail.itemId || null, title: detail.title || null }
      });
    });

    // next_step_clicked — user taps the primary next-step CTA
    window.addEventListener('aaai:next_step_clicked', function(e) {
      var detail = e.detail || {};
      track('next_step_clicked', {
        category: 'checklist',
        tags: ['checklist', 'next_step'],
        metadata: { item_id: detail.itemId || null, title: detail.title || null }
      });
    });
  }

  // ── INITIALIZE ────────────────────────────────────────────────────────────

  function init() {
    // Defer until auth is ready
    function start() {
      trackPageView();
      initResourceClickTracking();
      initFilterTracking();
      initCapturePointTracking();
      initChatTracking();
    }

    // If auth is already initialized, fire immediately
    if (window.AAAI && window.AAAI.auth && window.AAAI.auth.isLoggedIn !== undefined) {
      // Wait one tick for auth state to settle after page load
      setTimeout(start, 500);
    } else {
      // Wait for authStateChanged event
      window.addEventListener('authStateChanged', function onAuth() {
        window.removeEventListener('authStateChanged', onAuth);
        setTimeout(start, 100);
      });
    }
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  window.AAAI = window.AAAI || {};
  window.AAAI.analytics = {
    track: track,
    pageSlug: PAGE_SLUG,
    sessionId: SESSION_ID,
    tags: SEGMENT_TAGS
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
