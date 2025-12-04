import * as THREE from 'three';
import { indexToColor, colorToIndex, debounce, getEditDistance } from './utils.js';
import { CameraRig } from './systems/CameraRig.js';
import { Picker } from './systems/Picker.js';
import { Interaction } from './systems/Interaction.js';
import { PointCloud } from './components/PointCloud.js';
import { ColorLoader } from './data/ColorLoader.js';

// global vars
let scene, camera, renderer;
let cameraRig;
let picker, interaction;
let pointCloud;
let scale = 1.0;
let pixelThreshold = 8;

let backgroundHue = 0;
let backgroundSaturation = 0;
let backgroundValue = 3;

let axesHelper = null;

// Physics
const clock = new THREE.Clock();

// current color space
let currentColorSpace = null;

// color space definitions
const colorSpaces = {
    oklab: {
        name: 'Oklab',
        scale: 4.0,  // Uniform scale factor for all axes
        getPosition: (color) => {
            return {
                x: ((color.l - 0.5) * 1.0) * scale,  // L: 0-1, center at 0.5
                y: (color.a * 2.5) * scale,          // a: already centered around 0
                z: (color.oklab_b * 2.5) * scale     // b: already centered around 0
            };
        },
        scales: { x: 1.0, y: 2.5, z: 2.5 },
        axisLabels: { x: 'L', y: 'A', z: 'B' }
    },
    rgb: {
        name: 'RGB',
        scale: 4.0,  // Uniform scale factor for all axes
        getPosition: (color) => {
            return {
                x: (color.r - 127.5) / 255 * scale,  // R: 0-255, center at 127.5
                y: (color.g - 127.5) / 255 * scale,  // G: 0-255, center at 127.5
                z: (color.b - 127.5) / 255 * scale   // B: 0-255, center at 127.5
            };
        },
        scales: { x: 2.0, y: 2.0, z: 2.0 },
        axisLabels: { x: 'R', y: 'G', z: 'B' }
    }
};

function init() {
    scene = new THREE.Scene();
    updateSceneBackground();

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.01,
        1000
    );

    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    pointCloud = new PointCloud(scene);

    // Initialize Rig
    cameraRig = new CameraRig(camera, renderer.domElement);

    // 1. Initialize Picker
    picker = new Picker(renderer, scene, camera);

    // 2. Initialize Interaction
    interaction = new Interaction(renderer, camera, picker, {
        
        // Accessor for the interaction class to find the mesh
        getPickingMesh: () => pointCloud.pickingMesh, 
        getVisualMesh: () => pointCloud.mesh,

        // Handle Left Click
        onSelect: (index) => {
            const color = pointCloud.data[index];
            if (color) jumpToColor(color, index);
        },

        // Handle Hover
        onHover: (index, x, y) => {
            const tooltip = document.getElementById('tooltip');
            if (index >= 0) {
                const color = pointCloud.data[index];
                tooltip.querySelector('.tooltip-name').textContent = color.name;
                tooltip.querySelector('.tooltip-hex').textContent = color.hex;
                tooltip.style.display = 'block';
                tooltip.style.left = (x + 15) + 'px';
                tooltip.style.top = (y + 15) + 'px';
            } else {
                tooltip.style.display = 'none';
            }
        }
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    axesHelper = new THREE.AxesHelper(1);
    axesHelper.visible = false; // Hidden by default
    scene.add(axesHelper);

    setupEventListeners();
}

// update loading progress
function updateLoadingProgress(percent, status) {
    const loadingBar = document.getElementById('loading-bar');
    const loadingStatus = document.getElementById('loading-status');
    if (loadingBar) loadingBar.style.width = percent + '%';
    if (loadingStatus) loadingStatus.textContent = status;
}

// laod colours
async function loadColors() {
    try {
        // 1. Fetch and Parse (using the new Loader)
        const data = await ColorLoader.load('../data/colors_oklab.csv', updateLoadingProgress);

        updateLoadingProgress(70, `Loaded ${data.length} colors. Creating spheres...`);
        console.log(`Loaded ${data.length} colors`);

        // 2. Initialize the Point Cloud
        if (pointCloud) {
            pointCloud.init(data);

            // 3. Set Initial Positions
            currentColorSpace = colorSpaces.oklab; 
            await pointCloud.updatePositions(currentColorSpace, updateLoadingProgress);
        }

        // 4. Cleanup UI
        updateLoadingProgress(100, 'Complete!');
        setTimeout(() => {
            const loadingEl = document.getElementById('loading');
            if(loadingEl) loadingEl.style.display = 'none';
        }, 500);

    } catch (error) {
        console.error('Error loading colors:', error);
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.innerHTML = `
                <div style="color: #ff5555;">Error loading colors!</div>
                <div style="font-size: 14px; margin-top: 10px; color: #aaa;">
                    ${error.message}<br><br>
                    Make sure you are running a local server.
                </div>
            `;
        }
    }
}









