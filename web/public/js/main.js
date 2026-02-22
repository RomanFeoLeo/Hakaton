import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

class LampManagementSystem {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.labelRenderer = new CSS2DRenderer();

        this.lamps = [];
        this.drone = null;
        this.ws = null;
        this.clock = new THREE.Clock();

        this.init();
        this.initWebSocket();
        this.createMap();
        this.createUI();
    }

    init() {
        // Настройка рендерера
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Настройка CSS2DRenderer для текста
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.left = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        document.body.appendChild(this.labelRenderer.domElement);

        // Камера
        this.camera.position.set(0, 20, 30);

        // Контролы
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        // Освещение
        this.setupLighting();

        // Сетка и земля
        this.setupGround();

        // Анимация
        this.animate();

        // Обработка ресайза
        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight);

        // Directional light (солнце)
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        this.scene.add(dirLight);

        // Point lights для ламп
        this.lampLights = [];
    }

    setupGround() {
        // Сетка
        const gridHelper = new THREE.GridHelper(50, 20, 0x888888, 0x444444);
        this.scene.add(gridHelper);

        // Земля
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);
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
        switch(message.type) {
            case 'initial':
            case 'update':
                this.updateLamps(message.data.lamps);
                this.updateDroneStatus(message.data.droneStatus);
                this.updateTasks(message.data.replacementTasks);
                break;
        }
    }

    createLamp(lampData) {
        const group = new THREE.Group();

        // Столб
        const poleGeometry = new THREE.CylinderGeometry(0.2, 0.3, 5);
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.4 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 2.5;
        pole.castShadow = true;
        pole.receiveShadow = true;
        group.add(pole);

        // Крепление
        const mountGeometry = new THREE.BoxGeometry(0.8, 0.2, 0.8);
        const mountMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
        const mount = new THREE.Mesh(mountGeometry, mountMaterial);
        mount.position.y = 5;
        mount.castShadow = true;
        mount.receiveShadow = true;
        group.add(mount);

        // Посадочная площадка для дрона
        const padGeometry = new THREE.CylinderGeometry(0.6, 0.7, 0.1, 8);
        const padMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
        const pad = new THREE.Mesh(padGeometry, padMaterial);
        pad.position.y = 5.1;
        pad.castShadow = true;
        pad.receiveShadow = true;
        group.add(pad);

        // Магнитные контакты
        for (let i = 0; i < 4; i++) {
            const contactGeometry = new THREE.SphereGeometry(0.1);
            const contactMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.9, emissive: 0x332200 });
            const contact = new THREE.Mesh(contactGeometry, contactMaterial);
            contact.position.set(
                Math.cos(i * Math.PI/2) * 0.5,
                5.25,
                Math.sin(i * Math.PI/2) * 0.5
            );
            group.add(contact);
        }

        // Лампа (сменный модуль)
        const lampModule = this.createLampModule(lampData);
        lampModule.position.y = 5.25;
        lampModule.name = `lamp_module_${lampData.id}`;
        group.add(lampModule);

        // Метка с информацией
        const labelDiv = document.createElement('div');
        labelDiv.className = 'lamp-label';
        labelDiv.style.background = 'rgba(0,0,0,0.8)';
        labelDiv.style.color = 'white';
        labelDiv.style.padding = '5px';
        labelDiv.style.borderRadius = '5px';
        labelDiv.style.fontSize = '12px';
        labelDiv.innerHTML = `ID: ${lampData.id}<br>Статус: ${lampData.status}<br>Темп: ${Math.round(lampData.temperature)}°C`;

        const label = new CSS2DObject(labelDiv);
        label.position.set(0, 6, 0);
        group.add(label);

        group.position.set(lampData.lat * 100 - 5500, 0, lampData.lng * 100 - 3700);

        return group;
    }

    createLampModule(lampData) {
        const group = new THREE.Group();

        // Основной корпус
        const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: lampData.status === 'fault' ? 0xff4444 : 0xffffff,
            transparent: true,
            opacity: 0.9,
            emissive: lampData.status === 'on' ? 0x442200 : 0x000000
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Стекло
        const glassGeometry = new THREE.SphereGeometry(0.35, 16, 8);
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x88aaff,
            transparent: true,
            opacity: 0.3,
            emissive: lampData.status === 'on' ? 0x224488 : 0x000000
        });
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.y = 0.2;
        glass.castShadow = true;
        glass.receiveShadow = true;
        group.add(glass);

        // Светодиоды
        const ledCount = 8;
        for (let i = 0; i < ledCount; i++) {
            const ledGeometry = new THREE.SphereGeometry(0.05);
            const ledMaterial = new THREE.MeshStandardMaterial({
                color: lampData.status === 'on' ? 0xffaa00 : 0x333333,
                emissive: lampData.status === 'on' ? 0xff8800 : 0x000000
            });
            const led = new THREE.Mesh(ledGeometry, ledMaterial);
            led.position.set(
                Math.cos(i * Math.PI/4) * 0.25,
                0.1,
                Math.sin(i * Math.PI/4) * 0.25
            );
            group.add(led);
        }

        // Индикатор температуры
        const tempBarGeometry = new THREE.BoxGeometry(0.1, 0.01, 0.1);
        const tempBarMaterial = new THREE.MeshStandardMaterial({
            color: this.getTemperatureColor(lampData.temperature)
        });
        const tempBar = new THREE.Mesh(tempBarGeometry, tempBarMaterial);
        tempBar.position.set(0, -0.2, 0);
        tempBar.scale.y = lampData.temperature / 30;
        group.add(tempBar);

        return group;
    }

    createDrone() {
        const group = new THREE.Group();

        // Основной корпус
        const bodyGeometry = new THREE.BoxGeometry(0.8, 0.2, 0.8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Лучи
        for (let i = 0; i < 4; i++) {
            const armGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.6);
            const armMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
            const arm = new THREE.Mesh(armGeometry, armMaterial);
            arm.position.set(
                Math.cos(i * Math.PI/2) * 0.4,
                0,
                Math.sin(i * Math.PI/2) * 0.4
            );
            arm.rotation.y = i * Math.PI/2;
            arm.castShadow = true;
            arm.receiveShadow = true;
            group.add(arm);

            // Моторы
            const motorGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05);
            const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
            const motor = new THREE.Mesh(motorGeometry, motorMaterial);
            motor.position.set(
                Math.cos(i * Math.PI/2) * 0.7,
                0,
                Math.sin(i * Math.PI/2) * 0.7
            );
            motor.rotation.x = Math.PI/2;
            motor.castShadow = true;
            motor.receiveShadow = true;
            group.add(motor);

            // Пропеллеры
            const propellerGroup = new THREE.Group();
            propellerGroup.position.set(
                Math.cos(i * Math.PI/2) * 0.7,
                0.1,
                Math.sin(i * Math.PI/2) * 0.7
            );

            const bladeGeometry = new THREE.BoxGeometry(0.3, 0.02, 0.05);
            const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });

            const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
            blade1.rotation.y = Math.PI/4;
            blade1.castShadow = true;
            propellerGroup.add(blade1);

            const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
            blade2.rotation.y = -Math.PI/4;
            blade2.castShadow = true;
            propellerGroup.add(blade2);

            group.add(propellerGroup);
        }

        // Захват для ламп
        const gripperGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.2);
        const gripperMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
        const gripper = new THREE.Mesh(gripperGeometry, gripperMaterial);
        gripper.position.y = -0.2;
        gripper.castShadow = true;
        group.add(gripper);

        return group;
    }

    createMap() {
        // Создаем лампы с тестовыми данными
        const testLamps = [
            { id: 1, status: 'on', temperature: 25, needsReplacement: false },
            { id: 2, status: 'off', temperature: 18, needsReplacement: true },
            { id: 3, status: 'on', temperature: 22, needsReplacement: false },
            { id: 4, status: 'fault', temperature: 45, needsReplacement: true },
        ];

        // Расставим лампы квадратом 2x2
        // Первая лампа (левый передний угол)
        const lamp1 = this.createLamp(testLamps[0]);
        lamp1.position.set(-5, 0, -5);  // x = -5, z = -5
        this.lamps.push(lamp1);
        this.scene.add(lamp1);

        // Вторая лампа (правый передний угол)
        const lamp2 = this.createLamp(testLamps[1]);
        lamp2.position.set(5, 0, -5);   // x = 5, z = -5
        this.lamps.push(lamp2);
        this.scene.add(lamp2);

        // Третья лампа (левый задний угол)
        const lamp3 = this.createLamp(testLamps[2]);
        lamp3.position.set(-5, 0, 5);   // x = -5, z = 5
        this.lamps.push(lamp3);
        this.scene.add(lamp3);

        // Четвертая лампа (правый задний угол)
        const lamp4 = this.createLamp(testLamps[3]);
        lamp4.position.set(5, 0, 5);    // x = 5, z = 5
        this.lamps.push(lamp4);
        this.scene.add(lamp4);

        // Создаем дрон в центре квадрата
        this.drone = this.createDrone();
        this.drone.position.set(0, 5, 0);  // x=0, y=5, z=0 (в центре)
        this.scene.add(this.drone);

        // Добавляем эффекты погоды
        this.createWeatherEffects();

        console.log('Лампы расставлены квадратом:', this.lamps.length);
    }
    createWeatherEffects() {
        // Дождь
        const rainGeometry = new THREE.BufferGeometry();
        const rainCount = 500;
        const rainPositions = new Float32Array(rainCount * 3);

        for (let i = 0; i < rainCount; i++) {
            rainPositions[i * 3] = (Math.random() - 0.5) * 50;
            rainPositions[i * 3 + 1] = Math.random() * 20;
            rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 50;
        }

        rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));

        const rainMaterial = new THREE.PointsMaterial({
            color: 0x88aaff,
            size: 0.1,
            transparent: true,
            opacity: 0.4
        });

        this.rain = new THREE.Points(rainGeometry, rainMaterial);
        this.scene.add(this.rain);
    }

    updateLamps(lampData) {
        lampData.forEach(data => {
            const lamp = this.lamps.find(l => l.userData?.id === data.id);
            if (lamp) {
                const module = lamp.getObjectByName(`lamp_module_${data.id}`);
                if (module) {
                    // Обновляем цвет в зависимости от статуса
                    module.children.forEach(child => {
                        if (child.material && Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.emissive) {
                                    mat.emissive.setHex(data.status === 'on' ? 0x442200 : 0x000000);
                                }
                            });
                        } else if (child.material) {
                            if (child.material.emissive) {
                                child.material.emissive.setHex(data.status === 'on' ? 0x442200 : 0x000000);
                            }
                        }
                    });
                }

                // Обновляем метку
                const label = lamp.children.find(c => c.isCSS2DObject);
                if (label) {
                    label.element.innerHTML = `ID: ${data.id}<br>Статус: ${data.status}<br>Темп: ${Math.round(data.temperature)}°C`;
                }
            }
        });
    }

    updateDroneStatus(status) {
        // Анимация дрона в зависимости от статуса
        if (this.drone) {
            switch(status) {
                case 'flying':
                    this.drone.position.y += Math.sin(Date.now() * 0.01) * 0.1;
                    this.drone.rotation.y += 0.02;
                    break;
                case 'replacing':
                    this.drone.position.y = 5.5;
                    this.drone.rotation.y += 0.01;
                    break;
                case 'returning':
                    this.drone.position.y += Math.sin(Date.now() * 0.02) * 0.05;
                    break;
                default:
                    // idle
                    this.drone.position.y = 5 + Math.sin(Date.now() * 0.005) * 0.2;
            }
        }
    }

    updateTasks(tasks) {
        // Обновляем UI с задачами
        const tasksList = document.getElementById('tasks-list');
        if (tasksList) {
            tasksList.innerHTML = '';
            tasks.forEach(task => {
                const taskEl = document.createElement('div');
                taskEl.className = 'task-item';
                taskEl.innerHTML = `
                    <div>Лампа #${task.lampId}</div>
                    <div>Статус: ${task.status}</div>
                    <div>Время: ${new Date(task.startedAt).toLocaleTimeString()}</div>
                `;
                tasksList.appendChild(taskEl);
            });
        }
    }

    createUI() {
        // Создаем панель управления
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
            min-width: 250px;
        `;

        panel.innerHTML = `
            <h2>Управление заменой ламп</h2>
            <div id="drone-status">Статус дрона: idle</div>
            <div id="weather-control">
                <h3>Погодные условия</h3>
                <button onclick="setWeather('clear')">Ясно</button>
                <button onclick="setWeather('rain')">Дождь</button>
                <button onclick="setWeather('snow')">Снег</button>
            </div>
            <div id="tasks">
                <h3>Текущие задачи</h3>
                <div id="tasks-list"></div>
            </div>
            <button onclick="startReplacement()" style="
                background: #4CAF50;
                color: white;
                border: none;
                padding: 10px;
                width: 100%;
                margin-top: 10px;
                cursor: pointer;
            ">Начать замену</button>
        `;

        document.body.appendChild(panel);

        // Добавляем обработчики
        window.setWeather = (type) => this.setWeather(type);
        window.startReplacement = () => this.startReplacement();
    }

    setWeather(type) {
        if (this.rain) {
            switch(type) {
                case 'clear':
                    this.rain.material.opacity = 0;
                    break;
                case 'rain':
                    this.rain.material.opacity = 0.4;
                    this.rain.material.color.setHex(0x88aaff);
                    break;
                case 'snow':
                    this.rain.material.opacity = 0.8;
                    this.rain.material.color.setHex(0xffffff);
                    break;
            }
        }
    }

    startReplacement() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Выбираем первую лампу, требующую замены
            const lampToReplace = this.lamps.find(l => {
                const module = l.getObjectByName('lamp_module_1'); // упрощенно
                return true; // в реальности проверять статус
            });

            if (lampToReplace) {
                this.ws.send(JSON.stringify({
                    type: 'startReplacement',
                    lampId: 1
                }));
            }
        }
    }

    getTemperatureColor(temp) {
        if (temp < 30) return 0x00ff00;
        if (temp < 45) return 0xffff00;
        return 0xff0000;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Анимация дождя
        if (this.rain) {
            const positions = this.rain.geometry.attributes.position.array;
            for (let i = 1; i < positions.length; i += 3) {
                positions[i] -= 0.1;
                if (positions[i] < -5) {
                    positions[i] = 15;
                }
            }
            this.rain.geometry.attributes.position.needsUpdate = true;
        }

        // Анимация пропеллеров дрона
        if (this.drone) {
            this.drone.children.forEach(child => {
                if (child.children && child.children.length > 0) {
                    child.children.forEach(prop => {
                        if (prop.geometry && prop.geometry.type === 'BoxGeometry') {
                            prop.rotation.y += 0.1;
                        }
                    });
                }
            });
        }

        this.controls.update();

        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Запуск приложения
new LampManagementSystem();