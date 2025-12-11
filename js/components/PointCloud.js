import * as THREE from 'three';
import { indexToColor } from '../utils.js';

export class PointCloud {
    /**
     * manages instanced meshes for color data visualization and GPU picking
     * @param {THREE.Scene} scene - the Three.js scene to add meshes to
     */
    constructor(scene) {
        this.scene = scene;

        this.data = [];
        this.mesh = null;
        this.pickingMesh = null;

        this.dummy = new THREE.Object3D();
        this.colorHelper = new THREE.Color();

        this.selectedIndex = -1;
        this.hideUnflagged = false;
        this.currentSpace = null;
    }

    /**
     * initializes the point cloud with colour data, creating both visual and picking meshes
     * @param {Array} colorData - array of colour objects to visualize
     */
    init(colorData) {
        this.data = colorData;
        const count = colorData.length;

        const geometry = new THREE.SphereGeometry(0.004, 16, 12);

        const material = new THREE.MeshBasicMaterial();
        this.mesh = new THREE.InstancedMesh(geometry, material, count);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        const pickingMaterial = new THREE.MeshBasicMaterial();
        this.pickingMesh = new THREE.InstancedMesh(geometry, pickingMaterial, count);
        this.pickingMesh.frustumCulled = false;
        this.pickingMesh.visible = false;
        this.scene.add(this.pickingMesh);

        console.log(`PointCloud created with ${count} instances.`);
    }

    /**
     * updates positions and scales for all instances based on colour space
     * processes in chunks to prevent UI freezing during large updates
     * @param {Object} colorSpace - colour space object with getPosition method
     * @param {Function} onProgress - callback for progress updates: (percent, message) => void
     */
    async updatePositions(colorSpace, onProgress) {
        this.currentSpace = colorSpace;
        const count = this.data.length;
        const chunkSize = 1000;

        for (let i = 0; i < count; i++) {
            const colorObj = this.data[i];
            const pos = colorSpace.getPosition(colorObj);

            this.dummy.position.set(pos.x, pos.y, pos.z);
            this.dummy.quaternion.identity();

            const scale = this._calculateScale(i, colorObj);
            this.dummy.scale.set(scale, scale, scale);

            this.dummy.updateMatrix();

            this.mesh.setMatrixAt(i, this.dummy.matrix);
            this.colorHelper.set(colorObj.hex);
            this.mesh.setColorAt(i, this.colorHelper);

            if (this.pickingMesh) {
                this.pickingMesh.setMatrixAt(i, this.dummy.matrix);
                this.pickingMesh.setColorAt(i, indexToColor(i));
            }

            if (i % chunkSize === 0) {
                if (onProgress) {
                    const percent = 70 + (i / count) * 30;
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

    /**
     * updates visibility by scaling instances without recalculating positions
     * @param {boolean} hideUnflagged - whether to hide unflagged colours
     */
    updateVisibility(hideUnflagged) {
        this.hideUnflagged = hideUnflagged;
        const count = this.data.length;
        let needsUpdate = false;

        for (let i = 0; i < count; i++) {
            if (i === this.selectedIndex) continue;

            const colorObj = this.data[i];

            this.mesh.getMatrixAt(i, this.dummy.matrix);
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

            const targetScale = this._calculateScale(i, colorObj);

            if (Math.abs(this.dummy.scale.x - targetScale) > 0.001) {
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

    /**
     * selects a color instance and applies the "pop" scale effect
     * @param {number} index - index of the color to select, or -1 to deselect
     */
    selectIndex(index) {
        const oldIndex = this.selectedIndex;

        this.selectedIndex = index;

        if (oldIndex !== -1 && oldIndex !== index) {
            this._updateSingleInstance(oldIndex);
        }

        if (this.selectedIndex !== -1) {
            this._updateSingleInstance(this.selectedIndex);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.pickingMesh) this.pickingMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * updates a single instance's scale based on current selection and visibility rules
     * @param {number} index - index of the instance to update
     */
    _updateSingleInstance(index) {
        const colorObj = this.data[index];

        this.mesh.getMatrixAt(index, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

        if (this.dummy.scale.x < 0.001) this.dummy.quaternion.identity();

        const scale = this._calculateScale(index, colorObj);
        this.dummy.scale.set(scale, scale, scale);
        this.dummy.updateMatrix();

        this.mesh.setMatrixAt(index, this.dummy.matrix);
        if (this.pickingMesh) this.pickingMesh.setMatrixAt(index, this.dummy.matrix);
    }

    /**
     * calculates the scale for a color instance based on selection and visibility rules
     * @param {number} index - index of the instance
     * @param {Object} colorObj - colour data object
     * @returns {number} scale factor (0 = hidden, 1 = normal, 2.4 = selected)
     */
    _calculateScale(index, colorObj) {
        if (index === this.selectedIndex) return 2.4;
        if (this.hideUnflagged && !colorObj.flag) return 0;
        return 1.0;
    }

    /**
     * returns the 3D position of a color instance in the current color space
     * @param {number} index - index of the colour instance
     * @returns {THREE.Vector3|null} position vector or null if index is invalid
     */
    getBounds(index) {
        if (index < 0 || index >= this.data.length) return null;
        const pos = this.currentSpace.getPosition(this.data[index]);
        return new THREE.Vector3(pos.x, pos.y, pos.z);
    }
}