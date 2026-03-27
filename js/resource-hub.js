/* ══════════════════════════════════════════════════════════
   AfterAction AI — Resource Hub Framework v1
   Shared search, filter, state-select, card rendering
   Used by: elected-officials, licensure, grants, hotlines, state-benefits
   ══════════════════════════════════════════════════════════ */

var ResourceHub = (function() {
  'use strict';

  // ── STATE ──
  var _data = [];
  var _filtered = [];
  var _config = {};
  var _activeFilters = { category: 'all', state: null, search: '' };
  var _searchTimeout = null;

  // ── US STATES + TERRITORIES ──
  var STATES = [
    { abbr: 'AL', name: 'Alabama' },
    { abbr: 'AK', name: 'Alaska' },
    { abbr: 'AZ', name: 'Arizona' },
    { abbr: 'AR', name: 'Arkansas' },
    { abbr: 'CA', name: 'California' },
    { abbr: 'CO', name: 'Colorado' },
    { abbr: 'CT', name: 'Connecticut' },
    { abbr: 'DE', name: 'Delaware' },
    { abbr: 'DC', name: 'District of Columbia' },
    { abbr: 'FL', name: 'Florida' },
    { abbr: 'GA', name: 'Georgia' },
    { abbr: 'HI', name: 'Hawaii' },
    { abbr: 'ID', name: 'Idaho' },
    { abbr: 'IL', name: 'Illinois' },
    { abbr: 'IN', name: 'Indiana' },
    { abbr: 'IA', name: 'Iowa' },
    { abbr: 'KS', name: 'Kansas' },
    { abbr: 'KY', name: 'Kentucky' },
    { abbr: 'LA', name: 'Louisiana' },
    { abbr: 'ME', name: 'Maine' },
    { abbr: 'MD', name: 'Maryland' },
    { abbr: 'MA', name: 'Massachusetts' },
    { abbr: 'MI', name: 'Michigan' },
    { abbr: 'MN', name: 'Minnesota' },
    { abbr: 'MS', name: 'Mississippi' },
    { abbr: 'MO', name: 'Missouri' },
    { abbr: 'MT', name: 'Montana' },
    { abbr: 'NE', name: 'Nebraska' },
    { abbr: 'NV', name: 'Nevada' },
    { abbr: 'NH', name: 'New Hampshire' },
    { abbr: 'NJ', name: 'New Jersey' },
    { abbr: 'NM', name: 'New Mexico' },
    { abbr: 'NY', name: 'New York' },
    { abbr: 'NC', name: 'North Carolina' },
    { abbr: 'ND', name: 'North Dakota' },
    { abbr: 'OH', name: 'Ohio' },
    { abbr: 'OK', name: 'Oklahoma' },
    { abbr: 'OR', name: 'Oregon' },
    { abbr: 'PA', name: 'Pennsylvania' },
    { abbr: 'RI', name: 'Rhode Island' },
    { abbr: 'SC', name: 'South Carolina' },
    { abbr: 'SD', name: 'South Dakota' },
    { abbr: 'TN', name: 'Tennessee' },
    { abbr: 'TX', name: 'Texas' },
    { abbr: 'UT', name: 'Utah' },
    { abbr: 'VT', name: 'Vermont' },
    { abbr: 'VA', name: 'Virginia' },
    { abbr: 'WA', name: 'Washington' },
    { abbr: 'WV', name: 'West Virginia' },
    { abbr: 'WI', name: 'Wisconsin' },
    { abbr: 'WY', name: 'Wyoming' },
    { abbr: 'AS', name: 'American Samoa' },
    { abbr: 'GU', name: 'Guam' },
    { abbr: 'MP', name: 'Northern Mariana Islands' },
    { abbr: 'PR', name: 'Puerto Rico' },
    { abbr: 'VI', name: 'U.S. Virgin Islands' }
  ];

  /**
   * ── UTILITY FUNCTIONS ──
   */

  /**
   * Escape HTML special characters for safe rendering
   * @param {string} str - String to escape
   * @returns {string} - Escaped string
   */
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Format a date string for display (assumes ISO or common formats)
   * @param {string} dateStr - Date string to format
   * @returns {string} - Formatted date (e.g., "Mar 22, 2026")
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      var date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  }

  /**
   * Build HTML for tags
   * @param {array} tags - Array of tag strings
   * @returns {string} - HTML string of .hub-card__tag elements
   */
  function buildTagsHtml(tags) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return '';
    }
    return tags.map(function(tag) {
      return '<span class="hub-card__tag">' + escapeHtml(tag) + '</span>';
    }).join('');
  }

  /**
   * Build HTML for links
   * @param {array} links - Array of {label, url} objects
   * @returns {string} - HTML string of .hub-card__link anchors
   */
  function buildLinksHtml(links) {
    if (!links || !Array.isArray(links) || links.length === 0) {
      return '';
    }
    return links.map(function(link) {
      var isRestricted = /va\.gov|\.mil\/|osd\.mil|\.af\.mil|\.army\.mil|\.navy\.mil|\.marines\.mil|\.uscg\.mil/.test(link.url);
      var restrictedAttr = isRestricted ? ' data-restricted="true"' : '';
      var restrictedTip  = isRestricted ? '<span class="link-restricted-tip" aria-hidden="true">(Official gov site)</span>' : '';
      return '<a href="' + escapeHtml(link.url) + '" class="hub-card__link" target="_blank" rel="noopener noreferrer"' + restrictedAttr + '>' +
             escapeHtml(link.label) + '</a>' + restrictedTip;
    }).join('');
  }

  /**
   * ── FILTERING & SEARCHING ──
   */

  /**
   * Check if a record matches the structured tag filter criteria
   * @param {object} record - Resource record
   * @param {object} filterTags - Tags to match {key: value}
   * @returns {boolean} - True if record matches all filter tags
   */
  function matchesTags(record, filterTags) {
    if (!filterTags || Object.keys(filterTags).length === 0) {
      return true;
    }
    if (!record.tags) {
      return false;
    }
    // All filter tags must match
    for (var key in filterTags) {
      if (filterTags.hasOwnProperty(key)) {
        var filterValue = filterTags[key];
        var recordValue = record.tags[key];

        // Handle array matching (record might have multiple values)
        if (Array.isArray(recordValue)) {
          if (recordValue.indexOf(filterValue) === -1) {
            return false;
          }
        } else {
          if (recordValue !== filterValue) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Apply all active filters and search
   * @private
   */
  function _applyFilters() {
    _filtered = _data.filter(function(item) {
      // Category filter (case-insensitive, treat data value "All" as wildcard)
      var categoryKey = _config.filterKey || 'category';
      if (_activeFilters.category !== 'all') {
        var itemVal = (item[categoryKey] || '').toString().toLowerCase().replace(/[\s_-]+/g, '_');
        var filterVal = _activeFilters.category.toLowerCase().replace(/[\s_-]+/g, '_');
        if (itemVal !== 'all' && itemVal !== filterVal) {
          return false;
        }
      }

      // State filter
      var stateField = _config.stateField || 'state';
      if (_activeFilters.state) {
        if (item[stateField] !== _activeFilters.state) {
          return false;
        }
      }

      // Search filter
      if (_activeFilters.search.trim()) {
        var query = _activeFilters.search.toLowerCase();
        var searchFields = _config.searchFields || ['name', 'description'];
        var found = false;

        for (var i = 0; i < searchFields.length; i++) {
          var field = searchFields[i];
          var value = item[field];
          if (value && String(value).toLowerCase().indexOf(query) !== -1) {
            found = true;
            break;
          }
        }

        if (!found) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * ── PUBLIC API ──
   */

  /**
   * Initialize the resource hub with configuration and data
   * @param {object} config - Configuration object
   *   - containerId: ID of card grid container
   *   - searchInputId: ID of search input element
   *   - filterContainerId: ID of filter buttons container
   *   - stateContainerId: ID of state selector container (optional)
   *   - data: array of resource objects
   *   - renderCard: function(item) that returns HTML string
   *   - filterKey: field name for category filtering (default: 'category')
   *   - searchFields: array of field names to search (default: ['name', 'description'])
   *   - stateField: field name for state filtering (default: 'state')
   *   - onFilter: optional callback after filtering
   */
  function init(config) {
    _config = config;
    _data = config.data || [];
    _filtered = _data.slice();

    // Setup search input
    if (config.searchInputId) {
      var searchInput = document.getElementById(config.searchInputId);
      if (searchInput) {
        searchInput.addEventListener('input', function(e) {
          search(e.target.value);
        });
      }
    }

    // Initial render
    render();
  }

  /**
   * Search across configured fields with debouncing
   * @param {string} query - Search query
   */
  function search(query) {
    _activeFilters.search = query;

    // Debounce the filtering
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(function() {
      _applyFilters();
      render();
      if (_config.onFilter) {
        _config.onFilter(_filtered);
      }
    }, 300);
  }

  /**
   * Filter by category
   * @param {string} category - Category key (or 'all')
   */
  function filterByCategory(category) {
    _activeFilters.category = category;
    _applyFilters();
    render();

    // Update button active states
    if (_config.filterContainerId) {
      var container = document.getElementById(_config.filterContainerId);
      if (container) {
        var buttons = container.querySelectorAll('[data-filter]');
        buttons.forEach(function(btn) {
          if (btn.getAttribute('data-filter') === category) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      }
    }

    // Analytics: track filter_used event (non-'all' filters only)
    if (category !== 'all' && window.AAAI && window.AAAI.analytics) {
      window.AAAI.analytics.track('filter_used', {
        metadata: { filter_type: 'category', filter_value: category, result_count: _filtered.length }
      });
    }

    if (_config.onFilter) {
      _config.onFilter(_filtered);
    }
  }

  /**
   * Filter by state with toggle behavior
   * @param {string} stateAbbr - State abbreviation (e.g., 'CA')
   */
  function filterByState(stateAbbr) {
    // Toggle: if already selected, deselect
    if (_activeFilters.state === stateAbbr) {
      _activeFilters.state = null;
    } else {
      _activeFilters.state = stateAbbr;
    }

    _applyFilters();
    render();

    // Update button active states
    if (_config.stateContainerId) {
      var container = document.getElementById(_config.stateContainerId);
      if (container) {
        var buttons = container.querySelectorAll('[data-state]');
        buttons.forEach(function(btn) {
          if (btn.getAttribute('data-state') === _activeFilters.state) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      }
    }

    // Analytics: track state filter usage
    if (_activeFilters.state && window.AAAI && window.AAAI.analytics) {
      window.AAAI.analytics.track('filter_used', {
        metadata: { filter_type: 'state', filter_value: _activeFilters.state, result_count: _filtered.length }
      });
    }

    if (_config.onFilter) {
      _config.onFilter(_filtered);
    }
  }

  /**
   * Render filtered results to the DOM
   */
  function render() {
    var container = document.getElementById(_config.containerId);
    if (!container) return;

    container.innerHTML = '';

    if (_filtered.length === 0) {
      container.innerHTML = '<div class="hub-no-results"><p>No resources found. Try adjusting your filters or search.</p></div>';
      return;
    }

    // Render each card using the config-provided renderCard function
    _filtered.forEach(function(item) {
      var cardHtml = _config.renderCard(item);
      var div = document.createElement('div');
      div.innerHTML = cardHtml;
      container.appendChild(div.firstElementChild);
    });
  }

  /**
   * Build state selector buttons
   * Creates a grid of state abbreviation buttons in the configured container
   */
  function buildStateSelector() {
    if (!_config.stateContainerId) return;

    var container = document.getElementById(_config.stateContainerId);
    if (!container) return;

    container.innerHTML = '';
    container.classList.add('hub-state-selector');

    STATES.forEach(function(state) {
      var btn = document.createElement('button');
      btn.className = 'hub-state-btn';
      btn.setAttribute('data-state', state.abbr);
      btn.setAttribute('title', state.name);
      btn.textContent = state.abbr;

      btn.addEventListener('click', function(e) {
        e.preventDefault();
        filterByState(state.abbr);
      });

      container.appendChild(btn);
    });
  }

  /**
   * Build filter category buttons
   * @param {array} categories - Array of {key, label} objects
   */
  function buildFilterButtons(categories) {
    if (!_config.filterContainerId) return;

    var container = document.getElementById(_config.filterContainerId);
    if (!container) return;

    container.innerHTML = '';
    container.classList.add('hub-filter-buttons');

    categories.forEach(function(cat) {
      var btn = document.createElement('button');
      btn.className = 'hub-filter-btn';
      if (cat.key === 'all') {
        btn.classList.add('active');
      }
      btn.setAttribute('data-filter', cat.key);
      btn.textContent = cat.label;

      btn.addEventListener('click', function(e) {
        e.preventDefault();
        filterByCategory(cat.key);
      });

      container.appendChild(btn);
    });
  }

  /**
   * Get the count of current filtered results
   * @returns {number} - Count of filtered items
   */
  function getResultCount() {
    return _filtered.length;
  }

  /**
   * ── PUBLIC API RETURN ──
   */
  return {
    init: init,
    search: search,
    filterByCategory: filterByCategory,
    filterByState: filterByState,
    render: render,
    buildStateSelector: buildStateSelector,
    buildFilterButtons: buildFilterButtons,
    getResultCount: getResultCount,
    matchesTags: matchesTags,
    STATES: STATES,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    buildTagsHtml: buildTagsHtml,
    buildLinksHtml: buildLinksHtml
  };
})();
