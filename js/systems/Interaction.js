export class Interaction {
    constructor(renderer, camera, picker, callbacks) {
        this.renderer = renderer;
        this.camera = camera;
        this.picker = picker;
        
        // Callbacks expected: { onSelect: (index) => {}, onHover: (index, x, y) => {} }
        this.callbacks = callbacks;

        this.lastTooltipUpdate = 0;
        this.throttleDelay = 16; // ~60fps

        this._setupEventListeners();
    }

    _setupEventListeners() {
        // 1. Prevent Context Menu
        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        // 2. Click Handler (Picking)
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            // Only Left Click (0). Right click is for CameraRig.
            if (e.button === 0) {
                this._handlePick(e.clientX, e.clientY, true);
            }
        });

        // 3. Hover Handler (Tooltips)
        this.renderer.domElement.addEventListener('mousemove', (e) => {
            const now = performance.now();
            if (now - this.lastTooltipUpdate < this.throttleDelay) return;
            this.lastTooltipUpdate = now;

            this._handlePick(e.clientX, e.clientY, false);
        });
    }

    _handlePick(x, y, isClick) {
        // We need access to the picking mesh. 
        // Ideally, Main passes this reference, or we look it up.
        // For now, let's assume Main attached it to the scene with a specific name 
        // or we pass it via a getter.
        // A cleaner way: The 'picker' needs the mesh. Let's assume Main exposes 'getPickingMesh()'
        
        if (!this.callbacks.getPickingMesh) return;
        const pickingMesh = this.callbacks.getPickingMesh();
        const visualMesh = this.callbacks.getVisualMesh ? this.callbacks.getVisualMesh() : null;

        // Perform the pick
        // We temporarily hide the visual mesh inside the Picker logic, 
        // OR we handle visibility swapping here.
        // Let's assume Picker handles the "Render Loop" isolation.
        
        // Note: We need to hide the visual mesh for a split second for the picker 
        // if they occupy the same space.
        // However, the Picker.js provided handles visibility of the *PickingMesh*.
        // We just need to make sure the *VisualMesh* doesn't block it if we are using z-buffer.
        // Since we are clearing the background and rendering ONLY the picking mesh in Picker.js,
        // we essentially just need to pass the PickingMesh object.
        
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