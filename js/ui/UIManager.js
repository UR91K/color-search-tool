import { debounce, getEditDistance } from '../utils.js';

export class UIManager {
    constructor(callbacks) {
        // Callbacks: { onSearch, onSelect, onSpaceChange, onScaleChange, onBackgroundChange, onToggleAxes, onToggleVisibility }
        this.callbacks = callbacks || {};
        
        this.data = []; // Local reference to data for search functionality
        this.currentMatches = [];
        this.searchIndex = -1;

        // Cache DOM Elements
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

    // Called by Main after data is loaded so Search can work
    setData(data) {
        this.data = data;
    }

    updateLoading(percent, status) {
        if (this.dom.loadingBar) this.dom.loadingBar.style.width = percent + '%';
        if (this.dom.loadingStatus) this.dom.loadingStatus.textContent = status;
        
        if (percent >= 100 && this.dom.loading) {
            setTimeout(() => this.dom.loading.style.display = 'none', 500);
        }
    }

    showTooltip(x, y, name, hex) {
        if (!this.dom.tooltip) return;
        this.dom.tooltip.querySelector('.tooltip-name').textContent = name;
        this.dom.tooltip.querySelector('.tooltip-hex').textContent = hex;
        this.dom.tooltip.style.display = 'block';
        this.dom.tooltip.style.left = (x + 15) + 'px';
        this.dom.tooltip.style.top = (y + 15) + 'px';
    }

    hideTooltip() {
        if (this.dom.tooltip) this.dom.tooltip.style.display = 'none';
    }

    // --- Internal Setup ---

    _setupEventListeners() {
        this._setupSearch();
        this._setupSettings();
        this._setupControls();
        this._setupColorSpaceSelect();
    }

    _setupSearch() {
        if (!this.dom.searchInput) return;

        // Debounced Input
        const performSearch = debounce((query) => this._handleSearch(query), 150);
        this.dom.searchInput.addEventListener('input', (e) => performSearch(e.target.value));

        // Keyboard Navigation
        this.dom.searchInput.addEventListener('keydown', (e) => this._handleSearchKeydown(e));
        
        // Hide on blur
        this.dom.searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                if(this.dom.searchResults) this.dom.searchResults.style.display = 'none';
            }, 200);
        });
    }

    _handleSearch(rawQuery) {
        const query = rawQuery.trim().toLowerCase();
        if (query.length < 2) {
            this.dom.searchResults.style.display = 'none';
            this.currentMatches = [];
            this.searchIndex = -1;
            return;
        }

        // 1. Strict Filter
        // We check if the 'hide' checkbox is checked to filter search results too
        const hideUnflagged = this.dom.hideCheck ? this.dom.hideCheck.checked : false;

        let potentialMatches = this.data.filter(color => {
            if (hideUnflagged && !color.flag) return false;
            return color.name.toLowerCase().includes(query) || 
                   color.hex.toLowerCase().includes(query);
        });

        // 2. Fuzzy Fallback
        if (potentialMatches.length === 0) {
            potentialMatches = this.data.filter(c => !hideUnflagged || c.flag);
        }

        // 3. Sort by Distance
        const matchesWithDist = potentialMatches.map(color => {
            const distName = getEditDistance(query, color.name.toLowerCase());
            const distHex = getEditDistance(query, color.hex.toLowerCase());
            return { color, dist: Math.min(distName, distHex) };
        });

        matchesWithDist.sort((a, b) => a.dist - b.dist);

        // 4. Render
        const limit = potentialMatches.length === 0 ? 20 : 100;
        this.currentMatches = matchesWithDist.slice(0, limit).map(item => item.color);
        this._renderSearchResults();

        // 5. Auto-select top result (Visual only)
        if (this.currentMatches.length > 0) {
            this.searchIndex = 0;
            // Optionally: Auto-jump to first result? 
            // The original code did: jumpToColor(topResult) immediately.
            if (this.callbacks.onSelect) {
                const index = this.data.indexOf(this.currentMatches[0]);
                this.callbacks.onSelect(index, true); // true = 'fromSearch' (optional flag)
            }
        }
    }

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

            // Add click listeners to new DOM elements
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

    _updateSearchSelection() {
        const items = this.dom.searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, idx) => {
            if (idx === this.searchIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                
                // Live preview as we arrow down
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

    _selectSearchResult(matchIndex) {
        if (matchIndex >= 0 && matchIndex < this.currentMatches.length) {
            const color = this.currentMatches[matchIndex];
            const globalIndex = this.data.indexOf(color);
            
            if (this.callbacks.onSelect) {
                this.callbacks.onSelect(globalIndex);
            }
            
            // Clear UI
            this.dom.searchInput.value = '';
            this.dom.searchResults.style.display = 'none';
        }
    }

    _setupSettings() {
        // Toggle Menu
        if (this.dom.settingsToggle) {
            this.dom.settingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dom.settingsMenu.classList.toggle('open');
            });
        }

        // Close on Click Outside
        document.addEventListener('mousedown', (e) => {
            if (this.dom.settingsMenu && !this.dom.settingsMenu.contains(e.target)) {
                this.dom.settingsMenu.classList.remove('open');
            }
        });
        
        // Close on Esc
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dom.settingsMenu) {
                this.dom.settingsMenu.classList.remove('open');
            }
        });
    }

    _setupControls() {
        // Scale
        if (this.dom.scaleSlider) {
            this.dom.scaleSlider.addEventListener('input', () => {
                const val = parseFloat(this.dom.scaleSlider.value);
                this.dom.scaleValue.textContent = val.toFixed(2);
                if (this.callbacks.onScaleChange) this.callbacks.onScaleChange(val);
            });
        }

        // Background Sliders
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

        // Checkboxes
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

                // UI Update
                this.dom.customSelect.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                this.dom.selectedSpaceName.textContent = text;
                this.dom.customSelect.classList.remove('open');

                // Callback
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