import * as THREE from 'three';
import { colorSpaces } from './config.js';
import { Renderer } from './systems/Renderer.js';
import { CameraRig } from './systems/CameraRig.js';
import { Picker } from './systems/Picker.js';
import { Interaction } from './systems/Interaction.js';
import { PointCloud } from './components/PointCloud.js';
import { UIManager } from './ui/UIManager.js';
import { ColorLoader } from './data/ColorLoader.js';

let graphics, cameraRig, pointCloud, picker, interaction, ui;
let currentColorSpaceName = 'oklab';
let currentScale = 1.0;

const clock = new THREE.Clock();

function init() {
    graphics = new Renderer('canvas-container');

    cameraRig = new CameraRig(graphics.camera, graphics.renderer.domElement);
    pointCloud = new PointCloud(graphics.scene);
    picker = new Picker(graphics.renderer, graphics.scene, graphics.camera);

    ui = new UIManager({
        onSelect: (index) => {
            const color = pointCloud.data[index];
            if (color) {
                pointCloud.selectIndex(index);
                const pos = pointCloud.getBounds(index);
                if (pos) cameraRig.flyTo(pos);
                console.log(`Selected: ${color.name}`);
            }
        },

        onSpaceChange: async (spaceName) => {
            if (colorSpaces[spaceName]) {
                currentColorSpaceName = spaceName;
                const space = colorSpaces[spaceName];
                
                space.scale = currentScale;

                ui.updateLoading(0, `Switching to ${space.name}...`);
                document.getElementById('loading').style.display = 'block';
                
                await pointCloud.updatePositions(space, (p, t) => ui.updateLoading(p, t));
                
                ui.updateLoading(100, 'Complete!');
            }
        },

        onScaleChange: async (newVal) => {
            currentScale = newVal;
            const space = colorSpaces[currentColorSpaceName];
            if (space) {
                space.scale = currentScale; 
                
                // updatePositions is async because it needs to talk to a loading bar when changing colour space
                await pointCloud.updatePositions(space);
            }
        },

        onBackgroundChange: (h, s, v) => {
            graphics.setBackground(h, s, v);
        },

        onToggleVisibility: (hide) => {
            pointCloud.updateVisibility(hide);
        },
        onToggleAxes: (show) => {
            graphics.setAxesVisibility(show);
        }
    });

    interaction = new Interaction(graphics.renderer, graphics.camera, picker, {
        getPickingMesh: () => pointCloud.pickingMesh,
        getVisualMesh: () => pointCloud.mesh,
        
        onSelect: (index) => {
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
        
        ui.setData(data);
        pointCloud.init(data);

        const startSpace = colorSpaces[currentColorSpaceName];
        startSpace.scale = currentScale; 
        
        await pointCloud.updatePositions(startSpace, (p, s) => ui.updateLoading(p, s));
        
        ui.updateLoading(100, 'Done!');
    } catch (e) {
        console.error(e);
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    
    if (cameraRig) cameraRig.update(dt);
    if (graphics) graphics.render();
}

init();