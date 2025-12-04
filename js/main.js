import * as THREE from 'three';
import { hexToRgb, indexToColor, colorToIndex, debounce, getEditDistance } from './utils.js';
import { CameraRig } from 'systems/CameraRig.js';

// global vars
let scene, camera, renderer;
let cameraRig;
let colorData = [];
let instancedMesh = null;
let selectedColor = null;
let selectedColorIndex = -1;
let scale = 1.0;
let pixelThreshold = 8;

let hideUnflaggedColors = false;

let backgroundHue = 0;
let backgroundSaturation = 0;
let backgroundValue = 3;

let axesHelper = null;

// Physics
const clock = new THREE.Clock(); 

// GPU picking setup
let pickingMesh = null;
let pickingRenderTarget = null;
let pickingMaterial = null;

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

    // Initialize Rig
    cameraRig = new CameraRig(camera, renderer.domElement);

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
        updateLoadingProgress(10, 'Fetching CSV file...');
        const response = await fetch('../data/colors_oklab.csv');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        updateLoadingProgress(30, 'Reading file data...');
        const text = await response.text();

        updateLoadingProgress(40, 'Parsing colors...');
        const lines = text.split('\n');
        const totalLines = lines.length;

        // skip header
        for (let i = 1; i < totalLines; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',');
            if (parts.length >= 5) {
                const hex = parts[1];
                const rgb = hexToRgb(hex);
                colorData.push({
                    name: parts[0],
                    hex: hex,
                    l: parseFloat(parts[2]),
                    a: parseFloat(parts[3]),
                    oklab_b: parseFloat(parts[4]),
                    r: rgb.r,
                    g: rgb.g,
                    b: rgb.b,
                    flag: JSON.parse(parts[5]),
                });
            }

            // update progress every 1000 lines
            if (i % 1000 === 0) {
                const progress = 40 + (i / totalLines) * 30;
                updateLoadingProgress(progress, `parsing colors... ${i}/${totalLines}`);
                // allow UI to update
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        updateLoadingProgress(70, `Loaded ${colorData.length} colors. creating spheres...`);
        console.log(`loaded ${colorData.length} colors`);

        // set default color space
        currentColorSpace = colorSpaces.oklab;
        await createColorSpheres();

        updateLoadingProgress(100, 'Complete!');
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
        }, 500);
    } catch (error) {
        console.error('Error loading colors:', error);
        const loadingDiv = document.getElementById('loading');
        loadingDiv.innerHTML = `
            <div style="color: #ff5555;">Error loading colors!</div>
            <div style="font-size: 14px; margin-top: 10px; color: #aaa;">
                ${error.message}<br><br>
                make sure you're running this from a local web server<br>
                (e.g., <code>python -m http.server 8000</code>)
            </div>
        `;
    }
}

// create instanced mesh for all colours
async function createColorSpheres() {
    const totalColors = colorData.length;

    const geometry = new THREE.SphereGeometry(0.004, 16, 12);

    const material = new THREE.MeshBasicMaterial();

    instancedMesh = new THREE.InstancedMesh(geometry, material, totalColors);
    instancedMesh.frustumCulled = false;  // Disable culling - instances spread far from origin

    // Create GPU picking system
    pickingRenderTarget = new THREE.WebGLRenderTarget(1, 1);
    pickingMaterial = new THREE.MeshBasicMaterial();
    pickingMesh = new THREE.InstancedMesh(geometry, pickingMaterial, totalColors);
    pickingMesh.frustumCulled = false;
    pickingMesh.visible = false; // Hidden, only rendered to pick buffer

    await updateSpherePositions();

    scene.add(instancedMesh);
    scene.add(pickingMesh);

    console.log(`created instanced mesh with ${totalColors} instances`);
}

