(function () {
    const elements = {
        mapCanvas: document.getElementById('map-canvas'),
        taskList: document.getElementById('map-task-list'),
        droneStatus: document.getElementById('map-drone-status'),
        brokenSelect: document.getElementById('map-broken-select'),
        replaceSelect: document.getElementById('map-replace-select'),
        markBrokenBtn: document.getElementById('map-mark-broken-btn'),
        scheduleBtn: document.getElementById('map-schedule-btn'),
        startBtn: document.getElementById('map-start-btn'),
        selectedInfo: document.getElementById('map-selected-info')
    };

    if (!elements.mapCanvas) {
        return;
    }

    const lamps = [
        { id: 1, lat: 55.782979, lng: 49.126986, status: 'working' },
        { id: 2, lat: 55.784465, lng: 49.129266, status: 'broken' },
        { id: 3, lat: 55.781249, lng: 49.136575, status: 'scheduled' },
        { id: 4, lat: 55.783034, lng: 49.133413, status: 'working' },
        { id: 5, lat: 55.779731, lng: 49.140495, status: 'broken' },
        { id: 6, lat: 55.778182, lng: 49.136724, status: 'working' },
        { id: 7, lat: 55.778669, lng: 49.132176, status: 'broken' },
        { id: 8, lat: 55.780829, lng: 49.128146, status: 'working' }
    ];

    const droneStart = { lat: 55.780941, lng: 49.132776 };
    const state = {
        map: null,
        droneMarker: null,
        initialized: false,
        selectedBrokenLampId: null,
        selectedReplaceLampId: null,
        selectedLampId: null,
        droneStatus: 'idle',
        activeTargetLampId: null,
        tasks: [],
        flightTimer: null
    };

    function getColor(status) {
        if (status === 'working') return '#2f9e44';
        if (status === 'broken') return '#d64545';
        if (status === 'scheduled') return '#d9901c';
        if (status === 'in_progress') return '#2f7fd6';
        return '#6f7a87';
    }

    function getStatusText(status) {
        if (status === 'working') return 'Работает';
        if (status === 'broken') return 'Не работает';
        if (status === 'scheduled') return 'Запланирована';
        if (status === 'in_progress') return 'В процессе замены';
        return 'Неизвестно';
    }

    function findLampById(id) {
        return lamps.find((lamp) => lamp.id === Number(id)) || null;
    }

    function setLampStatus(lamp, status) {
        lamp.status = status;

        if (lamp.marker) {
            lamp.marker.setStyle({
                color: getColor(status),
                fillColor: getColor(status)
            });
        }

        if (state.selectedLampId === lamp.id) {
            renderSelectedLampInfo();
        }
    }

    function getTaskForLamp(lampId) {
        return state.tasks.find((task) => task.lampId === Number(lampId)) || null;
    }

    function createTaskIfMissing(lampId) {
        const existing = getTaskForLamp(lampId);
        if (existing && existing.status !== 'completed') {
            return existing;
        }

        const task = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            lampId: Number(lampId),
            status: 'scheduled',
            startedAt: new Date().toISOString()
        };
        state.tasks.push(task);
        return task;
    }

    function removeTaskForLamp(lampId) {
        state.tasks = state.tasks.filter((task) => task.lampId !== Number(lampId));
    }

    function setDroneStatus(status, targetLampId) {
        state.droneStatus = status;
        state.activeTargetLampId = typeof targetLampId === 'number' ? targetLampId : null;
        renderDroneStatus();
        updateControlButtons();
    }

    function renderDroneStatus() {
        if (!elements.droneStatus) {
            return;
        }

        const targetText = state.activeTargetLampId ? ` -> лампа #${state.activeTargetLampId}` : '';
        elements.droneStatus.textContent = `Статус дрона: ${state.droneStatus}${targetText}`;
    }

    function renderSelectedLampInfo() {
        if (!elements.selectedInfo) {
            return;
        }

        const selectedLamp = findLampById(state.selectedLampId);
        if (!selectedLamp) {
            elements.selectedInfo.textContent = 'Кликните по фонарю на карте, чтобы быстро выбрать его в списках.';
            return;
        }

        elements.selectedInfo.innerHTML = `
            Выбран фонарь #${selectedLamp.id}<br>
            Координаты: ${selectedLamp.lat.toFixed(6)}, ${selectedLamp.lng.toFixed(6)}<br>
            Статус: ${getStatusText(selectedLamp.status)}
        `;
    }

    function renderSelectors() {
        const sorted = lamps.slice().sort((a, b) => a.id - b.id);
        if (!sorted.length) {
            return;
        }

        if (!findLampById(state.selectedBrokenLampId)) {
            state.selectedBrokenLampId = sorted[0].id;
        }
        if (!findLampById(state.selectedReplaceLampId)) {
            state.selectedReplaceLampId = sorted[0].id;
        }

        elements.brokenSelect.innerHTML = sorted
            .map((lamp) => `<option value="${lamp.id}">#${lamp.id} - ${getStatusText(lamp.status)}</option>`)
            .join('');
        elements.replaceSelect.innerHTML = sorted
            .map((lamp) => `<option value="${lamp.id}">#${lamp.id} - ${getStatusText(lamp.status)}</option>`)
            .join('');

        elements.brokenSelect.value = String(state.selectedBrokenLampId);
        elements.replaceSelect.value = String(state.selectedReplaceLampId);
    }

    function renderTaskList() {
        if (!elements.taskList) {
            return;
        }

        if (!state.tasks.length) {
            elements.taskList.innerHTML = '<div class="map-task">Нет активных задач</div>';
            return;
        }

        const rows = state.tasks
            .slice()
            .sort((a, b) => Number(new Date(b.startedAt)) - Number(new Date(a.startedAt)))
            .map((task) => {
                const lamp = findLampById(task.lampId);
                const status = task.status;
                const started = new Date(task.startedAt);

                return `
                    <div class="map-task">
                        <div><strong>Фонарь #${task.lampId}</strong></div>
                        <div>Статус: <span class="map-task-status" style="color:${getColor(status)}">${getStatusText(status)}</span></div>
                        <div style="font-size:12px; opacity:0.8;">${started.toLocaleTimeString()}</div>
                        <div style="font-size:12px; opacity:0.8;">Текущий статус лампы: ${lamp ? getStatusText(lamp.status) : 'нет данных'}</div>
                    </div>
                `;
            })
            .join('');

        elements.taskList.innerHTML = rows;
    }

    function updateControlButtons() {
        const busy = state.droneStatus !== 'idle';
        elements.startBtn.disabled = busy;
        elements.startBtn.textContent = busy ? 'Дрон занят' : 'Запустить замену';
    }

    function markSelectedLampBroken() {
        const lamp = findLampById(state.selectedBrokenLampId);
        if (!lamp) {
            return;
        }

        if (lamp.status === 'in_progress') {
            return;
        }

        setLampStatus(lamp, 'broken');
        renderSelectors();
        renderSelectedLampInfo();
        renderTaskList();
    }

    function scheduleReplacementForSelected() {
        const lamp = findLampById(state.selectedReplaceLampId);
        if (!lamp) {
            return;
        }

        if (lamp.status === 'in_progress') {
            return;
        }

        if (lamp.status !== 'scheduled') {
            setLampStatus(lamp, 'scheduled');
        }

        createTaskIfMissing(lamp.id);
        renderSelectors();
        renderTaskList();
        renderSelectedLampInfo();
    }

    function flyDroneTo(target, callback) {
        if (!state.droneMarker) {
            if (typeof callback === 'function') {
                callback();
            }
            return;
        }

        if (state.flightTimer) {
            clearInterval(state.flightTimer);
            state.flightTimer = null;
        }

        const start = state.droneMarker.getLatLng();
        const steps = 70;
        let step = 0;
        const latStep = (target.lat - start.lat) / steps;
        const lngStep = (target.lng - start.lng) / steps;
        let currentLat = start.lat;
        let currentLng = start.lng;

        state.flightTimer = setInterval(() => {
            if (step >= steps) {
                clearInterval(state.flightTimer);
                state.flightTimer = null;
                state.droneMarker.setLatLng([target.lat, target.lng]);
                if (typeof callback === 'function') {
                    callback();
                }
                return;
            }

            currentLat += latStep;
            currentLng += lngStep;
            state.droneMarker.setLatLng([currentLat, currentLng]);
            step += 1;
        }, 40);
    }

    function startReplacementForSelected() {
        const lamp = findLampById(state.selectedReplaceLampId);
        if (!lamp) {
            return;
        }

        if (state.droneStatus !== 'idle') {
            return;
        }

        const task = createTaskIfMissing(lamp.id);
        task.status = 'flying';
        task.startedAt = new Date().toISOString();

        setLampStatus(lamp, 'in_progress');
        setDroneStatus('flying', lamp.id);
        renderSelectors();
        renderTaskList();
        renderSelectedLampInfo();

        flyDroneTo(lamp, () => {
            task.status = 'replacing';
            setDroneStatus('replacing', lamp.id);
            renderTaskList();

            setTimeout(() => {
                setLampStatus(lamp, 'working');
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
                setDroneStatus('returning');
                renderSelectors();
                renderTaskList();
                renderSelectedLampInfo();

                flyDroneTo(droneStart, () => {
                    setDroneStatus('idle');

                    setTimeout(() => {
                        removeTaskForLamp(lamp.id);
                        renderTaskList();
                    }, 2200);
                });
            }, 4200);
        });
    }

    function bindControls() {
        elements.brokenSelect.addEventListener('change', () => {
            state.selectedBrokenLampId = Number(elements.brokenSelect.value);
        });

        elements.replaceSelect.addEventListener('change', () => {
            state.selectedReplaceLampId = Number(elements.replaceSelect.value);
        });

        elements.markBrokenBtn.addEventListener('click', markSelectedLampBroken);
        elements.scheduleBtn.addEventListener('click', scheduleReplacementForSelected);
        elements.startBtn.addEventListener('click', startReplacementForSelected);
    }

    function ensureMapInitialized() {
        if (state.initialized || typeof L === 'undefined') {
            return;
        }

        state.map = L.map(elements.mapCanvas).setView([55.780941, 49.132776], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(state.map);

        lamps.forEach((lamp) => {
            lamp.marker = L.circleMarker([lamp.lat, lamp.lng], {
                radius: 8,
                color: getColor(lamp.status),
                fillColor: getColor(lamp.status),
                fillOpacity: 1
            }).addTo(state.map);

            lamp.marker.on('click', () => {
                state.selectedLampId = lamp.id;
                state.selectedBrokenLampId = lamp.id;
                state.selectedReplaceLampId = lamp.id;
                renderSelectors();
                renderSelectedLampInfo();
            });

            lamp.marker.bindTooltip(`Фонарь #${lamp.id}`, { direction: 'top' });

            if (lamp.status === 'scheduled') {
                createTaskIfMissing(lamp.id);
            }
        });

        state.droneMarker = L.circleMarker([droneStart.lat, droneStart.lng], {
            radius: 6,
            color: '#7a39c9',
            fillColor: '#7a39c9',
            fillOpacity: 1
        }).addTo(state.map);

        state.selectedBrokenLampId = lamps[0] ? lamps[0].id : null;
        state.selectedReplaceLampId = lamps[0] ? lamps[0].id : null;
        state.selectedLampId = lamps[0] ? lamps[0].id : null;

        bindControls();
        renderSelectors();
        renderSelectedLampInfo();
        renderTaskList();
        setDroneStatus('idle');

        state.initialized = true;
    }

    window.__mapTabApi = {
        onShow() {
            ensureMapInitialized();
            if (state.map) {
                setTimeout(() => state.map.invalidateSize(), 0);
            }
        },
        invalidateSize() {
            if (state.map) {
                state.map.invalidateSize();
            }
        }
    };
})();
