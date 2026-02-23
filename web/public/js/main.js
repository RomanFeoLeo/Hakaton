import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

class LampManagementSystem {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.labelRenderer = new CSS2DRenderer();
        this.renderContainer = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.pointerDown = null;

        this.ws = null;
        this.clock = new THREE.Clock();
        this.elapsedTime = 0;

        this.lampObjects = new Map();
        this.mapReference = null;
        this.mapScale = 6000;

        this.drone = null;
        this.droneStatus = 'idle';
        this.activeTargetLampId = null;
        this.droneHome = new THREE.Vector3(0, 5, 0);

        this.selectedBrokenLampId = null;
        this.selectedReplaceLampId = null;
        this.weather = null;

        this.init();
        this.initWebSocket();
        this.createMap();
        this.createUI();
    }

    init() {
        this.renderContainer = document.getElementById('three-container') || document.body;
        const viewport = this.getViewportSize();

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(viewport.width, viewport.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.inset = '0';
        this.renderContainer.appendChild(this.renderer.domElement);

        this.labelRenderer.setSize(viewport.width, viewport.height);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.inset = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.renderContainer.appendChild(this.labelRenderer.domElement);

        this.camera.aspect = viewport.width / viewport.height;
        this.camera.updateProjectionMatrix();

        this.camera.position.set(0, 20, 30);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.setupLighting();
        this.setupGround();
        this.createWeatherEffects();
        this.bindSceneLampSelection();

        this.animate();
        window.addEventListener('resize', () => this.onResize());
    }

    bindSceneLampSelection() {
        this.renderer.domElement.addEventListener('pointerdown', (event) => {
            this.pointerDown = { x: event.clientX, y: event.clientY };
        });

        this.renderer.domElement.addEventListener('pointerup', (event) => {
            if (!this.pointerDown) {
                return;
            }

            const dx = event.clientX - this.pointerDown.x;
            const dy = event.clientY - this.pointerDown.y;
            this.pointerDown = null;

            // Ignore drag gestures from OrbitControls.
            if (dx * dx + dy * dy > 16) {
                return;
            }

            this.selectLampByPointer(event.clientX, event.clientY);
        });
    }

    selectLampByPointer(clientX, clientY) {
        if (!this.lampObjects.size) {
            return;
        }

        const rect = this.renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            return;
        }

        this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const lampGroups = Array.from(this.lampObjects.values());
        const hits = this.raycaster.intersectObjects(lampGroups, true);
        if (!hits.length) {
            return;
        }

        let target = hits[0].object;
        while (target && (!target.userData || !target.userData.id)) {
            target = target.parent;
        }

        const selectedId = Number(target?.userData?.id);
        if (!selectedId) {
            return;
        }

        this.selectLampInPanel(selectedId);
    }

    selectLampInPanel(lampId) {
        this.selectedBrokenLampId = lampId;
        this.selectedReplaceLampId = lampId;
        this.refreshLampSelectors();
        this.applyLampHighlights();
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        this.scene.add(dirLight);
    }

    setupGround() {
        const groundGeometry = new THREE.PlaneGeometry(58, 58);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x2faa2f,
            roughness: 0.95
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);

        this.createAlleyDesign();
    }

    createAlleyDesign() {
        const pathShape = new THREE.Shape();
        pathShape.moveTo(-10, -26);
        pathShape.bezierCurveTo(-8, -22, -6, -16, -4, -10);
        pathShape.bezierCurveTo(-10, -6, -10, 6, -4, 10);
        pathShape.bezierCurveTo(-6, 16, -8, 22, -10, 26);
        pathShape.lineTo(-3, 26);
        pathShape.bezierCurveTo(-1.6, 24, -0.8, 21.5, 0, 19);
        pathShape.bezierCurveTo(0.8, 21.5, 1.6, 24, 3, 26);
        pathShape.lineTo(10, 26);
        pathShape.bezierCurveTo(8, 22, 6, 16, 4, 10);
        pathShape.bezierCurveTo(10, 6, 10, -6, 4, -10);
        pathShape.bezierCurveTo(6, -16, 8, -22, 10, -26);
        pathShape.lineTo(3, -26);
        pathShape.bezierCurveTo(1.6, -24, 0.8, -21.5, 0, -19);
        pathShape.bezierCurveTo(-0.8, -21.5, -1.6, -24, -3, -26);
        pathShape.lineTo(-10, -26);

        const pathGeometry = new THREE.ShapeGeometry(pathShape);
        const pathMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.9
        });
        const pathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
        pathMesh.rotation.x = -Math.PI / 2;
        pathMesh.position.set(0, 0.02, 0);
        pathMesh.receiveShadow = true;
        this.scene.add(pathMesh);

        this.createAlleyDecor();
    }

    createAlleyDecor() {
        const flowerBed = this.createCenterFlowerBed();
        flowerBed.position.set(0, 0, 0);
        this.scene.add(flowerBed);

        const leftBench = this.createRoadBench();
        leftBench.position.set(-6.4, 0, 1.0);
        leftBench.rotation.y = Math.PI / 2;
        this.scene.add(leftBench);

        const rightBench = this.createRoadBench();
        rightBench.position.set(6.4, 0, -1.5);
        rightBench.rotation.y = -Math.PI / 2;
        this.scene.add(rightBench);
    }

    createCenterFlowerBed() {
        const group = new THREE.Group();
        const woodMaterial = new THREE.MeshStandardMaterial({
            color: 0xb89b72,
            roughness: 0.82,
            metalness: 0.05
        });
        const soilMaterial = new THREE.MeshStandardMaterial({
            color: 0x4b3626,
            roughness: 1.0
        });

        this.addPlanterTier(group, {
            width: 4.8,
            depth: 4.8,
            height: 0.78,
            y: 0.39,
            wall: 0.18,
            woodMaterial,
            soilMaterial
        });
        this.addPlanterTier(group, {
            width: 3.45,
            depth: 3.45,
            height: 0.72,
            y: 1.02,
            wall: 0.17,
            woodMaterial,
            soilMaterial
        });
        this.addPlanterTier(group, {
            width: 2.2,
            depth: 2.2,
            height: 0.62,
            y: 1.58,
            wall: 0.16,
            woodMaterial,
            soilMaterial
        });

        const foliageMaterial = new THREE.MeshStandardMaterial({
            color: 0x2f963f,
            roughness: 0.85
        });
        const foliageMound = new THREE.Mesh(
            new THREE.SphereGeometry(2.0, 24, 16),
            foliageMaterial
        );
        foliageMound.scale.set(1.0, 0.36, 1.0);
        foliageMound.position.y = 1.22;
        foliageMound.castShadow = true;
        foliageMound.receiveShadow = true;
        group.add(foliageMound);

        const flowerPalettes = [
            { color: 0xe9cf2a, count: 20, y: 1.12, spread: 1.7, size: 0.14 },
            { color: 0x8a63df, count: 18, y: 1.3, spread: 1.45, size: 0.12 },
            { color: 0xf38ab1, count: 12, y: 1.26, spread: 1.3, size: 0.11 }
        ];
        const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x3a9a3a, roughness: 0.8 });

        flowerPalettes.forEach((palette) => {
            const headMaterial = new THREE.MeshStandardMaterial({
                color: palette.color,
                roughness: 0.55,
                metalness: 0.02
            });

            for (let i = 0; i < palette.count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.sqrt(Math.random()) * palette.spread;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const stemHeight = 0.24 + Math.random() * 0.14;

                const stem = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.014, 0.018, stemHeight, 6),
                    stemMaterial
                );
                stem.position.set(x, palette.y - 0.06 + stemHeight * 0.5, z);
                stem.castShadow = true;
                group.add(stem);

                const flower = new THREE.Mesh(
                    new THREE.SphereGeometry(palette.size, 10, 8),
                    headMaterial
                );
                flower.position.set(
                    x + (Math.random() - 0.5) * 0.07,
                    palette.y + stemHeight * 0.45,
                    z + (Math.random() - 0.5) * 0.07
                );
                flower.castShadow = true;
                group.add(flower);
            }
        });

        for (let i = 0; i < 10; i++) {
            const spike = new THREE.Mesh(
                new THREE.CylinderGeometry(0.02, 0.02, 0.55 + Math.random() * 0.15, 6),
                new THREE.MeshStandardMaterial({ color: 0x6f43cf, roughness: 0.65 })
            );
            const angle = Math.random() * Math.PI * 2;
            const radius = 1.55 + Math.random() * 0.55;
            spike.position.set(Math.cos(angle) * radius, 1.32, Math.sin(angle) * radius);
            spike.castShadow = true;
            group.add(spike);
        }

        return group;
    }

    addPlanterTier(group, config) {
        const { width, depth, height, y, wall, woodMaterial, soilMaterial } = config;
        const halfW = width / 2;
        const halfD = depth / 2;

        const front = new THREE.Mesh(new THREE.BoxGeometry(width, height, wall), woodMaterial);
        front.position.set(0, y, halfD - wall / 2);
        front.castShadow = true;
        front.receiveShadow = true;
        group.add(front);

        const back = front.clone();
        back.position.z = -halfD + wall / 2;
        group.add(back);

        const left = new THREE.Mesh(new THREE.BoxGeometry(wall, height, depth - wall * 2), woodMaterial);
        left.position.set(-halfW + wall / 2, y, 0);
        left.castShadow = true;
        left.receiveShadow = true;
        group.add(left);

        const right = left.clone();
        right.position.x = halfW - wall / 2;
        group.add(right);

        const soil = new THREE.Mesh(
            new THREE.BoxGeometry(width - wall * 2.1, 0.14, depth - wall * 2.1),
            soilMaterial
        );
        soil.position.set(0, y + height / 2 + 0.05, 0);
        soil.receiveShadow = true;
        group.add(soil);

        const plankCountX = Math.max(4, Math.floor(width / 0.34));
        for (let i = 0; i <= plankCountX; i++) {
            const x = -halfW + wall * 0.65 + (i / plankCountX) * (width - wall * 1.3);
            const plankFront = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, height * 0.94, wall * 0.94),
                new THREE.MeshStandardMaterial({ color: 0xa9865d, roughness: 0.85 })
            );
            plankFront.position.set(x, y, halfD - wall * 0.5);
            group.add(plankFront);

            const plankBack = plankFront.clone();
            plankBack.position.z = -halfD + wall * 0.5;
            group.add(plankBack);
        }

        const plankCountZ = Math.max(4, Math.floor(depth / 0.34));
        for (let i = 0; i <= plankCountZ; i++) {
            const z = -halfD + wall * 0.65 + (i / plankCountZ) * (depth - wall * 1.3);
            const plankLeft = new THREE.Mesh(
                new THREE.BoxGeometry(wall * 0.94, height * 0.94, 0.03),
                new THREE.MeshStandardMaterial({ color: 0xa9865d, roughness: 0.85 })
            );
            plankLeft.position.set(-halfW + wall * 0.5, y, z);
            group.add(plankLeft);

            const plankRight = plankLeft.clone();
            plankRight.position.x = halfW - wall * 0.5;
            group.add(plankRight);
        }
    }

    createRoadBench() {
        const bench = new THREE.Group();
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x2d2d2d,
            roughness: 0.55,
            metalness: 0.75
        });
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0xc89655,
            roughness: 0.72,
            metalness: 0.05
        });

        for (let i = 0; i < 5; i++) {
            const z = -0.3 + i * 0.15;
            const seatSlat = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.065, 0.11), woodMat);
            seatSlat.position.set(0, 0.62, z);
            seatSlat.castShadow = true;
            seatSlat.receiveShadow = true;
            bench.add(seatSlat);
        }

        for (let i = 0; i < 4; i++) {
            const y = 0.88 + i * 0.16;
            const backSlat = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.065, 0.1), woodMat);
            backSlat.position.set(0, y, -0.38 - i * 0.02);
            backSlat.rotation.x = -0.08;
            backSlat.castShadow = true;
            backSlat.receiveShadow = true;
            bench.add(backSlat);
        }

        const legPositions = [
            [-1.35, 0.29, -0.24],
            [1.35, 0.29, -0.24],
            [-1.35, 0.29, 0.24],
            [1.35, 0.29, 0.24]
        ];
        legPositions.forEach(([x, y, z]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.08), metalMat);
            leg.position.set(x, y, z);
            leg.castShadow = true;
            leg.receiveShadow = true;
            bench.add(leg);
        });

        const sideX = [-1.52, 1.52];
        sideX.forEach((x) => {
            const armPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.08), metalMat);
            armPillar.position.set(x, 0.88, -0.14);
            armPillar.castShadow = true;
            bench.add(armPillar);

            const armTop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.44), metalMat);
            armTop.position.set(x, 1.06, 0.02);
            armTop.castShadow = true;
            bench.add(armTop);

            const backPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), metalMat);
            backPillar.position.set(x, 0.91, -0.37);
            backPillar.rotation.x = -0.08;
            backPillar.castShadow = true;
            bench.add(backPillar);
        });

        return bench;
    }

    initWebSocket() {
        this.ws = new WebSocket('ws://localhost:3000');

        this.ws.onopen = () => {
            console.log('Connected to server');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleServerMessage(message) {
        if (!message || !message.type || !message.data) {
            return;
        }

        if (message.type === 'initial' || message.type === 'update') {
            this.updateLamps(Array.isArray(message.data.lamps) ? message.data.lamps : []);
            this.updateDroneStatus(message.data.droneStatus, message.data.activeTargetLampId);
            this.updateTasks(Array.isArray(message.data.replacementTasks) ? message.data.replacementTasks : []);
        }
    }

    createMap() {
        this.drone = this.createDrone();
        this.drone.position.copy(this.droneHome);
        this.scene.add(this.drone);
    }

    createLamp(lampData, position) {
        const group = new THREE.Group();
        group.userData.id = lampData.id;

        const poleGeometry = new THREE.CylinderGeometry(0.2, 0.3, 5);
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.4 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 2.5;
        pole.castShadow = true;
        pole.receiveShadow = true;
        group.add(pole);

        const mountGeometry = new THREE.BoxGeometry(0.8, 0.2, 0.8);
        const mountMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
        const mount = new THREE.Mesh(mountGeometry, mountMaterial);
        mount.position.y = 5;
        mount.castShadow = true;
        mount.receiveShadow = true;
        group.add(mount);

        const padGeometry = new THREE.CylinderGeometry(0.6, 0.7, 0.1, 8);
        const padMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
        const pad = new THREE.Mesh(padGeometry, padMaterial);
        pad.position.y = 5.1;
        pad.castShadow = true;
        pad.receiveShadow = true;
        group.add(pad);

        for (let i = 0; i < 4; i++) {
            const contactGeometry = new THREE.SphereGeometry(0.1);
            const contactMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.9, emissive: 0x332200 });
            const contact = new THREE.Mesh(contactGeometry, contactMaterial);
            contact.position.set(
                Math.cos(i * Math.PI / 2) * 0.5,
                5.25,
                Math.sin(i * Math.PI / 2) * 0.5
            );
            group.add(contact);
        }

        const lampModule = this.createLampModule(lampData);
        lampModule.position.y = 5.25;
        lampModule.name = `lamp_module_${lampData.id}`;
        group.add(lampModule);

        const selectionRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.0, 0.06, 8, 24),
            new THREE.MeshStandardMaterial({ color: 0x4e9fff, emissive: 0x1a4a88 })
        );
        selectionRing.rotation.x = Math.PI / 2;
        selectionRing.position.y = 5.13;
        selectionRing.visible = false;
        group.add(selectionRing);

        const faultRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.2, 0.07, 8, 24),
            new THREE.MeshStandardMaterial({ color: 0xff8c33, emissive: 0x5a2200 })
        );
        faultRing.rotation.x = Math.PI / 2;
        faultRing.position.y = 5.12;
        faultRing.visible = false;
        group.add(faultRing);

        const labelDiv = document.createElement('div');
        labelDiv.className = 'lamp-label';
        labelDiv.style.background = 'rgba(0,0,0,0.8)';
        labelDiv.style.color = 'white';
        labelDiv.style.padding = '5px';
        labelDiv.style.borderRadius = '5px';
        labelDiv.style.fontSize = '12px';
        labelDiv.innerHTML = this.formatLampLabel(lampData);

        const label = new CSS2DObject(labelDiv);
        label.position.set(0, 6, 0);
        group.add(label);

        group.userData.label = label;
        group.userData.selectionRing = selectionRing;
        group.userData.faultRing = faultRing;

        group.position.copy(position);
        this.updateLampAppearance(group, lampData);

        return group;
    }

    createLampModule(lampData) {
        const group = new THREE.Group();

        const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            emissive: 0x000000
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const glassGeometry = new THREE.SphereGeometry(0.35, 16, 8);
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x88aaff,
            transparent: true,
            opacity: 0.3,
            emissive: 0x000000
        });
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.y = 0.2;
        glass.castShadow = true;
        glass.receiveShadow = true;
        group.add(glass);

        const leds = [];
        for (let i = 0; i < 8; i++) {
            const ledGeometry = new THREE.SphereGeometry(0.05);
            const ledMaterial = new THREE.MeshStandardMaterial({
                color: 0x333333,
                emissive: 0x000000
            });
            const led = new THREE.Mesh(ledGeometry, ledMaterial);
            led.position.set(
                Math.cos(i * Math.PI / 4) * 0.25,
                0.1,
                Math.sin(i * Math.PI / 4) * 0.25
            );
            group.add(led);
            leds.push(led);
        }

        const tempBarGeometry = new THREE.BoxGeometry(0.1, 0.01, 0.1);
        const tempBarMaterial = new THREE.MeshStandardMaterial({ color: this.getTemperatureColor(lampData.temperature) });
        const tempBar = new THREE.Mesh(tempBarGeometry, tempBarMaterial);
        tempBar.position.set(0, -0.2, 0);
        group.add(tempBar);

        group.userData = { body, glass, leds, tempBar };

        return group;
    }

    updateLampAppearance(lamp, lampData) {
        lamp.userData.data = { ...lampData };

        const module = lamp.getObjectByName(`lamp_module_${lampData.id}`);
        if (module && module.userData) {
            const isOn = lampData.status === 'on';
            const isFault = lampData.status === 'fault';

            module.userData.body.material.color.setHex(isFault ? 0xff4444 : 0xffffff);
            module.userData.body.material.emissive.setHex(isOn ? 0x442200 : 0x000000);
            module.userData.glass.material.emissive.setHex(isOn ? 0x224488 : 0x000000);

            module.userData.leds.forEach((led) => {
                led.material.color.setHex(isOn ? 0xffaa00 : 0x333333);
                led.material.emissive.setHex(isOn ? 0xff8800 : 0x000000);
            });

            module.userData.tempBar.material.color.setHex(this.getTemperatureColor(lampData.temperature));
            module.userData.tempBar.scale.y = Math.max(0.2, lampData.temperature / 30);
        }

        const label = lamp.userData.label;
        if (label && label.element) {
            label.element.innerHTML = this.formatLampLabel(lampData);
        }
    }

    formatLampLabel(lampData) {
        return `ID: ${lampData.id}<br>Status: ${lampData.status}<br>Temp: ${Math.round(lampData.temperature)}C`;
    }

    updateLamps(lampData) {
        if (!lampData.length) {
            return;
        }

        if (!this.mapReference) {
            const center = lampData[0];
            this.mapReference = { lat: center.lat, lng: center.lng };
        }

        const seenIds = new Set();

        lampData.forEach((lamp, index) => {
            seenIds.add(lamp.id);
            const position = this.projectLampPosition(lamp, index);

            if (!this.lampObjects.has(lamp.id)) {
                const lampGroup = this.createLamp(lamp, position);
                this.lampObjects.set(lamp.id, lampGroup);
                this.scene.add(lampGroup);
            } else {
                const lampGroup = this.lampObjects.get(lamp.id);
                lampGroup.position.copy(position);
                this.updateLampAppearance(lampGroup, lamp);
            }
        });

        for (const [id, lampGroup] of this.lampObjects.entries()) {
            if (!seenIds.has(id)) {
                this.scene.remove(lampGroup);
                this.lampObjects.delete(id);
            }
        }

        this.refreshLampSelectors();
        this.applyLampHighlights();
        this.updateStats(lampData);
    }

    projectLampPosition(lampData, index) {
        const fixedSlotsById = {
            1: new THREE.Vector3(-8, 0, 10),
            2: new THREE.Vector3(8, 0, 7),
            3: new THREE.Vector3(-9, 0, -8),
            4: new THREE.Vector3(9, 0, -10)
        };

        if (fixedSlotsById[lampData.id]) {
            return fixedSlotsById[lampData.id].clone();
        }

        const lat = Number(lampData.lat);
        const lng = Number(lampData.lng);

        if (Number.isFinite(lat) && Number.isFinite(lng) && this.mapReference) {
            const x = (lng - this.mapReference.lng) * this.mapScale;
            const z = (lat - this.mapReference.lat) * -this.mapScale;
            return new THREE.Vector3(x, 0, z);
        }

        const row = Math.floor(index / 4);
        const col = index % 4;
        return new THREE.Vector3((col - 1.5) * 8, 0, (row - 1.5) * 8);
    }

    createDrone() {
        const group = new THREE.Group();

        const bodyGeometry = new THREE.BoxGeometry(0.8, 0.2, 0.8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        for (let i = 0; i < 4; i++) {
            const armGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.6);
            const armMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
            const arm = new THREE.Mesh(armGeometry, armMaterial);
            arm.position.set(
                Math.cos(i * Math.PI / 2) * 0.4,
                0,
                Math.sin(i * Math.PI / 2) * 0.4
            );
            arm.rotation.y = i * Math.PI / 2;
            arm.castShadow = true;
            arm.receiveShadow = true;
            group.add(arm);

            const motorGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05);
            const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
            const motor = new THREE.Mesh(motorGeometry, motorMaterial);
            motor.position.set(
                Math.cos(i * Math.PI / 2) * 0.7,
                0,
                Math.sin(i * Math.PI / 2) * 0.7
            );
            motor.rotation.x = Math.PI / 2;
            motor.castShadow = true;
            motor.receiveShadow = true;
            group.add(motor);

            const propellerGroup = new THREE.Group();
            propellerGroup.userData.isPropeller = true;
            propellerGroup.position.set(
                Math.cos(i * Math.PI / 2) * 0.7,
                0.1,
                Math.sin(i * Math.PI / 2) * 0.7
            );

            const bladeGeometry = new THREE.BoxGeometry(0.3, 0.02, 0.05);
            const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });

            const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
            blade1.rotation.y = Math.PI / 4;
            blade1.castShadow = true;
            propellerGroup.add(blade1);

            const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
            blade2.rotation.y = -Math.PI / 4;
            blade2.castShadow = true;
            propellerGroup.add(blade2);

            group.add(propellerGroup);
        }

        const gripperGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.2);
        const gripperMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
        const gripper = new THREE.Mesh(gripperGeometry, gripperMaterial);
        gripper.position.y = -0.2;
        gripper.castShadow = true;
        group.add(gripper);

        return group;
    }

    createWeatherEffects() {
        this.weather = {
            mode: 'clear',
            areaHalfWidth: 34,
            areaHalfDepth: 34,
            minY: 0.2,
            maxY: 30,
            rainLayers: [],
            snowLayers: []
        };

        this.weather.rainLayers.push(this.createRainLayer({
            count: 1200,
            color: 0x91b8ff,
            opacity: 0.3,
            minSpeed: 20,
            maxSpeed: 30,
            minLength: 0.6,
            maxLength: 1.2,
            windFactor: 1.0,
            swayFactor: 0.45,
            tailTilt: 0.045
        }));

        this.weather.rainLayers.push(this.createRainLayer({
            count: 850,
            color: 0xa8c8ff,
            opacity: 0.2,
            minSpeed: 13,
            maxSpeed: 22,
            minLength: 0.35,
            maxLength: 0.8,
            windFactor: 0.7,
            swayFactor: 0.3,
            tailTilt: 0.03
        }));

        this.weather.snowLayers.push(this.createSnowLayer({
            count: 650,
            color: 0xffffff,
            opacity: 0.8,
            size: 0.22,
            minSpeed: 1.8,
            maxSpeed: 3.4,
            windFactor: 0.55,
            driftFactor: 0.85
        }));

        this.weather.snowLayers.push(this.createSnowLayer({
            count: 420,
            color: 0xf3f7ff,
            opacity: 0.55,
            size: 0.34,
            minSpeed: 0.9,
            maxSpeed: 2.2,
            windFactor: 0.35,
            driftFactor: 1.25
        }));

        this.setWeather('clear');
    }

    createRainLayer(config) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(config.count * 6);
        const lengths = new Float32Array(config.count);
        const speeds = new Float32Array(config.count);
        const phases = new Float32Array(config.count);
        const sway = new Float32Array(config.count);

        const layer = {
            mesh: null,
            positions,
            lengths,
            speeds,
            phases,
            sway,
            count: config.count,
            windFactor: config.windFactor,
            swayFactor: config.swayFactor,
            tailTilt: config.tailTilt
        };

        for (let i = 0; i < config.count; i++) {
            lengths[i] = this.randomRange(config.minLength, config.maxLength);
            speeds[i] = this.randomRange(config.minSpeed, config.maxSpeed);
            phases[i] = Math.random() * Math.PI * 2;
            sway[i] = this.randomRange(0.4, 1.1);
            this.resetRainDrop(layer, i, 0, 0, false);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({
            color: config.color,
            transparent: true,
            opacity: config.opacity,
            depthWrite: false
        });
        const mesh = new THREE.LineSegments(geometry, material);
        mesh.visible = false;
        this.scene.add(mesh);

        layer.mesh = mesh;
        return layer;
    }

    createSnowLayer(config) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(config.count * 3);
        const speeds = new Float32Array(config.count);
        const phases = new Float32Array(config.count);
        const drift = new Float32Array(config.count);

        const layer = {
            mesh: null,
            positions,
            speeds,
            phases,
            drift,
            count: config.count,
            windFactor: config.windFactor,
            driftFactor: config.driftFactor
        };

        for (let i = 0; i < config.count; i++) {
            speeds[i] = this.randomRange(config.minSpeed, config.maxSpeed);
            phases[i] = Math.random() * Math.PI * 2;
            drift[i] = this.randomRange(0.6, 1.4);
            this.resetSnowFlake(layer, i, 0, 0, false);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: config.color,
            size: config.size,
            transparent: true,
            opacity: config.opacity,
            depthWrite: false,
            sizeAttenuation: true
        });
        const mesh = new THREE.Points(geometry, material);
        mesh.visible = false;
        this.scene.add(mesh);

        layer.mesh = mesh;
        return layer;
    }

    randomRange(min, max) {
        return min + Math.random() * (max - min);
    }

    resetRainDrop(layer, index, centerX, centerZ, fromTop) {
        const p = index * 6;
        const x = centerX + this.randomRange(-this.weather.areaHalfWidth, this.weather.areaHalfWidth);
        const y = fromTop
            ? this.weather.maxY + Math.random() * 10
            : this.randomRange(this.weather.minY, this.weather.maxY);
        const z = centerZ + this.randomRange(-this.weather.areaHalfDepth, this.weather.areaHalfDepth);

        layer.positions[p] = x;
        layer.positions[p + 1] = y;
        layer.positions[p + 2] = z;
        layer.positions[p + 3] = x;
        layer.positions[p + 4] = y - layer.lengths[index];
        layer.positions[p + 5] = z;
    }

    resetSnowFlake(layer, index, centerX, centerZ, fromTop) {
        const p = index * 3;
        layer.positions[p] = centerX + this.randomRange(-this.weather.areaHalfWidth, this.weather.areaHalfWidth);
        layer.positions[p + 1] = fromTop
            ? this.weather.maxY + Math.random() * 8
            : this.randomRange(this.weather.minY, this.weather.maxY);
        layer.positions[p + 2] = centerZ + this.randomRange(-this.weather.areaHalfDepth, this.weather.areaHalfDepth);
    }

    updateWeather(delta) {
        if (!this.weather || this.weather.mode === 'clear') {
            return;
        }

        const centerX = this.camera.position.x;
        const centerZ = this.camera.position.z;
        const minX = centerX - this.weather.areaHalfWidth;
        const maxX = centerX + this.weather.areaHalfWidth;
        const minZ = centerZ - this.weather.areaHalfDepth;
        const maxZ = centerZ + this.weather.areaHalfDepth;

        const windX = 1.5 + Math.sin(this.elapsedTime * 0.29) * 0.9 + Math.sin(this.elapsedTime * 0.11 + 1.4) * 0.5;
        const windZ = 0.5 + Math.cos(this.elapsedTime * 0.22) * 0.6;

        if (this.weather.mode === 'rain') {
            this.weather.rainLayers.forEach((layer) => {
                const positions = layer.positions;

                for (let i = 0; i < layer.count; i++) {
                    const p = i * 6;
                    const phase = layer.phases[i];
                    const sway = layer.sway[i];

                    const swayX = Math.sin(this.elapsedTime * 6 + phase) * sway * layer.swayFactor;
                    const swayZ = Math.cos(this.elapsedTime * 5 + phase) * sway * layer.swayFactor * 0.45;

                    positions[p] += (windX * layer.windFactor + swayX) * delta;
                    positions[p + 1] -= layer.speeds[i] * delta;
                    positions[p + 2] += (windZ * layer.windFactor + swayZ) * delta;

                    if (
                        positions[p + 1] < this.weather.minY ||
                        positions[p] < minX - 8 ||
                        positions[p] > maxX + 8 ||
                        positions[p + 2] < minZ - 8 ||
                        positions[p + 2] > maxZ + 8
                    ) {
                        this.resetRainDrop(layer, i, centerX - windX * 0.8, centerZ - windZ * 0.8, true);
                        continue;
                    }

                    positions[p + 3] = positions[p] - windX * layer.tailTilt;
                    positions[p + 4] = positions[p + 1] - layer.lengths[i];
                    positions[p + 5] = positions[p + 2] - windZ * layer.tailTilt;
                }

                layer.mesh.geometry.attributes.position.needsUpdate = true;
            });
            return;
        }

        if (this.weather.mode === 'snow') {
            this.weather.snowLayers.forEach((layer) => {
                const positions = layer.positions;

                for (let i = 0; i < layer.count; i++) {
                    const p = i * 3;
                    const phase = layer.phases[i];
                    const drift = layer.drift[i];

                    const swayX = Math.sin(this.elapsedTime * 1.8 + phase) * drift * layer.driftFactor;
                    const swayZ = Math.cos(this.elapsedTime * 1.6 + phase) * drift * layer.driftFactor;

                    positions[p] += (windX * layer.windFactor + swayX) * delta;
                    positions[p + 1] -= layer.speeds[i] * delta;
                    positions[p + 2] += (windZ * layer.windFactor + swayZ) * delta;

                    if (
                        positions[p + 1] < this.weather.minY ||
                        positions[p] < minX - 10 ||
                        positions[p] > maxX + 10 ||
                        positions[p + 2] < minZ - 10 ||
                        positions[p + 2] > maxZ + 10
                    ) {
                        this.resetSnowFlake(layer, i, centerX - windX * 0.5, centerZ - windZ * 0.5, true);
                    }
                }

                layer.mesh.geometry.attributes.position.needsUpdate = true;
            });
        }
    }

    respawnWeatherAroundCamera(mode) {
        if (!this.weather) {
            return;
        }

        const centerX = this.camera.position.x;
        const centerZ = this.camera.position.z;

        if (mode === 'rain') {
            this.weather.rainLayers.forEach((layer) => {
                for (let i = 0; i < layer.count; i++) {
                    this.resetRainDrop(layer, i, centerX, centerZ, false);
                }
                layer.mesh.geometry.attributes.position.needsUpdate = true;
            });
            return;
        }

        if (mode === 'snow') {
            this.weather.snowLayers.forEach((layer) => {
                for (let i = 0; i < layer.count; i++) {
                    this.resetSnowFlake(layer, i, centerX, centerZ, false);
                }
                layer.mesh.geometry.attributes.position.needsUpdate = true;
            });
        }
    }

    updateDroneStatus(status, targetLampId) {
        this.droneStatus = status || 'idle';

        if (typeof targetLampId === 'number') {
            this.activeTargetLampId = targetLampId;
        } else if (this.droneStatus === 'idle') {
            this.activeTargetLampId = null;
        }

        this.updateDroneStatusText();
    }

    updateDroneStatusText() {
        const statusEl = document.getElementById('drone-status');
        if (!statusEl) {
            return;
        }

        const targetText = this.activeTargetLampId ? ` -> lamp #${this.activeTargetLampId}` : '';
        statusEl.textContent = `Drone status: ${this.droneStatus}${targetText}`;
    }

    updateTasks(tasks) {
        const tasksList = document.getElementById('tasks-list');
        if (!tasksList) {
            return;
        }

        tasksList.innerHTML = '';

        tasks.forEach((task) => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-item';
            taskEl.innerHTML = `
                <div>Lamp #${task.lampId}</div>
                <div>Status: ${task.status}</div>
                <div>Time: ${new Date(task.startedAt).toLocaleTimeString()}</div>
            `;
            tasksList.appendChild(taskEl);
        });
    }

    updateStats(lamps) {
        const total = lamps.length;
        const active = lamps.filter((lamp) => lamp.status === 'on').length;
        const fault = lamps.filter((lamp) => lamp.needsReplacement || lamp.status === 'fault').length;

        const totalEl = document.getElementById('total-lamps');
        const activeEl = document.getElementById('active-lamps');
        const faultEl = document.getElementById('fault-lamps');

        if (totalEl) totalEl.textContent = String(total);
        if (activeEl) activeEl.textContent = String(active);
        if (faultEl) faultEl.textContent = String(fault);
    }

    createUI() {
        const panel = document.createElement('div');
        panel.id = 'control-panel';
        panel.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-family: Arial, sans-serif;
            z-index: 1000;
            min-width: 280px;
            max-height: calc(100% - 40px);
            overflow: hidden;
        `;

        panel.innerHTML = `
            <h2>Lamp replacement</h2>
            <div id="drone-status" style="margin-bottom: 10px;">Drone status: idle</div>

            <div style="margin-bottom: 8px;">Broken lamp</div>
            <select id="broken-lamp-select" style="width:100%; margin-bottom:6px;"></select>
            <select id="broken-status-select" style="width:100%; margin-bottom:6px;">
                <option value="fault">fault</option>
                <option value="off">off</option>
            </select>
            <button onclick="markLampBroken()" style="width:100%; margin-bottom:12px;">Mark as broken</button>

            <div style="margin-bottom: 8px;">Replace lamp</div>
            <select id="replace-lamp-select" style="width:100%; margin-bottom:6px;"></select>

            <div id="weather-control" style="margin: 10px 0;">
                <button onclick="setWeather('clear')">Clear</button>
                <button onclick="setWeather('rain')">Rain</button>
                <button onclick="setWeather('snow')">Snow</button>
            </div>

            <button onclick="startReplacement()" style="
                background: #4CAF50;
                color: white;
                border: none;
                padding: 10px;
                width: 100%;
                margin-top: 4px;
                margin-bottom: 10px;
                cursor: pointer;
            ">Start replacement</button>

            <div id="tasks">
                <h3 style="margin: 0 0 6px 0;">Tasks</h3>
                <div id="tasks-list" style="
                    max-height: 180px;
                    overflow-y: auto;
                    padding-right: 4px;
                "></div>
            </div>
        `;

        const uiHost = document.getElementById('tab-3d') || document.body;
        uiHost.appendChild(panel);

        window.setWeather = (type) => this.setWeather(type);
        window.startReplacement = () => this.startReplacement();
        window.markLampBroken = () => this.markLampBroken();

        const brokenSelect = panel.querySelector('#broken-lamp-select');
        const replaceSelect = panel.querySelector('#replace-lamp-select');

        brokenSelect.addEventListener('change', () => {
            this.selectedBrokenLampId = Number(brokenSelect.value);
            this.applyLampHighlights();
        });

        replaceSelect.addEventListener('change', () => {
            this.selectedReplaceLampId = Number(replaceSelect.value);
            this.applyLampHighlights();
        });
    }

    refreshLampSelectors() {
        const brokenSelect = document.getElementById('broken-lamp-select');
        const replaceSelect = document.getElementById('replace-lamp-select');
        if (!brokenSelect || !replaceSelect) {
            return;
        }

        const lampIds = Array.from(this.lampObjects.keys()).sort((a, b) => a - b);
        if (!lampIds.length) {
            return;
        }

        if (!lampIds.includes(this.selectedBrokenLampId)) {
            this.selectedBrokenLampId = lampIds[0];
        }

        if (!lampIds.includes(this.selectedReplaceLampId)) {
            this.selectedReplaceLampId = lampIds[0];
        }

        brokenSelect.innerHTML = lampIds
            .map((id) => `<option value="${id}">Lamp #${id}</option>`)
            .join('');
        replaceSelect.innerHTML = lampIds
            .map((id) => `<option value="${id}">Lamp #${id}</option>`)
            .join('');

        brokenSelect.value = String(this.selectedBrokenLampId);
        replaceSelect.value = String(this.selectedReplaceLampId);
    }

    applyLampHighlights() {
        for (const [id, lamp] of this.lampObjects.entries()) {
            const data = lamp.userData.data || {};
            const isSelectedForReplace = id === Number(this.selectedReplaceLampId);
            const isBroken = Boolean(data.needsReplacement || data.status === 'fault' || id === Number(this.selectedBrokenLampId));

            if (lamp.userData.selectionRing) {
                lamp.userData.selectionRing.visible = isSelectedForReplace;
            }

            if (lamp.userData.faultRing) {
                lamp.userData.faultRing.visible = isBroken;
            }
        }
    }

    setWeather(type) {
        if (!this.weather) {
            return;
        }

        const mode = type === 'rain' || type === 'snow' ? type : 'clear';
        this.weather.mode = mode;

        const rainVisible = mode === 'rain';
        const snowVisible = mode === 'snow';

        this.weather.rainLayers.forEach((layer) => {
            layer.mesh.visible = rainVisible;
        });
        this.weather.snowLayers.forEach((layer) => {
            layer.mesh.visible = snowVisible;
        });

        if (mode !== 'clear') {
            this.respawnWeatherAroundCamera(mode);
        }
    }

    markLampBroken() {
        const lampId = Number(document.getElementById('broken-lamp-select')?.value);
        const faultStatus = document.getElementById('broken-status-select')?.value || 'fault';

        if (!lampId || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'setLampFault',
            lampId,
            status: faultStatus
        }));
    }

    startReplacement() {
        const lampId = Number(document.getElementById('replace-lamp-select')?.value);

        if (!lampId || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.activeTargetLampId = lampId;
        this.updateDroneStatusText();

        this.ws.send(JSON.stringify({
            type: 'startReplacement',
            lampId
        }));
    }

    getTemperatureColor(temp) {
        if (temp < 30) return 0x00ff00;
        if (temp < 45) return 0xffff00;
        return 0xff0000;
    }

    resolveTargetLamp() {
        if (this.activeTargetLampId && this.lampObjects.has(this.activeTargetLampId)) {
            return this.lampObjects.get(this.activeTargetLampId);
        }

        const selectedId = Number(this.selectedReplaceLampId);
        if (selectedId && this.lampObjects.has(selectedId)) {
            return this.lampObjects.get(selectedId);
        }

        for (const lamp of this.lampObjects.values()) {
            const data = lamp.userData.data || {};
            if (data.needsReplacement || data.status === 'fault' || data.status === 'off') {
                return lamp;
            }
        }

        return null;
    }

    updateDroneMovement(delta) {
        if (!this.drone) {
            return;
        }

        const baseHover = this.droneHome.y + Math.sin(this.elapsedTime * 2.0) * 0.12;
        const targetLamp = this.resolveTargetLamp();

        if (this.droneStatus === 'flying' && targetLamp) {
            const target = targetLamp.position.clone();
            target.y = 6.6;
            this.moveDroneTowards(target, 5, delta);
        } else if (this.droneStatus === 'replacing' && targetLamp) {
            const orbit = targetLamp.position.clone();
            orbit.x += Math.cos(this.elapsedTime * 2.4) * 0.8;
            orbit.z += Math.sin(this.elapsedTime * 2.4) * 0.8;
            orbit.y = 6.6 + Math.sin(this.elapsedTime * 4.0) * 0.15;
            this.moveDroneTowards(orbit, 5, delta);
            this.drone.rotation.y += delta * 2;
        } else if (this.droneStatus === 'returning') {
            const home = this.droneHome.clone();
            home.y = baseHover;
            this.moveDroneTowards(home, 5, delta);
        } else {
            const idleTarget = this.droneHome.clone();
            idleTarget.y = baseHover;
            this.moveDroneTowards(idleTarget, 2, delta);
        }
    }

    moveDroneTowards(target, speed, delta) {
        const direction = target.clone().sub(this.drone.position);
        const distance = direction.length();

        if (distance < 0.001) {
            return;
        }

        const step = Math.min(distance, speed * delta);
        direction.normalize();
        this.drone.position.addScaledVector(direction, step);

        const horizontal = target.clone().sub(this.drone.position);
        horizontal.y = 0;
        if (horizontal.lengthSq() > 0.0001) {
            this.drone.rotation.y = Math.atan2(horizontal.x, horizontal.z);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        this.elapsedTime += delta;

        this.updateWeather(delta);

        if (this.drone) {
            this.drone.traverse((obj) => {
                if (obj.userData && obj.userData.isPropeller) {
                    obj.rotation.y += 18 * delta;
                }
            });
        }

        this.updateDroneMovement(delta);

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    onResize() {
        const viewport = this.getViewportSize();
        this.camera.aspect = viewport.width / viewport.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(viewport.width, viewport.height);
        this.labelRenderer.setSize(viewport.width, viewport.height);
    }

    getViewportSize() {
        if (this.renderContainer && this.renderContainer !== document.body) {
            return {
                width: Math.max(1, this.renderContainer.clientWidth || window.innerWidth),
                height: Math.max(1, this.renderContainer.clientHeight || window.innerHeight)
            };
        }

        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }
}

new LampManagementSystem();
