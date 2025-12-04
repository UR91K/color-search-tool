import * as THREE from 'three';

export class Renderer {
    constructor(containerId) {
        // 1. Setup Scene
        this.scene = new THREE.Scene();
        
        // 2. Setup Camera
        // We set a default position, but CameraRig will immediately override it
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.01, 
            1000
        );

        // 3. Setup WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            logarithmicDepthBuffer: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Append to DOM
        const container = document.getElementById(containerId);
        if (container) {
            container.appendChild(this.renderer.domElement);
        } else {
            console.error(`Container ID "${containerId}" not found.`);
        }

        // 4. Setup Lights
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.pointLight = new THREE.PointLight(0xffffff, 0.8);
        this.pointLight.position.set(10, 10, 10);
        this.scene.add(this.pointLight);

        // 5. Helpers
        this.axesHelper = new THREE.AxesHelper(1);
        this.axesHelper.visible = false; // Hidden by default
        this.scene.add(this.axesHelper);

        // 6. Initial Background
        this.setBackground(0, 0, 3); // Default dark background
        
        // Handle Resize automatically (Self-contained)
        // Note: If Interaction.js also handles resize, you can remove this listener 
        // to avoid double-firing, but it's safest for the Renderer to own its size.
        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    setAxesVisibility(visible) {
        this.axesHelper.visible = visible;
    }

    // Handles the HSV -> RGB conversion for the background
    setBackground(h, s, v) {
        const hue = h / 360;
        const saturation = s / 100;
        const value = v / 100;
        
        // HSV to RGB conversion
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