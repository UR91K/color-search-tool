import * as THREE from 'three';
import { colorSpaces } from './config.js';
import { Renderer } from './systems/Renderer.js';
import { CameraRig } from './systems/CameraRig.js';
import { Picker } from './systems/Picker.js';
import { Interaction } from './systems/Interaction.js';
import { PointCloud } from './components/PointCloud.js';
import { UIManager } from './ui/UIManager.js';
import { ColorLoader } from './data/ColorLoader.js';

// Globals
let graphics, cameraRig, pointCloud, picker, interaction, ui;
let currentColorSpaceName = 'oklab'; // Track state
let currentScale = 1.0;

const clock = new THREE.Clock();

function init() {
    // 1. Setup Graphics
    graphics = new Renderer('canvas-container');

    // 2. Setup Systems
    cameraRig = new CameraRig(graphics.camera, graphics.renderer.domElement);
    pointCloud = new PointCloud(graphics.scene);
    picker = new Picker(graphics.renderer, graphics.scene, graphics.camera);

    // 3. Setup UI (The Brain)
    ui = new UIManager({
        // Search/Select Callback
        onSelect: (index) => {
            const color = pointCloud.data[index];
            if (color) {
                pointCloud.selectIndex(index);
                const pos = pointCloud.getBounds(index);
                if (pos) cameraRig.flyTo(pos);
                console.log(`Selected: ${color.name}`);
            }
        },

        // Color Space Switcher
        onSpaceChange: async (spaceName) => {
            if (colorSpaces[spaceName]) {
                currentColorSpaceName = spaceName;
                const space = colorSpaces[spaceName];
                
                // IMPORTANT: Apply the current scale slider value to the space definition
                space.scale = currentScale * 4.0; // Assuming 4.0 is base scale

                ui.updateLoading(0, `Switching to ${space.name}...`);
                document.getElementById('loading').style.display = 'block';
                
                await pointCloud.updatePositions(space, (p, t) => ui.updateLoading(p, t));
                
                ui.updateLoading(100, 'Complete!');
            }
        },

        // Scale Slider
        onScaleChange: async (newVal) => {
            currentScale = newVal;
            const space = colorSpaces[currentColorSpaceName];
            if (space) {
                // Update the scaling factor in the space definition
                space.scale = currentScale * 4.0; 
                
                // We don't show loading bar for slider drag usually, 
                // but updatePositions is async.
                await pointCloud.updatePositions(space);
            }
        },

        // Background Sliders
        onBackgroundChange: (h, s, v) => {
            graphics.setBackground(h, s, v);
        },

        // Checkboxes
        onToggleVisibility: (hide) => {
            pointCloud.updateVisibility(hide);
        },
        onToggleAxes: (show) => {
            graphics.setAxesVisibility(show);
        }
    });

    // 4. Setup Interaction (Mouse Hover/Click)
    interaction = new Interaction(graphics.renderer, graphics.camera, picker, {
        getPickingMesh: () => pointCloud.pickingMesh,
        getVisualMesh: () => pointCloud.mesh,
        
        onSelect: (index) => {
            // Re-use UI logic
            const color = pointCloud.data[index];
            if (color) {
                pointCloud.selectIndex(index);
                const pos = pointCloud.getBounds(index);
                cameraRig.flyTo(pos);
            }
        },
        
        onHover: (index, x, y) => {
            if (index >= 0) {
                const color = pointCloud.data[index];
                ui.showTooltip(x, y, color.name, color.hex);
            } else {
                ui.hideTooltip();
            }
        }
    });

    // 5. Start Loading
    loadData();
    animate();
}

function updateLoadingProgress(percent, status) {
    const loadingBar = document.getElementById('loading-bar');
    const loadingStatus = document.getElementById('loading-status');
    if (loadingBar) loadingBar.style.width = percent + '%';
    if (loadingStatus) loadingStatus.textContent = status;
}

async function loadData() {
    try {
        const data = await ColorLoader.load('../data/colors_oklab.csv', (p, s) => ui.updateLoading(p, s));
        
        // Give data to systems
        ui.setData(data);
        pointCloud.init(data);

        // Initial Layout
        const startSpace = colorSpaces[currentColorSpaceName];
        startSpace.scale = currentScale * 4.0; 
        
        await pointCloud.updatePositions(startSpace, (p, s) => ui.updateLoading(p, s));
        
        ui.updateLoading(100, 'Done!');
    } catch (e) {
        console.error(e);
        // UI error handling logic
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dt = new THREE.Clock().getDelta(); // Or keep global clock
    
    if (cameraRig) cameraRig.update(dt);
    if (graphics) graphics.render();
}

init();