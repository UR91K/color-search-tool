import * as THREE from 'three';

export class Renderer {
    /**
     * initializes the Three.js scene, camera, renderer, lights, and DOM integration
     * 
     * handles automatic resize events and sets up default dark background
     * @param {string} containerId - DOM element ID to append the canvas to
     */
    constructor(containerId) {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.01,
            1000
        );

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            logarithmicDepthBuffer: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        const container = document.getElementById(containerId);
        if (container) {
            container.appendChild(this.renderer.domElement);
        } else {
            console.error(`Container ID "${containerId}" not found.`);
        }

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.pointLight = new THREE.PointLight(0xffffff, 0.8);
        this.pointLight.position.set(10, 10, 10);
        this.scene.add(this.pointLight);

        this.axesHelper = new THREE.AxesHelper(1);
        this.axesHelper.visible = false;
        this.scene.add(this.axesHelper);

        this.setBackground(0, 0, 3);

        window.addEventListener('resize', () => this.onResize());
    }

    /**
     * updates camera aspect ratio and renderer size when window resizes
     */
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * renders the current scene with the camera
     */
    render() {
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * shows or hides the coordinate axes helper
     * @param {boolean} visible - whether to show the axes
     */
    setAxesVisibility(visible) {
        this.axesHelper.visible = visible;
    }

    /**
     * sets the scene background color using HSV values
     * @param {number} h - hue (0-360)
     * @param {number} s - saturation (0-100)
     * @param {number} v - value (0-100)
     */
    setBackground(h, s, v) {
        const hue = h / 360;
        const saturation = s / 100;
        const value = v / 100;

        const i = Math.floor(hue * 6);
        const f = hue * 6 - i;
        const p = value * (1 - saturation);
        const q = value * (1 - f * saturation);
        const t = value * (1 - (1 - f) * saturation);
        
        let r, g, b;
        switch (i % 6) {
            case 0: r = value; g = t; b = p; break;
            case 1: r = q; g = value; b = p; break;
            case 2: r = p; g = value; b = t; break;
            case 3: r = p; g = q; b = value; break;
            case 4: r = t; g = p; b = value; break;
            case 5: r = value; g = p; b = q; break;
        }
        
        this.scene.background = new THREE.Color(r, g, b);
    }
}