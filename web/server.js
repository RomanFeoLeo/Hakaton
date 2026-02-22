const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.use('/models', express.static('models'));

// Состояние ламп
const lamps = [
    { id: 1, lat: 55.751244, lng: 37.618423, status: 'on', temperature: 25, needsReplacement: false },
    { id: 2, lat: 55.752244, lng: 37.619423, status: 'off', temperature: 18, needsReplacement: true },
    { id: 3, lat: 55.753244, lng: 37.620423, status: 'on', temperature: 22, needsReplacement: false },
    { id: 4, lat: 55.754244, lng: 37.621423, status: 'fault', temperature: 45, needsReplacement: true },
];

// Текущие задачи на замену
let replacementTasks = [];
let droneStatus = 'idle'; // idle, flying, replacing, returning

wss.on('connection', (ws) => {
    console.log('Client connected');

    // Отправляем начальное состояние
    ws.send(JSON.stringify({
        type: 'initial',
        data: { lamps, replacementTasks, droneStatus }
    }));

    // Симуляция обновлений
    const interval = setInterval(()  => {
        // Обновляем температуру ламп
        lamps.forEach(lamp => {
            if (lamp.status === 'on') {
                lamp.temperature += Math.random() * 2 - 1;
                lamp.temperature = Math.max(20, Math.min(60, lamp.temperature));
            }
        });

        ws.send(JSON.stringify({
            type: 'update',
            data: { lamps, droneStatus }
        }));
    }, 5000);

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch(data.type) {
            case 'startReplacement':
                startReplacement(data.lampId);
                break;
            case 'cancelReplacement':
                cancelReplacement(data.taskId);
                break;
            case 'updateDronePosition':
                updateDronePosition(data.position);
                break;
        }
    });

    ws.on('close', () => {
        clearInterval(interval);
        console.log('Client disconnected');
    });
});

function startReplacement(lampId) {
    const lamp = lamps.find(l => l.id === lampId);
    if (!lamp) return;

    const task = {
        id: Date.now(),
        lampId: lampId,
        status: 'pending',
        startedAt: new Date().toISOString(),
        estimatedTime: 5 // минут
    };

    replacementTasks.push(task);
    lamp.needsReplacement = false;

    // Симуляция работы дрона
    droneStatus = 'flying';

    setTimeout(() => {
        droneStatus = 'replacing';

        setTimeout(() => {
            // Замена выполнена
            lamp.status = 'on';
            lamp.temperature = 25;
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
            droneStatus = 'returning';

            setTimeout(() => {
                droneStatus = 'idle';
            }, 2000);

        }, 5000);
    }, 3000);

    broadcastUpdate();
}

function cancelReplacement(taskId) {
    replacementTasks = replacementTasks.filter(t => t.id !== taskId);
    droneStatus = 'returning';

    setTimeout(() => {
        droneStatus = 'idle';
    }, 2000);

    broadcastUpdate();
}

function updateDronePosition(position) {
    // Обновление позиции дрона для анимации
    broadcastUpdate();
}

function broadcastUpdate() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'update',
                data: { lamps, replacementTasks, droneStatus }
            }));
        }
    });
}

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});