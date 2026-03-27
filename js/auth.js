/* ══════════════════════════════════════════════════════════
   AfterAction AI — Auth Module
   Supabase authentication + session management
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  const SUPABASE_URL = 'https://gdnnoehxezkrihrcqosr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdkbm5vZWh4ZXprcmlocmNxb3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5NjMsImV4cCI6MjA4OTUxOTk2M30.jHVUOd5ZijF_Y9PlVrYuWAmWEN3PUgXY6SfX8lJZqXg';

  // Initialize Supabase client
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── AUTH STATE ────────────────────────────────────────
  let currentUser = null;
  let currentProfile = null;

  // ── INIT ──────────────────────────────────────────────
  async function initAuth() {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
      await loadProfile();
      updateAuthUI();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        await loadProfile();
        updateAuthUI();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentProfile = null;
        updateAuthUI();
      }
    });

    // Set up modal event listeners
    setupAuthModal();
  }

  // ── PROFILE ───────────────────────────────────────────
  async function loadProfile() {
    if (!currentUser) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist yet — create it (fallback for trigger)
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({ id: currentUser.id, display_name: currentUser.user_metadata?.display_name || '' })
        .select()
        .single();
      currentProfile = newProfile;
    } else {
      currentProfile = data;
    }
    return currentProfile;
  }

  async function updateProfile(updates) {
    if (!currentUser) return null;
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', currentUser.id)
      .select()
      .single();
    if (!error) currentProfile = data;
    return { data, error };
  }

  // ── AUTH ACTIONS ──────────────────────────────────────
  async function signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName }
      }
    });
    return { data, error };
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      currentUser = null;
      currentProfile = null;
      updateAuthUI();
    }
    return { error };
  }

  async function resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://afteractionai.org/reset-password'
    });
    return { data, error };
  }

  // ── AUTH MODAL ────────────────────────────────────────
  function setupAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    // Close button
    const closeBtn = modal.querySelector('.auth-modal__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeAuthModal());
    }

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAuthModal();
    });

    // Tab switching
    const loginTab = modal.querySelector('[data-tab="login"]');
    const signupTab = modal.querySelector('[data-tab="signup"]');
    if (loginTab) loginTab.addEventListener('click', () => switchAuthTab('login'));
    if (signupTab) signupTab.addEventListener('click', () => switchAuthTab('signup'));

    // Form submissions
    const loginForm = modal.querySelector('#loginForm');
    const signupForm = modal.querySelector('#signupForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);

    // Forgot password
    const forgotLink = modal.querySelector('.auth-forgot');
    if (forgotLink) forgotLink.addEventListener('click', handleForgotPassword);
  }

  function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.style.display = 'flex';
      switchAuthTab(tab);
      document.body.style.overflow = 'hidden';
    }
  }

  function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      clearAuthErrors();
    }
  }

  function switchAuthTab(tab) {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    modal.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');

    const activeTab = modal.querySelector(`[data-tab="${tab}"]`);
    const activeForm = modal.querySelector(`#${tab}Form`);
    if (activeTab) activeTab.classList.add('active');
    if (activeForm) activeForm.style.display = 'block';
    clearAuthErrors();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.querySelector('[name="email"]').value;
    const password = form.querySelector('[name="password"]').value;
    const errorEl = form.querySelector('.auth-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    const { error } = await signIn(email, password);

    if (error) {
      if (errorEl) {
        errorEl.textContent = error.message === 'Invalid login credentials'
          ? 'Invalid email or password. Please try again.'
          : error.message;
        errorEl.style.display = 'block';
      }
    } else {
      closeAuthModal();
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }

  async function handleSignup(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.querySelector('[name="displayName"]').value;
    const email = form.querySelector('[name="email"]').value;
    const password = form.querySelector('[name="password"]').value;
    const errorEl = form.querySelector('.auth-error');
    const successEl = form.querySelector('.auth-success');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (password.length < 6) {
      if (errorEl) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.style.display = 'block';
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    const { data, error } = await signUp(email, password, name);

    if (error) {
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }
    } else {
      // Check if email confirmation is required
      if (data.user && !data.session) {
        if (successEl) {
          successEl.textContent = 'Account created! Check your email to confirm, then sign in.';
          successEl.style.display = 'block';
        }
        if (errorEl) errorEl.style.display = 'none';
      } else {
        closeAuthModal();
      }
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    const modal = document.getElementById('authModal');
    const emailInput = modal.querySelector('#loginForm [name="email"]');
    const email = emailInput ? emailInput.value : '';

    if (!email) {
      const errorEl = modal.querySelector('#loginForm .auth-error');
      if (errorEl) {
        errorEl.textContent = 'Enter your email above, then click "Forgot password."';
        errorEl.style.display = 'block';
      }
      return;
    }

    const { error } = await resetPassword(email);
    const successEl = modal.querySelector('#loginForm .auth-success');
    if (successEl) {
      successEl.textContent = 'Password reset email sent. Check your inbox.';
      successEl.style.display = 'block';
    }
  }

  function clearAuthErrors() {
    document.querySelectorAll('.auth-error, .auth-success').forEach(el => {
      el.style.display = 'none';
      el.textContent = '';
    });
  }

  // ── UI UPDATES ────────────────────────────────────────
  function updateAuthUI() {
    // Update all auth-dependent elements across the page
    const signInBtns = document.querySelectorAll('.auth-signin-btn');
    const profileBtns = document.querySelectorAll('.auth-profile-btn');
    const userNameEls = document.querySelectorAll('.auth-user-name');
    const authGated = document.querySelectorAll('[data-auth-required]');
    const signOutBtns = document.querySelectorAll('.auth-signout-btn');

    if (currentUser) {
      // Logged in
      signInBtns.forEach(btn => btn.style.display = 'none');
      profileBtns.forEach(btn => btn.style.display = '');
      signOutBtns.forEach(btn => btn.style.display = '');
      userNameEls.forEach(el => {
        el.textContent = currentProfile?.display_name || currentUser.email.split('@')[0];
      });
      authGated.forEach(el => el.style.display = '');
    } else {
      // Logged out
      signInBtns.forEach(btn => btn.style.display = '');
      profileBtns.forEach(btn => btn.style.display = 'none');
      signOutBtns.forEach(btn => btn.style.display = 'none');
      userNameEls.forEach(el => el.textContent = '');
      authGated.forEach(el => el.style.display = 'none');
    }

    // Fire custom event for other modules to react
    window.dispatchEvent(new CustomEvent('authStateChanged', {
      detail: { user: currentUser, profile: currentProfile }
    }));
  }

  // ── REPORT SAVING ─────────────────────────────────────
  async function saveReport(reportContent, conversationHistory) {
    if (!currentUser) return { data: null, error: 'Not logged in' };
    const { data, error } = await supabase
      .from('ai_reports')
      .insert({
        user_id: currentUser.id,
        report_content: reportContent,
        conversation_history: conversationHistory
      })
      .select()
      .single();
    return { data, error };
  }

  // ── CHECKLIST ─────────────────────────────────────────
  // Priority lookup: category label → integer (1=highest)
  var CHECKLIST_PRIORITY = { immediate: 1, short_term: 2, strategic: 3, optional: 4 };

  async function saveChecklist(reportId, items) {
    if (!currentUser) return { data: null, error: 'Not logged in' };
    const rows = items.map((item, i) => ({
      user_id: currentUser.id,
      report_id: reportId,
      category: item.category,
      title: item.title,
      description: item.description || '',
      sort_order: item.sort_order !== undefined ? item.sort_order : i,
      is_completed: false,
      // AIOS fields
      status:        'not_started',
      priority:      item.priority || CHECKLIST_PRIORITY[item.category] || 2,
      source:        item.source || 'ai_report',
      resource_link: item.resource_link || null,
      due_context:   item.due_context || null
    }));
    const { data, error } = await supabase
      .from('checklist_items')
      .insert(rows)
      .select();
    return { data, error };
  }

  async function loadChecklist() {
    if (!currentUser) return { data: null, error: 'Not logged in' };
    const { data, error } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('category')
      .order('sort_order');
    return { data, error };
  }

  async function toggleChecklistItem(itemId, completed) {
    if (!currentUser) return { error: 'Not logged in' };
    const { data, error } = await supabase
      .from('checklist_items')
      .update({
        is_completed: completed,
        status:        completed ? 'completed' : 'not_started',
        completed_at:  completed ? new Date().toISOString() : null
      })
      .eq('id', itemId)
      .eq('user_id', currentUser.id)
      .select()
      .single();
    return { data, error };
  }

  // ── TEMPLATE OUTPUTS ─────────────────────────────────
  async function saveTemplateOutput(output) {
    if (!currentUser) return { data: null, error: 'Not logged in' };
    const { data, error } = await supabase
      .from('template_outputs')
      .insert({
        user_id: currentUser.id,
        template_type: output.template_type,
        title: output.title || '',
        content: output.content,
        metadata: output.metadata || {}
      })
      .select()
      .single();
    return { data, error };
  }

  async function loadTemplateOutputs() {
    if (!currentUser) return { data: null, error: 'Not logged in' };
    const { data, error } = await supabase
      .from('template_outputs')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    return { data, error };
  }

  async function loadReports() {
    if (!currentUser) return { data: null, error: 'Not logged in' };
    const { data, error } = await supabase
      .from('ai_reports')
      .select('id, report_content, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(5);
    return { data, error };
  }

  // ── NEWSLETTER ────────────────────────────────────────
  async function subscribeNewsletter(email, source, segments) {
    const { data, error } = await supabase
      .from('newsletter_signups')
      .upsert({
        email,
        user_id: currentUser?.id || null,
        source: source || 'website',
        segments: segments || ['general'],
        consent: true
      }, { onConflict: 'email' })
      .select()
      .single();
    return { data, error };
  }

  // ── ISSUE TAGS (Smart Matching) ─────────────────────
  async function saveIssueTags(tags) {
    if (!currentUser) return { error: 'Not logged in' };
    // Merge with existing tags — don't overwrite
    var existing = (currentProfile && currentProfile.issue_tags) ? currentProfile.issue_tags : [];
    var merged = {};
    existing.forEach(function(t) { merged[t.issue] = t; });
    tags.forEach(function(t) {
      if (merged[t.issue]) {
        merged[t.issue].count = (merged[t.issue].count || 1) + 1;
        merged[t.issue].last_seen = new Date().toISOString();
      } else {
        merged[t.issue] = {
          issue: t.issue,
          category: t.category,
          count: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString()
        };
      }
    });
    var tagArray = Object.keys(merged).map(function(k) { return merged[k]; });
    return updateProfile({ issue_tags: tagArray });
  }

  function getIssueTags() {
    if (!currentProfile || !currentProfile.issue_tags) return [];
    return currentProfile.issue_tags;
  }

  // ── ACTIVITY LOGGING (analytics backbone) ────────────
  // Called by analytics.js via AAAI.auth.logActivity()
  // Writes to activity_logs table — fire-and-forget
  async function logActivity(payload) {
    if (!currentUser) return; // Only log authenticated users
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .insert({
          user_id: currentUser.id,
          action: payload.action || payload.eventType || 'event',
          event_type: payload.eventType || payload.action || 'event',
          page_slug: payload.pageSlug || null,
          category: payload.category || null,
          tags: payload.tags && payload.tags.length ? payload.tags : null,
          session_id: payload.sessionId || null,
          metadata: payload.metadata || {}
        });
      // DEBUG LOG — remove after confirming events are flowing
      if (error) {
        console.warn('[AAAI Auth] logActivity INSERT error:', error.code, error.message);
      } else {
        console.log('[AAAI Auth] logActivity INSERT OK:', payload.eventType || payload.action);
      }
    } catch(e) {
      console.warn('[AAAI Auth] logActivity exception:', e.message);
    }
  }

  // ── CONSENT MANAGEMENT ───────────────────────────────
  async function updateConsent(consentEmail, consentAnalytics) {
    if (!currentUser) return { error: 'Not logged in' };
    // Only include fields that were explicitly passed — avoids overwriting
    // an existing consent_analytics value when only consent_email is being set.
    var payload = {};
    if (consentEmail !== undefined && consentEmail !== null) payload.consent_email = consentEmail;
    if (consentAnalytics !== undefined && consentAnalytics !== null) payload.consent_analytics = consentAnalytics;
    if (Object.keys(payload).length === 0) return { data: currentProfile, skipped: true };
    return updateProfile(payload);
  }

  // ── SEGMENTATION PROFILE UPDATE ──────────────────────
  // Called by app.js after report generation.
  // Writes audience_type, primary_need, secondary_needs to the profile
  // only when they are currently NULL — never overwrites existing data.
  async function updateSegmentation(fields) {
    if (!currentUser) return { error: 'Not logged in' };

    // Build the update payload — only include fields that have a value
    // and are not already set on the current profile
    var payload = {};

    if (fields.audience_type && !currentProfile?.audience_type && !currentProfile?.audience) {
      payload.audience_type = fields.audience_type;
    }
    if (fields.primary_need && !currentProfile?.primary_need) {
      payload.primary_need = fields.primary_need;
    }
    if (fields.secondary_needs && fields.secondary_needs.length > 0 && !currentProfile?.secondary_needs) {
      payload.secondary_needs = fields.secondary_needs;
    }
    if (fields.veteran_status && !currentProfile?.veteran_status) {
      payload.veteran_status = fields.veteran_status;
    }
    if (fields.state && !currentProfile?.state) {
      payload.state = fields.state;
    }

    // Nothing new to write — profile already populated
    if (Object.keys(payload).length === 0) {
      console.log('[AAAI Auth] updateSegmentation: all fields already set, skipping');
      return { data: currentProfile, skipped: true };
    }

    // DEBUG LOG — remove after confirming segmentation is flowing
    console.log('[AAAI Auth] PROFILE UPDATE:', payload);

    return updateProfile(payload);
  }

  // ── AIOS STATUS UPDATE ───────────────────────────────
  // Richer status transitions: not_started → in_progress → completed / skipped
  async function updateChecklistItemStatus(itemId, status) {
    if (!currentUser) return { error: 'Not logged in' };
    var valid = ['not_started', 'in_progress', 'completed', 'skipped'];
    if (valid.indexOf(status) === -1) return { error: 'Invalid status: ' + status };
    var updates = {
      status:       status,
      is_completed: status === 'completed',
      completed_at: status === 'completed' ? new Date().toISOString() : null
    };
    const { data, error } = await supabase
      .from('checklist_items')
      .update(updates)
      .eq('id', itemId)
      .eq('user_id', currentUser.id)
      .select()
      .single();
    return { data, error };
  }

  // ── ACTIVE CHECKLIST (for returning user / next-step) ─
  // Returns only tasks that are not_started or in_progress, ordered by priority.
  async function loadActiveChecklist() {
    if (!currentUser) return { data: null, error: 'Not logged in' };
    const { data, error } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('user_id', currentUser.id)
      .not('status', 'in', '("completed","skipped")')
      .order('priority', { ascending: true })
      .order('sort_order', { ascending: true });
    return { data, error };
  }

  // ── AUTO-CHECKLIST FROM ACTION ENGINE ──────────────
  async function saveAutoChecklist(reportId, actionChecklist) {
    if (!currentUser || !actionChecklist || actionChecklist.length === 0) return { data: null };
    // Load existing to avoid duplicates
    var existResult = await loadChecklist();
    var existingTitles = {};
    if (existResult.data) {
      existResult.data.forEach(function(item) { existingTitles[item.title] = true; });
    }
    var newItems = actionChecklist.filter(function(item) { return !existingTitles[item.title]; });
    if (newItems.length === 0) return { data: [], message: 'All items already exist' };
    return saveChecklist(reportId, newItems);
  }

  // ── PUBLIC API ────────────────────────────────────────
  window.AAAI = window.AAAI || {};
  window.AAAI.auth = {
    init: initAuth,
    signUp,
    signIn,
    signOut,
    resetPassword,
    openAuthModal,
    closeAuthModal,
    getUser: () => currentUser,
    getProfile: () => currentProfile,
    isLoggedIn: () => !!currentUser,
    updateProfile,
    loadProfile,
    saveReport,
    saveChecklist,
    loadChecklist,
    toggleChecklistItem,
    saveTemplateOutput,
    loadTemplateOutputs,
    loadReports,
    subscribeNewsletter,
    saveIssueTags,
    getIssueTags,
    saveAutoChecklist,
    updateChecklistItemStatus,
    loadActiveChecklist,
    logActivity,
    updateConsent,
    updateSegmentation
    // C-02 FIX: supabase client intentionally NOT exposed on public API
    // Exposing it allowed any user to run authenticated queries via DevTools
    // All database operations must go through the methods above
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

})();
