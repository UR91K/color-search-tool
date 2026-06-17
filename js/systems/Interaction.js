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
        this._setupTouchListeners();
    }

    _setupEventListeners() {
        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this._handlePick(e.clientX, e.clientY, true, false);
            }
        });

        this.renderer.domElement.addEventListener('mousemove', (e) => {
            const now = performance.now();
            if (now - this.lastTooltipUpdate < this.throttleDelay) return;
            this.lastTooltipUpdate = now;

            this._handlePick(e.clientX, e.clientY, false, false);
        });
    }

    _setupTouchListeners() {
        this._tapStart = null;

        this.renderer.domElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this._tapStart = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                    time: performance.now()
                };
            } else {
                this._tapStart = null;
            }
        });

        this.renderer.domElement.addEventListener('touchend', (e) => {
            if (!this._tapStart || e.changedTouches.length !== 1) return;

            const touch = e.changedTouches[0];
            const dx = touch.clientX - this._tapStart.x;
            const dy = touch.clientY - this._tapStart.y;
            const dt = performance.now() - this._tapStart.time;

            if (Math.sqrt(dx * dx + dy * dy) < 10 && dt < 250) {
                this._handlePick(touch.clientX, touch.clientY, true, true);
            }

            this._tapStart = null;
        });
    }

    /**
     * @param {boolean} isTap - true when triggered by a touch tap (uses onTap callback)
     */
    _handlePick(x, y, isClick, isTap) {
        if (!this.callbacks.getPickingMesh) return;
        const pickingMesh = this.callbacks.getPickingMesh();
        const visualMesh = this.callbacks.getVisualMesh ? this.callbacks.getVisualMesh() : null;

        const index = this.picker.pick(x, y, pickingMesh, visualMesh);

        if (isClick) {
            if (index >= 0) {
                if (isTap && this.callbacks.onTap) {
                    this.callbacks.onTap(index);
                } else if (this.callbacks.onSelect) {
                    this.callbacks.onSelect(index);
                }
            } else if (isTap && this.callbacks.onTapMiss) {
                this.callbacks.onTapMiss();
            }
        } else {
            if (this.callbacks.onHover) {
                this.callbacks.onHover(index, x, y);
            }
        }
    }
}