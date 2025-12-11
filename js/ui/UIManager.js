import { debounce, getEditDistance } from '../utils.js';

export class UIManager {
    /**
     * manages UI interactions including search, settings, tooltips, and controls
     * @param {Object} callbacks - Event callback functions: { onSearch, onSelect, onSpaceChange, onScaleChange, onBackgroundChange, onToggleAxes, onToggleVisibility }
     */
    constructor(callbacks) {
        this.callbacks = callbacks || {};

        this.data = [];
        this.currentMatches = [];
        this.searchIndex = -1;

        this.dom = {
            loading: document.getElementById('loading'),
            loadingBar: document.getElementById('loading-bar'),
            loadingStatus: document.getElementById('loading-status'),
            tooltip: document.getElementById('tooltip'),
            searchInput: document.getElementById('search-input'),
            searchResults: document.getElementById('search-results'),
            settingsMenu: document.getElementById('settings-menu'),
            settingsToggle: document.getElementById('settings-toggle'),
            scaleSlider: document.getElementById('scale-slider'),
            scaleValue: document.getElementById('scale-value'),
            bgHue: document.getElementById('background-hue'),
            bgSat: document.getElementById('background-saturation'),
            bgVal: document.getElementById('background-value'),
            bgHueVal: document.getElementById('background-hue-value'),
            bgSatVal: document.getElementById('background-saturation-value'),
            bgValVal: document.getElementById('background-value-value'),
            hideCheck: document.getElementById('hide-unflagged-checkbox'),
            axesCheck: document.getElementById('show-axes-checkbox'),
            customSelect: document.querySelector('.custom-select'),
            selectedSpaceName: document.getElementById('selected-space-name')
        };

        this._setupEventListeners();
    }

    /**
     * Sets the color data reference for search functionality.
     * Called by Main after data is loaded.
     * @param {Array} data - Array of color objects
     */
    setData(data) {
        this.data = data;
    }

    /**
     * Updates the loading progress bar and status text.
     * Hides loading UI when complete.
     * @param {number} percent - Loading progress percentage (0-100)
     * @param {string} status - Status message to display
     */
    updateLoading(percent, status) {
        if (this.dom.loadingBar) this.dom.loadingBar.style.width = percent + '%';
        if (this.dom.loadingStatus) this.dom.loadingStatus.textContent = status;

        if (percent >= 100 && this.dom.loading) {
            setTimeout(() => this.dom.loading.style.display = 'none', 500);
        }
    }

    /**
     * Shows a tooltip with color information at the specified screen coordinates.
     * @param {number} x - Screen X coordinate
     * @param {number} y - Screen Y coordinate
     * @param {string} name - Color name
     * @param {string} hex - Color hex code
     */
    showTooltip(x, y, name, hex) {
        if (!this.dom.tooltip) return;
        this.dom.tooltip.querySelector('.tooltip-name').textContent = name;
        this.dom.tooltip.querySelector('.tooltip-hex').textContent = hex;
        this.dom.tooltip.style.display = 'block';
        this.dom.tooltip.style.left = (x + 15) + 'px';
        this.dom.tooltip.style.top = (y + 15) + 'px';
    }

    /**
     * Hides the tooltip.
     */
    hideTooltip() {
        if (this.dom.tooltip) this.dom.tooltip.style.display = 'none';
    }

    /**
     * Sets up all UI event listeners for search, settings, controls, and color space selection.
     */
    _setupEventListeners() {
        this._setupSearch();
        this._setupSettings();
        this._setupControls();
        this._setupColorSpaceSelect();
    }

