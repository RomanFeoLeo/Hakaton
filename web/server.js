const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.use('/models', express.static('models'));

const lamps = [
    { id: 1, lat: 55.751244, lng: 37.618423, status: 'on', temperature: 25, needsReplacement: false },
    { id: 2, lat: 55.752244, lng: 37.619423, status: 'off', temperature: 18, needsReplacement: true },
    { id: 3, lat: 55.753244, lng: 37.620423, status: 'on', temperature: 22, needsReplacement: false },
    { id: 4, lat: 55.754244, lng: 37.621423, status: 'fault', temperature: 45, needsReplacement: true },
];

let replacementTasks = [];
let droneStatus = 'idle';
let activeTargetLampId = null;

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.send(JSON.stringify({
        type: 'initial',
        data: { lamps, replacementTasks, droneStatus, activeTargetLampId }
    }));

    const interval = setInterval(() => {
        lamps.forEach((lamp) => {
            if (lamp.status === 'on') {
                lamp.temperature += Math.random() * 2 - 1;
                lamp.temperature = Math.max(20, Math.min(60, lamp.temperature));
            }
        });

        ws.send(JSON.stringify({
            type: 'update',
            data: { lamps, replacementTasks, droneStatus, activeTargetLampId }
        }));
    }, 5000);

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (err) {
            return;
        }

        switch (data.type) {
            case 'startReplacement':
                startReplacement(Number(data.lampId));
                break;
            case 'cancelReplacement':
                cancelReplacement(Number(data.taskId));
                break;
            case 'setLampFault':
                setLampFault(Number(data.lampId), data.status);
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
    const lamp = lamps.find((item) => item.id === lampId);
    if (!lamp) return;
    if (droneStatus !== 'idle') return;

    const task = {
        id: Date.now(),
        lampId,
        status: 'flying',
        startedAt: new Date().toISOString(),
        estimatedTime: 5
    };

    replacementTasks.push(task);
    activeTargetLampId = lampId;
    lamp.needsReplacement = false;
    droneStatus = 'flying';
    broadcastUpdate();

    setTimeout(() => {
        droneStatus = 'replacing';
        task.status = 'replacing';
        broadcastUpdate();

        setTimeout(() => {
            lamp.status = 'on';
            lamp.temperature = 25;
            lamp.needsReplacement = false;
            task.status = 'completed';
            task.completedAt = new Date().toISOString();

            droneStatus = 'returning';
            broadcastUpdate();

            setTimeout(() => {
                droneStatus = 'idle';
                activeTargetLampId = null;
                broadcastUpdate();
            }, 2000);
        }, 5000);
    }, 3000);
}

function setLampFault(lampId, requestedStatus) {
    const lamp = lamps.find((item) => item.id === lampId);
    if (!lamp) return;

    const status = requestedStatus === 'off' ? 'off' : 'fault';
    lamp.status = status;
    lamp.needsReplacement = true;

    if (status === 'fault') {
        lamp.temperature = Math.max(lamp.temperature, 45);
    }

    broadcastUpdate();
}

function cancelReplacement(taskId) {
    replacementTasks = replacementTasks.filter((task) => task.id !== taskId);
    droneStatus = 'returning';
    activeTargetLampId = null;

    setTimeout(() => {
        droneStatus = 'idle';
        broadcastUpdate();
    }, 2000);

    broadcastUpdate();
}

function updateDronePosition(position) {
    broadcastUpdate();
}

function broadcastUpdate() {
    const payload = JSON.stringify({
        type: 'update',
        data: { lamps, replacementTasks, droneStatus, activeTargetLampId }
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
