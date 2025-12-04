import * as THREE from 'three';
import { colorToIndex, indexToColor } from '../utils.js'; // Ensure these are exported from utils

export class Picker {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.pickingRenderTarget = new THREE.WebGLRenderTarget(1, 1);
        this.pixelBuffer = new Uint8Array(4);
    }

    // Returns the index of the instance at mouse coordinates (x, y), or -1
    pick(cssX, cssY, pickingMesh, meshToHide) {
        if (!pickingMesh) return -1;

        // 1. Resize render target if window size changed
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (this.pickingRenderTarget.width !== width || this.pickingRenderTarget.height !== height) {
            this.pickingRenderTarget.setSize(width, height);
        }

        // 2. Save original renderer state
        const originalRenderTarget = this.renderer.getRenderTarget();
        const originalAutoClear = this.renderer.autoClear;
        const originalBackground = this.scene.background;

        // 3. Prepare Scene for Picking
        // We assume the main 'instancedMesh' is hidden by the caller or we handle visibility here.
        // For safety, we can toggle visibility if passed both meshes, 
        // but typically we just ensure pickingMesh is the only thing visible during this frame.
        
        const parent = pickingMesh.parent; // usually the scene
        // Isolate picking mesh
        pickingMesh.visible = true;
        if (meshToHide) meshToHide.visible = false;
        this.scene.background = null; // Clear background ensures 0,0,0 is "nothing"

        // 4. Render to off-screen texture
        this.renderer.autoClear = true;
        this.renderer.setRenderTarget(this.pickingRenderTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        // 5. Read Pixel
        // WebGL reads from bottom-left, CSS is top-left
        const readX = Math.floor(cssX);
        const readY = height - Math.floor(cssY) - 1; 

        this.renderer.readRenderTargetPixels(
            this.pickingRenderTarget,
            readX, readY,
            1, 1,
            this.pixelBuffer
        );

        // 6. Restore original state
        pickingMesh.visible = false;
        if (meshToHide) meshToHide.visible = true;
        this.scene.background = originalBackground;
        this.renderer.setRenderTarget(originalRenderTarget);
        this.renderer.autoClear = originalAutoClear;

        // 7. Decode Color to Index
        const [r, g, b] = this.pixelBuffer;
        if (r === 0 && g === 0 && b === 0) return -1;

        return colorToIndex(r, g, b);
    }
}