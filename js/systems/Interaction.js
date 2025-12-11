export class Interaction {
    /**
     * handles user interaction events including picking and tooltips
     * @param {THREE.WebGLRenderer} renderer - the Three.js renderer
     * @param {THREE.Camera} camera - the scene camera
     * @param {Picker} picker - the color picker instance
     * @param {Object} callbacks - callback functions: { onSelect: (index) => {}, onHover: (index, x, y) => {}, getPickingMesh: () => mesh, getVisualMesh: () => mesh }
     */
    constructor(renderer, camera, picker, callbacks) {
        this.renderer = renderer;
        this.camera = camera;
        this.picker = picker;
        this.callbacks = callbacks;

        this.lastTooltipUpdate = 0;
        this.throttleDelay = 16;

        this._setupEventListeners();
    }

    /**
     * sets up mouse event listeners for picking and tooltips
     * left click performs picking, right click is handled by CameraRig
     */
    _setupEventListeners() {
        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this._handlePick(e.clientX, e.clientY, true);
            }
        });

        this.renderer.domElement.addEventListener('mousemove', (e) => {
            const now = performance.now();
            if (now - this.lastTooltipUpdate < this.throttleDelay) return;
            this.lastTooltipUpdate = now;

            this._handlePick(e.clientX, e.clientY, false);
        });
    }

    /**
     * handles picking at screen coordinates for both clicks and hover
     * @param {number} x - screen X coordinate
     * @param {number} y - screen Y coordinate
     * @param {boolean} isClick - whether this is a click (true) or hover (false)
     */
    _handlePick(x, y, isClick) {
        if (!this.callbacks.getPickingMesh) return;
        const pickingMesh = this.callbacks.getPickingMesh();
        const visualMesh = this.callbacks.getVisualMesh ? this.callbacks.getVisualMesh() : null;

        const index = this.picker.pick(x, y, pickingMesh, visualMesh);

        if (isClick) {
            if (index >= 0 && this.callbacks.onSelect) {
                this.callbacks.onSelect(index);
            }
        } else {
            if (this.callbacks.onHover) {
                this.callbacks.onHover(index, x, y);
            }
        }
    }
}