// efficiently update visibility of unflagged colors
function updateUnflaggedVisibility() {
    if (!instancedMesh) return;

    const totalColors = colorData.length;
    const dummy = new THREE.Object3D();
    let needsUpdate = false;

    for (let i = 0; i < totalColors; i++) {
        const colorData_item = colorData[i];
        const shouldHide = hideUnflaggedColors && !colorData_item.flag;
        
        // Skip if this is the selected color (it has special scaling)
        if (i === selectedColorIndex) continue;

        // Get current matrix
        instancedMesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        // Determine target scale
        const targetScale = shouldHide ? 0 : 1;
        
        // Only update if scale needs to change
        // Using epsilon for float comparison safety
        if (Math.abs(dummy.scale.x - targetScale) > 0.001) {
            // If recovering from scale 0, decompose() might have produced invalid quaternion.
            // To be safe, we recompute position and reset quaternion.
            const pos = currentColorSpace.getPosition(colorData_item);
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.quaternion.identity();
            dummy.scale.set(targetScale, targetScale, targetScale);
            
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
            needsUpdate = true;
        }
    }

    // Also update picking mesh visibility
    if (pickingMesh) {
        for (let i = 0; i < totalColors; i++) {
            const colorData_item = colorData[i];
            const shouldHide = hideUnflaggedColors && !colorData_item.flag;
            
            if (i === selectedColorIndex) continue;

            pickingMesh.getMatrixAt(i, dummy.matrix);
            dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

            const targetScale = shouldHide ? 0 : 1;
            
            if (Math.abs(dummy.scale.x - targetScale) > 0.001) {
                const pos = currentColorSpace.getPosition(colorData_item);
                dummy.position.set(pos.x, pos.y, pos.z);
                dummy.quaternion.identity();
                dummy.scale.set(targetScale, targetScale, targetScale);

                dummy.updateMatrix();
                pickingMesh.setMatrixAt(i, dummy.matrix);
            }
        }
        pickingMesh.instanceMatrix.needsUpdate = true;
    }

    if (needsUpdate) {
        instancedMesh.instanceMatrix.needsUpdate = true;
    }
}

