import * as THREE from 'three';
import { colorToIndex, indexToColor } from '../utils.js'; // Ensure these are exported from utils

export class Picker {
    /**
     * handles GPU accelerated picking using color encoding
     * @param {THREE.WebGLRenderer} renderer - the Three.js renderer
     * @param {THREE.Scene} scene - the scene containing pickable objects
     * @param {THREE.Camera} camera - the scene camera
     */
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.pickingRenderTarget = new THREE.WebGLRenderTarget(1, 1);
        this.pixelBuffer = new Uint8Array(4);
    }

    /**
     * returns the index of the instance at mouse coordinates, or -1 if nothing picked
     * 
     * uses off screen rendering with color encoded instance IDs
     * @param {number} cssX - CSS X coordinate (top left origin)
     * @param {number} cssY - CSS Y coordinate (top left origin)
     * @param {THREE.Mesh} pickingMesh - the mesh with color encoded instance data
     * @param {THREE.Mesh} meshToHide - optional mesh to hide during picking
     * @returns {number} instance index or -1 if no pick
     */
    pick(cssX, cssY, pickingMesh, meshToHide) {
        if (!pickingMesh) return -1;

        const width = window.innerWidth;
        const height = window.innerHeight;
        if (this.pickingRenderTarget.width !== width || this.pickingRenderTarget.height !== height) {
            this.pickingRenderTarget.setSize(width, height);
        }

        const originalRenderTarget = this.renderer.getRenderTarget();
        const originalAutoClear = this.renderer.autoClear;
        const originalBackground = this.scene.background;

        pickingMesh.visible = true;
        if (meshToHide) meshToHide.visible = false;
        this.scene.background = null;

        this.renderer.autoClear = true;
        this.renderer.setRenderTarget(this.pickingRenderTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        const readX = Math.floor(cssX);
        const readY = height - Math.floor(cssY) - 1;

        this.renderer.readRenderTargetPixels(
            this.pickingRenderTarget,
            readX, readY,
            1, 1,
            this.pixelBuffer
        );

        pickingMesh.visible = false;
        if (meshToHide) meshToHide.visible = true;
        this.scene.background = originalBackground;
        this.renderer.setRenderTarget(originalRenderTarget);
        this.renderer.autoClear = originalAutoClear;

        const [r, g, b] = this.pixelBuffer;
        if (r === 0 && g === 0 && b === 0) return -1;

        return colorToIndex(r, g, b);
    }
}