function updateSceneBackground() {
    if (scene) {
        const h = backgroundHue / 360;
        const s = backgroundSaturation / 100;
        const v = backgroundValue / 100;
        
        // HSV to RGB conversion
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        let r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        
        scene.background = new THREE.Color(r, g, b);
    }
}





function jumpToColor(color, instanceId) {
    if (!currentColorSpace || !pointCloud) return;
    
    // 1. Tell PointCloud to highlight this dot
    pointCloud.selectIndex(instanceId);
    
    // 2. Tell CameraRig to fly to this position
    const targetPos = pointCloud.getBounds(instanceId);
    if (targetPos) {
        cameraRig.flyTo(targetPos);
    }

    console.log(`Selected: ${color.name} (${color.hex})`);
}

// smoothly moves the camera
// separated target variables for orbit point and distance so that
// the distance animation can be cancelled if we get a mouse wheel event
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (cameraRig) {
        cameraRig.update(deltaTime);
    }

    renderer.render(scene, camera);
}





function setupEventListeners() {
    // Mouse controls
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Search
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    let currentSelectedIndex = -1;
    let currentMatches = [];

    // Update search results
    const updateSearchResults = (query) => {
        if (query.length < 2) {
            searchResults.style.display = 'none';
            currentMatches = [];
            currentSelectedIndex = -1;
            return;
        }

        const lowerQuery = query.toLowerCase();
        
        // Use pointCloud.data
        const data = pointCloud ? pointCloud.data : [];

        // 1. Strict Search (Substring)
        let potentialMatches = data.filter(color => {
            if (pointCloud && pointCloud.hideUnflagged && !color.flag) return false;
            return color.name.toLowerCase().includes(lowerQuery) ||
                   color.hex.toLowerCase().includes(lowerQuery);
        });

        // 2. Fallback to Fuzzy Search if no strict matches
        let isFuzzy = false;
        if (potentialMatches.length === 0) {
            isFuzzy = true;
            // Consider all colors (respecting flags)
            potentialMatches = data.filter(c => !pointCloud || !pointCloud.hideUnflagged || c.flag);
        }

        // 3. Sort by Edit Distance
        // We map to an intermediate object to calculate distance only once per item
        const matchesWithDist = potentialMatches.map(color => {
            const distName = getEditDistance(lowerQuery, color.name.toLowerCase());
            // Only consider hex distance if query looks like it could be part of a hex
            // (simple heuristic: has digits or a-f, but just doing both is safer for UX)
            const distHex = getEditDistance(lowerQuery, color.hex.toLowerCase());
            return {
                color: color,
                dist: Math.min(distName, distHex)
            };
        });

        matchesWithDist.sort((a, b) => a.dist - b.dist);

        // 4. Apply limits
        const limit = isFuzzy ? 20 : 100;
        currentMatches = matchesWithDist.slice(0, limit).map(item => item.color);

        if (currentMatches.length > 0) {
            searchResults.innerHTML = currentMatches.map((color, index) => `
                <div class="search-result-item ${index === 0 ? 'selected' : ''}" data-name="${color.name}" data-index="${index}">
                    <div class="color-swatch" style="background-color: ${color.hex}"></div>
                    <div class="color-info">
                        <div class="color-name">${color.name}</div>
                        <div class="color-hex">${color.hex}</div>
                    </div>
                </div>
            `).join('');
            searchResults.style.display = 'block';
            currentSelectedIndex = 0;

            // Automatically jump to the top result
            const topColor = currentMatches[0];
            const colorIndex = data.findIndex(c => c.name === topColor.name);
            if (colorIndex >= 0) {
                // Access color from data
                jumpToColor(data[colorIndex], colorIndex);
            }

            // Add click handlers
            searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const colorName = item.getAttribute('data-name');
                    const colorIndex = data.findIndex(c => c.name === colorName);
                    if (colorIndex >= 0) {
                        jumpToColor(data[colorIndex], colorIndex);
                        searchInput.value = '';
                        searchResults.style.display = 'none';
                        currentMatches = [];
                        currentSelectedIndex = -1;
                    }
                });
            });
        } else {
            searchResults.style.display = 'none';
            currentMatches = [];
            currentSelectedIndex = -1;
        }
    };

    // Debounced search function
    const debouncedSearch = debounce(updateSearchResults, 150);

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        debouncedSearch(query);
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        if (currentMatches.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                currentSelectedIndex = Math.min(currentSelectedIndex + 1, currentMatches.length - 1);
                updateSelectedItem();
                scrollToSelectedItem();
                // jump to the newly selected color
                if (currentSelectedIndex >= 0 && currentSelectedIndex < currentMatches.length) {
                    const selectedColor = currentMatches[currentSelectedIndex];
                    const data = pointCloud ? pointCloud.data : [];
                    const colorIndex = data.findIndex(c => c.name === selectedColor.name);
                    if (colorIndex >= 0) {
                        jumpToColor(data[colorIndex], colorIndex);
                    }
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                currentSelectedIndex = Math.max(currentSelectedIndex - 1, 0);
                updateSelectedItem();
                scrollToSelectedItem();
                // Jump to the newly selected color
                if (currentSelectedIndex >= 0 && currentSelectedIndex < currentMatches.length) {
                    const selectedColor = currentMatches[currentSelectedIndex];
                    const data = pointCloud ? pointCloud.data : [];
                    const colorIndex = data.findIndex(c => c.name === selectedColor.name);
                    if (colorIndex >= 0) {
                        jumpToColor(data[colorIndex], colorIndex);
                    }
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (currentSelectedIndex >= 0 && currentSelectedIndex < currentMatches.length) {
                    const selectedColor = currentMatches[currentSelectedIndex];
                    const data = pointCloud ? pointCloud.data : [];
                    const colorIndex = data.findIndex(c => c.name === selectedColor.name);
                    if (colorIndex >= 0) {
                        jumpToColor(data[colorIndex], colorIndex);
                        searchInput.value = '';
                        searchResults.style.display = 'none';
                        currentMatches = [];
                        currentSelectedIndex = -1;
                    }
                }
                break;
            case 'Escape':
                searchResults.style.display = 'none';
                currentMatches = [];
                currentSelectedIndex = -1;
                break;
        }
    });

    function updateSelectedItem() {
        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            if (index === currentSelectedIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function scrollToSelectedItem() {
        const selectedItem = searchResults.querySelector('.search-result-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }

    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            searchResults.style.display = 'none';
        }, 200);
    });

    // Custom Color Space Selector Logic
    const customSelect = document.querySelector('.custom-select');
    const customSelectTrigger = customSelect.querySelector('.custom-select-trigger');
    const customOptions = customSelect.querySelectorAll('.custom-option');
    const selectedSpaceName = document.getElementById('selected-space-name');

    // Toggle menu
    customSelectTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        customSelect.classList.toggle('open');
    });

    // Handle option selection
    customOptions.forEach(option => {
        option.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent bubbling
            const selectedSpace = option.getAttribute('data-value');
            
            // UI Update
            const currentSelected = customSelect.querySelector('.custom-option.selected');
            if(currentSelected) currentSelected.classList.remove('selected');
            
            option.classList.add('selected');
            selectedSpaceName.textContent = option.textContent;
            customSelect.classList.remove('open');

            // Logic Update
            if (colorSpaces[selectedSpace]) {
                currentColorSpace = colorSpaces[selectedSpace];
                document.getElementById('loading').style.display = 'block';
                updateLoadingProgress(0, `Switching to ${currentColorSpace.name}...`);
                
                if (pointCloud) {
                    await pointCloud.updatePositions(currentColorSpace, updateLoadingProgress);
                }
                
                updateLoadingProgress(100, 'Complete!');
                setTimeout(() => {
                    document.getElementById('loading').style.display = 'none';
                }, 500);
            }
        });
    });

    // Close when clicking outside
    window.addEventListener('click', (e) => {
        if (customSelect && !customSelect.contains(e.target)) {
            customSelect.classList.remove('open');
        }
    });

    // Settings menu
    const settingsMenu = document.getElementById('settings-menu');
    const settingsToggle = document.getElementById('settings-toggle');
    
    settingsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('open');
    });

    // Close menu when clicking outside
    document.addEventListener('mousedown', (e) => {
        if (!settingsMenu.contains(e.target)) {
            settingsMenu.classList.remove('open');
        }
    });

    // Close menu on Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            settingsMenu.classList.remove('open');
        }
    });

    // Scale slider
    const scaleSlider = document.getElementById('scale-slider');
    const scaleValue = document.getElementById('scale-value');
    
    // Initialize scale from slider and display
    scale = parseFloat(scaleSlider.value);
    scaleValue.textContent = scale.toFixed(2);

    scaleSlider.addEventListener('input', async () => {
        scale = parseFloat(scaleSlider.value);
        scaleValue.textContent = scale.toFixed(2);

        // Update sphere positions with new scale
        if (pointCloud && currentColorSpace) {
            await pointCloud.updatePositions(currentColorSpace);
        }
    });

    // Background color sliders
    const backgroundHueSlider = document.getElementById('background-hue');
    const backgroundSaturationSlider = document.getElementById('background-saturation');
    const backgroundValueSlider = document.getElementById('background-value');
    const backgroundHueDisplay = document.getElementById('background-hue-value');
    const backgroundSaturationDisplay = document.getElementById('background-saturation-value');
    const backgroundValueDisplay = document.getElementById('background-value-value');

    // Initialize background values from sliders and display
    backgroundHue = parseInt(backgroundHueSlider.value);
    backgroundSaturation = parseInt(backgroundSaturationSlider.value);
    backgroundValue = parseInt(backgroundValueSlider.value);
    backgroundHueDisplay.textContent = backgroundHue;
    backgroundSaturationDisplay.textContent = backgroundSaturation;
    backgroundValueDisplay.textContent = backgroundValue;

    // Update scene background
    updateSceneBackground();

    backgroundHueSlider.addEventListener('input', () => {
        backgroundHue = parseInt(backgroundHueSlider.value);
        backgroundHueDisplay.textContent = backgroundHue;
        updateSceneBackground();
    });

    backgroundSaturationSlider.addEventListener('input', () => {
        backgroundSaturation = parseInt(backgroundSaturationSlider.value);
        backgroundSaturationDisplay.textContent = backgroundSaturation;
        updateSceneBackground();
    });

    backgroundValueSlider.addEventListener('input', () => {
        backgroundValue = parseInt(backgroundValueSlider.value);
        backgroundValueDisplay.textContent = backgroundValue;
        updateSceneBackground();
    });

    // Hide unflagged colors checkbox
    const hideUnflaggedCheckbox = document.getElementById('hide-unflagged-checkbox');
    // hideUnflaggedColors is removed, check checkbox state directly or from pointCloud
    hideUnflaggedCheckbox.checked = false; // Default
    
    hideUnflaggedCheckbox.addEventListener('change', (e) => {
        if (pointCloud) {
            pointCloud.updateVisibility(e.target.checked);
        }

        // Refresh search results if there's an active query
        const query = searchInput.value.trim().toLowerCase();
        if (query.length >= 2) {
            updateSearchResults(query);
        }
    });

    const showAxesCheckbox = document.getElementById('show-axes-checkbox');
    showAxesCheckbox.checked = false;
    if (axesHelper) axesHelper.visible = false;

    showAxesCheckbox.addEventListener('change', (e) => {
        if (axesHelper) {
            axesHelper.visible = e.target.checked;
        }
    });
}

// events



init();
loadColors();
animate();