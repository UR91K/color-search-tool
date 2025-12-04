import * as THREE from 'three';

export class CameraRig {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // State: Positioning
        this.orbitPoint = new THREE.Vector3(0, 0, 0);
        this.distance = 2.5;
        this.angles = { theta: 0, phi: Math.PI / 4 };

        // State: Animation Targets
        this.targetOrbitPoint = new THREE.Vector3(0, 0, 0);
        this.targetDistance = 2.5;
        this.isAnimatingOrbit = false;
        this.isAnimatingDistance = false;

        // State: Physics
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.friction = 4.0;
        
        // This replaces the hardcoded 'moveAcceleration'. 
        // We will multiply this by distance dynamically.
        this.baseMoveSpeed = 0.5; 

        // State: Input
        this.keys = {};
        this.isDragging = false;
        this.prevMouse = { x: 0, y: 0 };

        this._setupEventListeners();
    }

    // Call this from your main animate loop
    update(deltaTime) {
        // 1. Calculate dynamic acceleration based on zoom level
        // If we are far away (distance 10), we move fast. Close up (distance 0.1), we move slow.
        const currentAccel = Math.max(0.5, this.distance * 2.0); 

        // 2. Handle Physics (WASD Movement)
        this._updatePhysics(deltaTime, currentAccel);

        // 3. Handle Smooth Transitions (FlyTo)
        this._updateAnimations();

        // 4. Update Three.js Camera Transform
        this._updateCameraTransform();
    }

    // Public API to jump to a specific spot (used by Search/Click)
    flyTo(targetPosition) {
        this.targetOrbitPoint.copy(targetPosition);
        this.targetDistance = 0.2; // Zoom in close
        
        this.isAnimatingOrbit = true;
        this.isAnimatingDistance = true;
    }

    _updatePhysics(deltaTime, acceleration) {
        const moveDir = new THREE.Vector3(0, 0, 0);

        // Get Camera Forward/Right vectors (ignoring Y tilt for movement consistency)
        const front = new THREE.Vector3();
        this.camera.getWorldDirection(front);
        front.y = 0; // Project to ground plane usually feels better, or remove this line for free-fly
        front.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(front, new THREE.Vector3(0, 1, 0)).normalize();

        // Keyboard Input
        if (this.keys['w'] || this.keys['W']) moveDir.add(front);
        if (this.keys['s'] || this.keys['S']) moveDir.sub(front);
        if (this.keys['a'] || this.keys['A']) moveDir.sub(right);
        if (this.keys['d'] || this.keys['D']) moveDir.add(right);
        if (this.keys[' '] || this.keys['Shift']) moveDir.y += 1; // Up
        if (this.keys['Control']) moveDir.y -= 1; // Down

        // Apply Acceleration
        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(acceleration * deltaTime);
            this.velocity.add(moveDir);
        }

        // Apply Friction
        const speed = this.velocity.length();
        if (speed > 0) {
            const drop = speed * this.friction * deltaTime;
            const newSpeed = Math.max(0, speed - drop);
            if (newSpeed !== speed) {
                this.velocity.multiplyScalar(newSpeed / speed);
            }
        }

        // Apply Velocity
        if (this.velocity.lengthSq() > 0) {
            this.orbitPoint.add(this.velocity.clone().multiplyScalar(deltaTime));
        }
    }

    _updateAnimations() {
        // Smoothly interpolate orbit point
        if (this.isAnimatingOrbit) {
            this.orbitPoint.lerp(this.targetOrbitPoint, 0.1);
            if (this.orbitPoint.distanceTo(this.targetOrbitPoint) < 0.001) {
                this.isAnimatingOrbit = false;
            }
        }

        // Smoothly interpolate distance
        if (this.isAnimatingDistance) {
            this.distance += (this.targetDistance - this.distance) * 0.1;
            if (Math.abs(this.targetDistance - this.distance) < 0.001) {
                this.isAnimatingDistance = false;
            }
        }
    }

    _updateCameraTransform() {
        const x = this.orbitPoint.x + this.distance * Math.sin(this.angles.phi) * Math.cos(this.angles.theta);
        const y = this.orbitPoint.y + this.distance * Math.cos(this.angles.phi);
        const z = this.orbitPoint.z + this.distance * Math.sin(this.angles.phi) * Math.sin(this.angles.theta);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.orbitPoint);
    }

    _setupEventListeners() {
        // Mouse Drag (Orbit)
        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) { // Right Click
                this.isDragging = true;
                this.prevMouse = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.prevMouse.x;
                const deltaY = e.clientY - this.prevMouse.y;

                this.angles.theta += deltaX * 0.005;
                this.angles.phi += deltaY * 0.005;

                // Clamp Phi to avoid flipping over
                this.angles.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.angles.phi));

                this.prevMouse = { x: e.clientX, y: e.clientY };
            }
        });

        // Zoom
        this.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // If user manually zooms, cancel any auto-zoom animations
            if (this.isAnimatingDistance) {
                this.isAnimatingDistance = false;
            }

            const delta = e.deltaY * 0.001;
            this.distance = Math.max(0.1, Math.min(20, this.distance + delta));
            // Note: We don't need to set acceleration here anymore. 
            // The update() loop handles it automatically based on this.distance.
        }, { passive: false });

        // Keys
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }
}