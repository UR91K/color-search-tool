import * as THREE from 'three';
import { indexToColor } from '../utils.js';

export class PointCloud {
    constructor(scene) {
        this.scene = scene;
        
        this.data = []; // The raw color objects
        this.mesh = null; // The visible spheres
        this.pickingMesh = null; // The invisible spheres for GPU picking
        
        // Helper objects to avoid garbage collection during updates
        this.dummy = new THREE.Object3D();
        this.colorHelper = new THREE.Color();
        
        // State
        this.selectedIndex = -1;
        this.hideUnflagged = false;
        this.currentSpace = null;
    }

    init(colorData) {
        this.data = colorData;
        const count = colorData.length;
        
        // 1. Geometry (Shared)
        const geometry = new THREE.SphereGeometry(0.004, 16, 12);

        // 2. Visual Mesh
        const material = new THREE.MeshBasicMaterial();
        this.mesh = new THREE.InstancedMesh(geometry, material, count);
        this.mesh.frustumCulled = false; // Instances are everywhere, so disable culling
        this.scene.add(this.mesh);

        // 3. Picking Mesh
        // We use BasicMaterial because lighting changes colors, breaking ID encoding
        const pickingMaterial = new THREE.MeshBasicMaterial();
        this.pickingMesh = new THREE.InstancedMesh(geometry, pickingMaterial, count);
        this.pickingMesh.frustumCulled = false;
        this.pickingMesh.visible = false; // Hidden by default
        this.scene.add(this.pickingMesh);

        console.log(`PointCloud created with ${count} instances.`);
    }

    // Async method to prevent UI freezing during massive updates
    async updatePositions(colorSpace, onProgress) {
        this.currentSpace = colorSpace;
        const count = this.data.length;
        const chunkSize = 1000;

        for (let i = 0; i < count; i++) {
            const colorObj = this.data[i];
            const pos = colorSpace.getPosition(colorObj);

            // Position
            this.dummy.position.set(pos.x, pos.y, pos.z);
            this.dummy.quaternion.identity();

            // Scale (Logic: Is it selected? Is it hidden?)
            const scale = this._calculateScale(i, colorObj);
            this.dummy.scale.set(scale, scale, scale);
            
            this.dummy.updateMatrix();

            // Apply to Visual Mesh
            this.mesh.setMatrixAt(i, this.dummy.matrix);
            this.colorHelper.set(colorObj.hex);
            this.mesh.setColorAt(i, this.colorHelper);

            // Apply to Picking Mesh
            // Picking mesh MUST match position/scale of visual mesh
            if (this.pickingMesh) {
                this.pickingMesh.setMatrixAt(i, this.dummy.matrix);
                // Encode Index into Color
                this.pickingMesh.setColorAt(i, indexToColor(i));
            }

            // Yield to main thread every chunk to update UI/Progress
            if (i % chunkSize === 0) {
                if (onProgress) {
                    const percent = 70 + (i / count) * 30; // Assuming this runs after parsing (which was 0-70%)
                    onProgress(percent, `Updating positions... ${i}/${count}`);
                }
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor.needsUpdate = true;
        
        if (this.pickingMesh) {
            this.pickingMesh.instanceMatrix.needsUpdate = true;
            this.pickingMesh.instanceColor.needsUpdate = true;
        }
    }

    // Fast update for toggling visibility (doesn't recalculate positions)
    updateVisibility(hideUnflagged) {
        this.hideUnflagged = hideUnflagged;
        const count = this.data.length;
        let needsUpdate = false;

        for (let i = 0; i < count; i++) {
            // Skip the selected item, it has its own scale rules
            if (i === this.selectedIndex) continue;

            const colorObj = this.data[i];
            
            // We need to read the current matrix to keep the position, 
            // but change the scale.
            this.mesh.getMatrixAt(i, this.dummy.matrix);
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

            const targetScale = this._calculateScale(i, colorObj);

            // Optimization: Only update if scale actually changed
            if (Math.abs(this.dummy.scale.x - targetScale) > 0.001) {
                // Reset quaternion to identity if we are scaling up from 0
                // (Decomposing a 0-scale matrix results in garbage rotation)
                if (this.dummy.scale.x < 0.001) this.dummy.quaternion.identity();

                this.dummy.scale.set(targetScale, targetScale, targetScale);
                this.dummy.updateMatrix();

                this.mesh.setMatrixAt(i, this.dummy.matrix);
                if (this.pickingMesh) this.pickingMesh.setMatrixAt(i, this.dummy.matrix);
                
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.mesh.instanceMatrix.needsUpdate = true;
            if (this.pickingMesh) this.pickingMesh.instanceMatrix.needsUpdate = true;
        }
    }

    // Handles the "pop" effect when selecting a color
    selectIndex(index) {
        // 1. Reset previous selection (scale it back down)
        if (this.selectedIndex !== -1 && this.selectedIndex !== index) {
            this._updateSingleInstance(this.selectedIndex);
        }

        this.selectedIndex = index;

        // 2. Scale up new selection
        if (this.selectedIndex !== -1) {
            this._updateSingleInstance(this.selectedIndex);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.pickingMesh) this.pickingMesh.instanceMatrix.needsUpdate = true;
    }

    // Internal helper to update one specific dot based on current state rules
    _updateSingleInstance(index) {
        const colorObj = this.data[index];
        
        // Re-calculate Matrix
        this.mesh.getMatrixAt(index, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

        // Fix rotation if previously hidden
        if (this.dummy.scale.x < 0.001) this.dummy.quaternion.identity();

        const scale = this._calculateScale(index, colorObj);
        this.dummy.scale.set(scale, scale, scale);
        this.dummy.updateMatrix();

        this.mesh.setMatrixAt(index, this.dummy.matrix);
        if (this.pickingMesh) this.pickingMesh.setMatrixAt(index, this.dummy.matrix);
    }

    _calculateScale(index, colorObj) {
        // Rule 1: Selected item is always big
        if (index === this.selectedIndex) return 2.4;
        
        // Rule 2: Hidden items are 0
        if (this.hideUnflagged && !colorObj.flag) return 0;
        
        // Rule 3: Default
        return 1.0;
    }

    getBounds(index) {
        if (index < 0 || index >= this.data.length) return null;
        // Re-calculate position from data to be safe, or extract from matrix
        // Calculating from data is more precise than extracting from matrix
        const pos = this.currentSpace.getPosition(this.data[index]);
        return new THREE.Vector3(pos.x, pos.y, pos.z);
    }
}