// update sphere positions based on current color space
async function updateSpherePositions() {
    if (!instancedMesh || !currentColorSpace) return;

    const totalColors = colorData.length;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < totalColors; i++) {
        const colorData_item = colorData[i];
        const pos = currentColorSpace.getPosition(colorData_item);

        dummy.position.set(pos.x, pos.y, pos.z);
        // Set scale based on visibility and selection
        if (i === selectedColorIndex) {
            dummy.scale.set(2.4, 2.4, 2.4);
        } else if (hideUnflaggedColors && !colorData_item.flag) {
            dummy.scale.set(0, 0, 0);
        } else {
            dummy.scale.set(1, 1, 1);
        }
        dummy.updateMatrix();
        
        // Update visible mesh
        instancedMesh.setMatrixAt(i, dummy.matrix);
        color.set(colorData_item.hex);
        instancedMesh.setColorAt(i, color);

        // Update picking mesh with same position but ID-encoded color
        if (pickingMesh) {
            pickingMesh.setMatrixAt(i, dummy.matrix);
            const idColor = indexToColor(i);
            pickingMesh.setColorAt(i, idColor);
        }

        if (i % 1000 === 0) {
            const progress = 70 + (i / totalColors) * 30;
            updateLoadingProgress(progress, `updating positions... ${i}/${totalColors}`);

            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor.needsUpdate = true;
    
    if (pickingMesh) {
        pickingMesh.instanceMatrix.needsUpdate = true;
        pickingMesh.instanceColor.needsUpdate = true;
    }

    // reset selection when switching color spaces
    if (selectedColorIndex >= 0) {
        const dummy = new THREE.Object3D();
        instancedMesh.getMatrixAt(selectedColorIndex, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        // Restore scale based on visibility setting
        const colorData_item = colorData[selectedColorIndex];
        const targetScale = (hideUnflaggedColors && !colorData_item.flag) ? 0 : 1;
        dummy.scale.set(targetScale, targetScale, targetScale);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(selectedColorIndex, dummy.matrix);
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        // Also update picking mesh
        if (pickingMesh) {
            pickingMesh.setMatrixAt(selectedColorIndex, dummy.matrix);
            pickingMesh.instanceMatrix.needsUpdate = true;
        }
        
        selectedColorIndex = -1;
        selectedColor = null;
    }

    // reset orbit point to center
    if (cameraRig) {
        cameraRig.orbitPoint.set(0, 0, 0);
        cameraRig.targetOrbitPoint.set(0, 0, 0);
        cameraRig.distance = 2.5;
        cameraRig.targetDistance = 2.5;
    }

    console.log(`updated positions using ${currentColorSpace.name} color space`);
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

// GPU-based picking: render picking mesh to offscreen buffer and read pixel
function pickColorAtPixel(mouseX, mouseY) {
    if (!pickingMesh || !pickingRenderTarget) return -1;

    // Resize render target to match viewport
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (pickingRenderTarget.width !== width || pickingRenderTarget.height !== height) {
        pickingRenderTarget.setSize(width, height);
    }

    // Store original state
    const originalRenderTarget = renderer.getRenderTarget();
    const originalAutoClear = renderer.autoClear;
    const originalBackground = scene.background;
    
    // Hide visible mesh, show picking mesh
    instancedMesh.visible = false;
    pickingMesh.visible = true;
    
    // Temporarily disable scene background for picking (ensures pure black = no hit)
    scene.background = null;
    
    // Render only picking mesh to offscreen buffer
    renderer.autoClear = true;
    renderer.setRenderTarget(pickingRenderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    
    // Restore state
    pickingMesh.visible = false;
    instancedMesh.visible = true;
    scene.background = originalBackground;
    renderer.setRenderTarget(originalRenderTarget);
    renderer.autoClear = originalAutoClear;

    // Read pixel at mouse position
    const pixelBuffer = new Uint8Array(4);
    const readX = Math.floor(mouseX);
    const readY = height - Math.floor(mouseY) - 1; // Flip Y coordinate
    
    renderer.readRenderTargetPixels(
        pickingRenderTarget,
        readX, readY,
        1, 1,
        pixelBuffer
    );

    // Decode color to index
    const r = pixelBuffer[0];
    const g = pixelBuffer[1];
    const b = pixelBuffer[2];
    
    // If pixel is pure black (0,0,0), no object was hit
    if (r === 0 && g === 0 && b === 0) {
        return -1;
    }
    
    const index = colorToIndex(r, g, b);

    // Validate index
    if (index >= 0 && index < colorData.length) {
        return index;
    }
    
    return -1;
}

function handleColorClick(event) {
    if (!instancedMesh) return;

    const instanceId = pickColorAtPixel(event.clientX, event.clientY);

    if (instanceId >= 0) {
        const color = colorData[instanceId];
        jumpToColor(color, instanceId);
    }
}

function jumpToColor(color, instanceId) {
    if (!currentColorSpace) return;
    
    const pos = currentColorSpace.getPosition(color);
    const targetVec = new THREE.Vector3(pos.x, pos.y, pos.z);
    cameraRig.flyTo(targetVec);
    
    // reset previous selection
    if (selectedColorIndex >= 0 && instancedMesh) {
        const dummy = new THREE.Object3D();
        instancedMesh.getMatrixAt(selectedColorIndex, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        // Restore scale based on visibility setting
        const colorData_item = colorData[selectedColorIndex];
        const targetScale = (hideUnflaggedColors && !colorData_item.flag) ? 0 : 1;
        dummy.scale.set(targetScale, targetScale, targetScale);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(selectedColorIndex, dummy.matrix);
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        // Also update picking mesh
        if (pickingMesh) {
            pickingMesh.setMatrixAt(selectedColorIndex, dummy.matrix);
            pickingMesh.instanceMatrix.needsUpdate = true;
        }
    }

    // highlight the new selection
    selectedColor = color;
    selectedColorIndex = instanceId;

    if (instancedMesh && instanceId >= 0) {
        const dummy = new THREE.Object3D();
        instancedMesh.getMatrixAt(instanceId, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        
        // FIX: If previously hidden (scale ~0), quaternion might be invalid.
        // Reset to safe defaults.
        if (dummy.scale.x < 0.001) {
            dummy.quaternion.identity();
            dummy.position.set(pos.x, pos.y, pos.z);
        }
        
        dummy.scale.set(2.4, 2.4, 2.4);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(instanceId, dummy.matrix);
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        // Also update picking mesh
        if (pickingMesh) {
            pickingMesh.setMatrixAt(instanceId, dummy.matrix);
            pickingMesh.instanceMatrix.needsUpdate = true;
        }
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



// Throttle tooltip updates for performance (GPU picking is fast, but we still throttle to avoid excessive rendering)
let lastTooltipUpdate = 0;
const tooltipThrottleMs = 16; // ~60fps updates

function updateTooltip(event) {
    if (!instancedMesh) return;

    const now = performance.now();
    if (now - lastTooltipUpdate < tooltipThrottleMs) return;
    lastTooltipUpdate = now;

    const tooltip = document.getElementById('tooltip');
    const tooltipName = tooltip.querySelector('.tooltip-name');
    const tooltipHex = tooltip.querySelector('.tooltip-hex');

    const instanceId = pickColorAtPixel(event.clientX, event.clientY);

    if (instanceId >= 0) {
        const color = colorData[instanceId];

        tooltipName.textContent = color.name;
        tooltipHex.textContent = color.hex;

        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 15) + 'px';
        tooltip.style.top = (event.clientY + 15) + 'px';
    } else {
        tooltip.style.display = 'none';
    }
}

function setupEventListeners() {
    // Mouse controls
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Window resize
    window.addEventListener('resize', onWindowResize);

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

        // 1. Strict Search (Substring)
        let potentialMatches = colorData.filter(color => {
            if (hideUnflaggedColors && !color.flag) return false;
            return color.name.toLowerCase().includes(lowerQuery) ||
                   color.hex.toLowerCase().includes(lowerQuery);
        });

        // 2. Fallback to Fuzzy Search if no strict matches
        let isFuzzy = false;
        if (potentialMatches.length === 0) {
            isFuzzy = true;
            // Consider all colors (respecting flags)
            potentialMatches = colorData.filter(c => !hideUnflaggedColors || c.flag);
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
            const colorIndex = colorData.findIndex(c => c.name === topColor.name);
            if (colorIndex >= 0) {
                jumpToColor(colorData[colorIndex], colorIndex);
            }

            // Add click handlers
            searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const colorName = item.getAttribute('data-name');
                    const colorIndex = colorData.findIndex(c => c.name === colorName);
                    if (colorIndex >= 0) {
                        jumpToColor(colorData[colorIndex], colorIndex);
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
                    const colorIndex = colorData.findIndex(c => c.name === selectedColor.name);
                    if (colorIndex >= 0) {
                        jumpToColor(colorData[colorIndex], colorIndex);
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
                    const colorIndex = colorData.findIndex(c => c.name === selectedColor.name);
                    if (colorIndex >= 0) {
                        jumpToColor(colorData[colorIndex], colorIndex);
                    }
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (currentSelectedIndex >= 0 && currentSelectedIndex < currentMatches.length) {
                    const selectedColor = currentMatches[currentSelectedIndex];
                    const colorIndex = colorData.findIndex(c => c.name === selectedColor.name);
                    if (colorIndex >= 0) {
                        jumpToColor(colorData[colorIndex], colorIndex);
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
                await updateSpherePositions();
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
        if (instancedMesh && currentColorSpace) {
            await updateSpherePositions();
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
    hideUnflaggedCheckbox.checked = hideUnflaggedColors;
    
    hideUnflaggedCheckbox.addEventListener('change', (e) => {
        hideUnflaggedColors = e.target.checked;
        updateUnflaggedVisibility();

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

function onMouseDown(event) {
    if (event.button === 0) { // Left click
        handleColorClick(event);
    }
}

function onMouseMove(event) {
    // Handle tooltip on hover
    updateTooltip(event);
}



function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
loadColors();
animate();