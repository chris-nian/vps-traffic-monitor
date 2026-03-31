const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 8080;

// Data storage
const DATA_DIR = '/root/traffic-monitor/data';
const DATA_FILE = path.join(DATA_DIR, 'traffic-data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Read traffic data
function readTrafficData() {
    if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    return {
        history: [],
        alerts: [],
        firewall_logs: []
    };
}

// Write traffic data
function writeTrafficData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get network interface stats
function getNetworkStats() {
    try {
        const stats = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = stats.split('\n');

        for (const line of lines) {
            if (line.includes('eth0:')) {
                const parts = line.trim().split(/\s+/);
                return {
                    interface: 'eth0',
                    rx_bytes: parseInt(parts[1]),
                    rx_packets: parseInt(parts[2]),
                    tx_bytes: parseInt(parts[9]),
                    tx_packets: parseInt(parts[10]),
                    timestamp: Date.now()
                };
            }
        }
    } catch (error) {
        console.error('Error reading network stats:', error);
    }
    return null;
}

// Get firewall recent logs
function getFirewallLogs() {
    try {
        const logs = execSync('journalctl -n 100 --no-pager | grep -i "firewall\\|ssh_rate_limit\\|dropped" || true', { encoding: 'utf8' });
        return logs.split('\n').filter(line => line.trim());
    } catch (error) {
        return [];
    }
}

// Get connection statistics
function getConnectionStats() {
    try {
        const connections = execSync('ss -s', { encoding: 'utf8' });
        return connections;
    } catch (error) {
        return 'Error getting connection stats';
    }
}

// Analyze traffic patterns
function analyzeTraffic(current, previous) {
    const alerts = [];

    if (previous && current) {
        const rxRate = (current.rx_bytes - previous.rx_bytes) / 1024; // KB/s
        const txRate = (current.tx_bytes - previous.tx_bytes) / 1024;

        if (rxRate > 1024) { // > 1 MB/s
            alerts.push({
                type: 'warning',
                message: `High incoming traffic: ${(rxRate/1024).toFixed(2)} MB/s`,
                timestamp: Date.now()
            });
        }

        if (txRate > 1024) { // > 1 MB/s
            alerts.push({
                type: 'warning',
                message: `High outgoing traffic: ${(txRate/1024).toFixed(2)} MB/s`,
                timestamp: Date.now()
            });
        }
    }

    return alerts;
}

// Store previous stats for rate calculation
let previousStats = null;

// Update data every 10 seconds
cron.schedule('*/10 * * * * *', () => {
    const currentStats = getNetworkStats();
    const data = readTrafficData();

    if (currentStats) {
        const alerts = analyzeTraffic(currentStats, previousStats);

        // Keep only last 24 hours of data (8640 entries for 10s intervals)
        data.history.push(currentStats);
        if (data.history.length > 8640) {
            data.history = data.history.slice(-8640);
        }

        // Add alerts
        data.alerts.push(...alerts);
        if (data.alerts.length > 100) {
            data.alerts = data.alerts.slice(-100);
        }

        writeTrafficData(data);
        previousStats = currentStats;

        // Broadcast to connected clients
        io.emit('traffic-update', {
            current: currentStats,
            alerts: alerts.slice(-5)
        });
    }
});

// Update firewall logs every minute
cron.schedule('*/1 * * * *', () => {
    const logs = getFirewallLogs();
    const data = readTrafficData();
    data.firewall_logs = logs.slice(-50); // Keep last 50 log entries
    writeTrafficData(data);
});

// API Routes
app.get('/api/stats', (req, res) => {
    const data = readTrafficData();
    const currentStats = getNetworkStats();
    const connStats = getConnectionStats();

    res.json({
        current: currentStats,
        history: data.history.slice(-144), // Last 24 hours (every 10 mins)
        alerts: data.alerts.slice(-20),
        firewall_logs: data.firewall_logs,
        connections: connStats
    });
});

app.get('/api/firewall-logs', (req, res) => {
    const data = readTrafficData();
    res.json(data.firewall_logs);
});

app.get('/api/alerts', (req, res) => {
    const data = readTrafficData();
    res.json(data.alerts.slice(-50));
});

app.get('/api/live', (req, res) => {
    const currentStats = getNetworkStats();
    const connStats = getConnectionStats();
    const data = readTrafficData();

    // Calculate rates
    let rxRate = 0, txRate = 0;
    if (data.history.length > 1) {
        const prev = data.history[data.history.length - 2];
        if (currentStats && prev) {
            const timeDiff = (currentStats.timestamp - prev.timestamp) / 1000;
            rxRate = ((currentStats.rx_bytes - prev.rx_bytes) / timeDiff / 1024).toFixed(2);
            txRate = ((currentStats.tx_bytes - prev.tx_bytes) / timeDiff / 1024).toFixed(2);
        }
    }

    res.json({
        current: currentStats,
        rates: {
            rx: rxRate + ' KB/s',
            tx: txRate + ' KB/s'
        },
        connections: connStats
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected');

    // Send current stats on connection
    const currentStats = getNetworkStats();
    const data = readTrafficData();
    socket.emit('traffic-update', {
        current: currentStats,
        alerts: data.alerts.slice(-5)
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Traffic Monitor running on http://0.0.0.0:${PORT}`);
});
