import * as THREE from 'three';

export class CameraRig {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.orbitPoint = new THREE.Vector3(0, 0, 0);
        this.distance = 2.5;
        this.angles = { theta: 0, phi: Math.PI / 4 };

        this.targetOrbitPoint = new THREE.Vector3(0, 0, 0);
        this.targetDistance = 2.5;
        this.isAnimatingOrbit = false;
        this.isAnimatingDistance = false;

        this.velocity = new THREE.Vector3(0, 0, 0);
        this.friction = 4.0;
        this.baseMoveSpeed = 0.5;

        this.keys = {};
        this.isDragging = false;
        this.prevMouse = { x: 0, y: 0 };

        this._setupEventListeners();
    }

    /**
     * updates the camera rig physics, animations, and transform
     * called from the main animation loop each frame
     * @param {number} deltaTime - time elapsed since last update in seconds
     */
    update(deltaTime) {
        const currentAccel = Math.max(0.5, this.distance * 2.0);

        this._updatePhysics(deltaTime, currentAccel);
        this._updateAnimations();
        this._updateCameraTransform();
    }

    /**
     * animates the camera to fly to a target position
     * 
     * used when scrolling search results or clicking on a color
     * @param {THREE.Vector3} targetPosition - the position to fly the camera to
     */
    flyTo(targetPosition) {
        this.targetOrbitPoint.copy(targetPosition);
        this.targetDistance = 0.1;
        this.velocity.set(0, 0, 0);

        this.isAnimatingOrbit = true;
        this.isAnimatingDistance = true;
    }

    /**
     * updates physics simulation for camera movement including WASD controls and momentum
     * @param {number} deltaTime - time elapsed since last update
     * @param {number} acceleration - current acceleration based on zoom level
     */
    _updatePhysics(deltaTime, acceleration) {
        const moveDir = new THREE.Vector3(0, 0, 0);

        const front = new THREE.Vector3();
        this.camera.getWorldDirection(front);
        front.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(front, new THREE.Vector3(0, 1, 0)).normalize();

        if (this.keys['w'] || this.keys['W']) moveDir.add(front);
        if (this.keys['s'] || this.keys['S']) moveDir.sub(front);
        if (this.keys['a'] || this.keys['A']) moveDir.sub(right);
        if (this.keys['d'] || this.keys['D']) moveDir.add(right);

        if (moveDir.lengthSq() > 0) {
            if (this.isAnimatingOrbit) {
                const displacement = new THREE.Vector3()
                    .subVectors(this.orbitPoint, this.targetOrbitPoint)
                    .multiplyScalar(0.1);

                if (deltaTime > 0.001) {
                    const animVel = displacement.divideScalar(deltaTime);
                    animVel.multiplyScalar(0.5);
                    this.velocity.add(animVel);
                }

                this.isAnimatingOrbit = false;
                this.isAnimatingDistance = false;
            }

            moveDir.normalize().multiplyScalar(acceleration * deltaTime);
            this.velocity.add(moveDir);
        }

        const speed = this.velocity.length();
        if (speed > 0) {
            const drop = speed * this.friction * deltaTime;
            const newSpeed = Math.max(0, speed - drop);
            if (newSpeed !== speed) {
                this.velocity.multiplyScalar(newSpeed / speed);
            }
        }

        if (this.velocity.lengthSq() > 0) {
            this.orbitPoint.add(this.velocity.clone().multiplyScalar(deltaTime));
        }
    }

    /**
     * updates smooth interpolation animations for orbit point and distance
     */
    _updateAnimations() {
        if (this.isAnimatingOrbit) {
            this.orbitPoint.lerp(this.targetOrbitPoint, 0.1);
            if (this.orbitPoint.distanceTo(this.targetOrbitPoint) < 0.001) {
                this.isAnimatingOrbit = false;
            }
        }

        if (this.isAnimatingDistance) {
            this.distance += (this.targetDistance - this.distance) * 0.1;
            if (Math.abs(this.targetDistance - this.distance) < 0.001) {
                this.isAnimatingDistance = false;
            }
        }
    }

    /**
     * updates the camera's position and orientation based on spherical coordinates
     */
    _updateCameraTransform() {
        const x = this.orbitPoint.x + this.distance * Math.sin(this.angles.phi) * Math.cos(this.angles.theta);
        const y = this.orbitPoint.y + this.distance * Math.cos(this.angles.phi);
        const z = this.orbitPoint.z + this.distance * Math.sin(this.angles.phi) * Math.sin(this.angles.theta);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.orbitPoint);
    }

    /**
     * sets up mouse, wheel, and keyboard event listeners for camera control
     */
    _setupEventListeners() {
        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
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
                this.angles.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.angles.phi));

                this.prevMouse = { x: e.clientX, y: e.clientY };
            }
        });

        this.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();

            if (this.isAnimatingDistance) {
                this.isAnimatingDistance = false;
            }

            const delta = e.deltaY * 0.001;
            this.distance = Math.max(0.1, Math.min(20, this.distance + delta));
        }, { passive: false });

        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }
}