    /**
     * Sets up search input event listeners for debounced search and keyboard navigation.
     */
    _setupSearch() {
        if (!this.dom.searchInput) return;

        const performSearch = debounce((query) => this._handleSearch(query), 150);
        this.dom.searchInput.addEventListener('input', (e) => performSearch(e.target.value));
        this.dom.searchInput.addEventListener('keydown', (e) => this._handleSearchKeydown(e));

        this.dom.searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                if(this.dom.searchResults) this.dom.searchResults.style.display = 'none';
            }, 200);
        });
    }

    /**
     * Performs search filtering and ranking based on user input.
     * Uses strict matching first, then fuzzy matching with edit distance ranking.
     * @param {string} rawQuery - Raw search query from input
     */
    _handleSearch(rawQuery) {
        const query = rawQuery.trim().toLowerCase();
        if (query.length < 2) {
            this.dom.searchResults.style.display = 'none';
            this.currentMatches = [];
            this.searchIndex = -1;
            return;
        }

        const hideUnflagged = this.dom.hideCheck ? this.dom.hideCheck.checked : false;

        let potentialMatches = this.data.filter(color => {
            if (hideUnflagged && !color.flag) return false;
            return color.name.toLowerCase().includes(query) ||
                   color.hex.toLowerCase().includes(query);
        });

        if (potentialMatches.length === 0) {
            potentialMatches = this.data.filter(c => !hideUnflagged || c.flag);
        }

        const matchesWithDist = potentialMatches.map(color => {
            const distName = getEditDistance(query, color.name.toLowerCase());
            const distHex = getEditDistance(query, color.hex.toLowerCase());
            return { color, dist: Math.min(distName, distHex) };
        });

        matchesWithDist.sort((a, b) => a.dist - b.dist);

        const limit = potentialMatches.length === 0 ? 20 : 100;
        this.currentMatches = matchesWithDist.slice(0, limit).map(item => item.color);
        this._renderSearchResults();

        if (this.currentMatches.length > 0) {
            this.searchIndex = 0;
            if (this.callbacks.onSelect) {
                const index = this.data.indexOf(this.currentMatches[0]);
                this.callbacks.onSelect(index, true);
            }
        }
    }

    /**
     * Renders the search results list with color swatches and click handlers.
     */
    _renderSearchResults() {
        if (this.currentMatches.length > 0) {
            this.dom.searchResults.innerHTML = this.currentMatches.map((color, idx) => `
                <div class="search-result-item ${idx === 0 ? 'selected' : ''}" data-index="${idx}">
                    <div class="color-swatch" style="background-color: ${color.hex}"></div>
                    <div class="color-info">
                        <div class="color-name">${color.name}</div>
                        <div class="color-hex">${color.hex}</div>
                    </div>
                </div>
            `).join('');
            this.dom.searchResults.style.display = 'block';

            this.dom.searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.getAttribute('data-index'));
                    this._selectSearchResult(idx);
                });
            });
        } else {
            this.dom.searchResults.style.display = 'none';
        }
    }

    /**
     * Handles keyboard navigation for search results.
     * @param {KeyboardEvent} e - Keyboard event
     */
    _handleSearchKeydown(e) {
        if (this.currentMatches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.searchIndex = Math.min(this.searchIndex + 1, this.currentMatches.length - 1);
            this._updateSearchSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.searchIndex = Math.max(this.searchIndex - 1, 0);
            this._updateSearchSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this._selectSearchResult(this.searchIndex);
        } else if (e.key === 'Escape') {
            this.dom.searchResults.style.display = 'none';
        }
    }

    /**
     * Updates the visual selection in search results and triggers live preview.
     */
    _updateSearchSelection() {
        const items = this.dom.searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, idx) => {
            if (idx === this.searchIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                if (this.callbacks.onSelect) {
                    const color = this.currentMatches[idx];
                    const globalIndex = this.data.indexOf(color);
                    this.callbacks.onSelect(globalIndex);
                }
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * Selects a search result and clears the search UI.
     * @param {number} matchIndex - Index in the current matches array
     */
    _selectSearchResult(matchIndex) {
        if (matchIndex >= 0 && matchIndex < this.currentMatches.length) {
            const color = this.currentMatches[matchIndex];
            const globalIndex = this.data.indexOf(color);

            if (this.callbacks.onSelect) {
                this.callbacks.onSelect(globalIndex);
            }

            this.dom.searchInput.value = '';
            this.dom.searchResults.style.display = 'none';
        }
    }

    /**
     * Sets up settings menu toggle, click-outside close, and escape key handling.
     */
    _setupSettings() {
        if (this.dom.settingsToggle) {
            this.dom.settingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dom.settingsMenu.classList.toggle('open');
            });
        }

        document.addEventListener('mousedown', (e) => {
            if (this.dom.settingsMenu && !this.dom.settingsMenu.contains(e.target)) {
                this.dom.settingsMenu.classList.remove('open');
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dom.settingsMenu) {
                this.dom.settingsMenu.classList.remove('open');
            }
        });
    }

    /**
     * Sets up control event listeners for scale slider, background sliders, and checkboxes.
     */
    _setupControls() {
        if (this.dom.scaleSlider) {
            this.dom.scaleSlider.addEventListener('input', () => {
                const val = parseFloat(this.dom.scaleSlider.value);
                this.dom.scaleValue.textContent = val.toFixed(2);
                if (this.callbacks.onScaleChange) this.callbacks.onScaleChange(val);
            });
        }

        const updateBg = () => {
            const h = parseInt(this.dom.bgHue.value);
            const s = parseInt(this.dom.bgSat.value);
            const v = parseInt(this.dom.bgVal.value);

            this.dom.bgHueVal.textContent = h;
            this.dom.bgSatVal.textContent = s;
            this.dom.bgValVal.textContent = v;

            if (this.callbacks.onBackgroundChange) {
                this.callbacks.onBackgroundChange(h, s, v);
            }
        };

        if (this.dom.bgHue) this.dom.bgHue.addEventListener('input', updateBg);
        if (this.dom.bgSat) this.dom.bgSat.addEventListener('input', updateBg);
        if (this.dom.bgVal) this.dom.bgVal.addEventListener('input', updateBg);

        if (this.dom.hideCheck) {
            this.dom.hideCheck.addEventListener('change', (e) => {
                if (this.callbacks.onToggleVisibility) {
                    this.callbacks.onToggleVisibility(e.target.checked);
                }
            });
        }

        if (this.dom.axesCheck) {
            this.dom.axesCheck.addEventListener('change', (e) => {
                if (this.callbacks.onToggleAxes) {
                    this.callbacks.onToggleAxes(e.target.checked);
                }
            });
        }
    }

    /**
     * Sets up the custom color space dropdown with click handlers and outside click closing.
     */
    _setupColorSpaceSelect() {
        if (!this.dom.customSelect) return;

        const trigger = this.dom.customSelect.querySelector('.custom-select-trigger');
        const options = this.dom.customSelect.querySelectorAll('.custom-option');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.customSelect.classList.toggle('open');
        });

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = option.getAttribute('data-value');
                const text = option.textContent;

                this.dom.customSelect.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                this.dom.selectedSpaceName.textContent = text;
                this.dom.customSelect.classList.remove('open');

                if (this.callbacks.onSpaceChange) {
                    this.callbacks.onSpaceChange(value);
                }
            });
        });

        window.addEventListener('click', (e) => {
            if (!this.dom.customSelect.contains(e.target)) {
                this.dom.customSelect.classList.remove('open');
            }
        });
    }
}