const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const session = require('express-session');
const bcrypt = require('bcryptjs');

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

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'vps-traffic-monitor-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'vps-monitor.sid'
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// Login attempt tracking (in-memory, for production use Redis)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function cleanupOldAttempts() {
    const now = Date.now();
    for (const [ip, data] of loginAttempts.entries()) {
        if (data.lockUntil && data.lockUntil < now) {
            loginAttempts.delete(ip);
        }
    }
}

// Clean up old attempts every 5 minutes
cron.schedule('*/5 * * * *', cleanupOldAttempts);

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

// Authentication Routes

// Check authentication status
app.get('/api/auth/check', (req, res) => {
    if (req.session && req.session.authenticated) {
        res.json({
            authenticated: true,
            username: req.session.username
        });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // Check if IP is locked out
    const attempts = loginAttempts.get(ip);
    if (attempts && attempts.lockUntil && attempts.lockUntil > Date.now()) {
        const remainingTime = Math.ceil((attempts.lockUntil - Date.now()) / 1000 / 60);
        return res.status(429).json({
            success: false,
            message: `账户已锁定，请在 ${remainingTime} 分钟后重试`,
            lockoutTime: attempts.lockUntil,
            lockoutDuration: LOCKOUT_DURATION
        });
    }

    // Load admin credentials from config file
    let adminCredentials;
    try {
        const configPath = path.join(__dirname, 'admin-config.json');
        if (fs.existsSync(configPath)) {
            adminCredentials = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            // Default credentials (should be changed)
            adminCredentials = {
                username: 'admin',
                passwordHash: bcrypt.hashSync('admin123', 10)
            };
            // Save default config
            fs.writeFileSync(configPath, JSON.stringify(adminCredentials, null, 2));
        }
    } catch (error) {
        console.error('Error loading admin config:', error);
        return res.status(500).json({
            success: false,
            message: '服务器配置错误'
        });
    }

    // Validate credentials
    if (username === adminCredentials.username) {
        const isPasswordValid = await bcrypt.compare(password, adminCredentials.passwordHash);

        if (isPasswordValid) {
            // Successful login - reset attempts
            loginAttempts.delete(ip);

            req.session.authenticated = true;
            req.session.username = username;
            req.session.loginTime = Date.now();

            return res.json({
                success: true,
                message: '登录成功'
            });
        }
    }

    // Failed login attempt
    if (!attempts) {
        loginAttempts.set(ip, { count: 1, lockUntil: null });
    } else {
        attempts.count++;
        if (attempts.count >= MAX_ATTEMPTS) {
            attempts.lockUntil = Date.now() + LOCKOUT_DURATION;
            attempts.count = 0;
            loginAttempts.set(ip, attempts);

            return res.status(429).json({
                success: false,
                message: `登录失败次数过多，账户已锁定 ${LOCKOUT_DURATION / 60000} 分钟`,
                lockoutTime: attempts.lockUntil,
                lockoutDuration: LOCKOUT_DURATION
            });
        } else {
            loginAttempts.set(ip, attempts);
        }
    }

    const remainingAttempts = MAX_ATTEMPTS - (attempts?.count || 0);
    res.status(401).json({
        success: false,
        message: '用户名或密码错误',
        remainingAttempts: remainingAttempts
    });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ success: false, message: '退出登录失败' });
        }
        res.json({ success: true, message: '已成功退出登录' });
    });
});

// Change password endpoint
app.post('/api/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: '请提供当前密码和新密码'
        });
    }

    if (newPassword.length < 12) {
        return res.status(400).json({
            success: false,
            message: '新密码长度至少需要 12 个字符'
        });
    }

    try {
        // Load admin credentials
        const configPath = path.join(__dirname, 'admin-config.json');
        let adminCredentials;

        if (fs.existsSync(configPath)) {
            adminCredentials = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            return res.status(500).json({
                success: false,
                message: '服务器配置错误'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, adminCredentials.passwordHash);

        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                success: false,
                message: '当前密码错误'
            });
        }

        // Hash new password
        const newPasswordHash = bcrypt.hashSync(newPassword, 10);

        // Update credentials
        adminCredentials.passwordHash = newPasswordHash;
        fs.writeFileSync(configPath, JSON.stringify(adminCredentials, null, 2));

        // Log the password change
        console.log(`Password changed for user ${adminCredentials.username} at ${new Date().toISOString()}`);

        res.json({
            success: true,
            message: '密码修改成功'
        });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({
            success: false,
            message: '密码修改失败，请稍后重试'
        });
    }
});

// Firewall Rules Management

// Get firewall rules
app.get('/api/firewall/rules', requireAuth, async (req, res) => {
    try {
        const rules = await getFirewallRules();
        res.json(rules);
    } catch (error) {
        console.error('Error getting firewall rules:', error);
        res.status(500).json({ error: 'Failed to get firewall rules', message: error.message });
    }
});

function getFirewallRules() {
    return new Promise((resolve, reject) => {
        try {
            // Get iptables rules
            const iptablesOutput = execSync('iptables -L -n -v --line-numbers 2>/dev/null || echo "No iptables rules"', { encoding: 'utf8' });

            // Parse iptables output
            const chains = {};
            const lines = iptablesOutput.split('\n');

            let currentChain = null;
            let inRulesSection = false;

            for (const line of lines) {
                const trimmed = line.trim();

                // Match chain header (e.g., "Chain INPUT (policy ACCEPT)")
                const chainMatch = trimmed.match(/^Chain (\w+) \(policy (\w+)\)/);
                if (chainMatch) {
                    currentChain = chainMatch[1];
                    const policy = chainMatch[2];
                    chains[currentChain] = {
                        policy: policy,
                        rules: []
                    };
                    inRulesSection = false;
                    continue;
                }

                // Skip header lines
                if (trimmed.includes('pkts bytes') || trimmed.includes('target prot opt source destination')) {
                    inRulesSection = true;
                    continue;
                }

                // Parse rule line
                if (inRulesSection && currentChain && trimmed && !trimmed.startsWith('Chain')) {
                    const parts = trimmed.split(/\s+/).filter(p => p);

                    if (parts.length >= 8) {
                        const rule = {
                            num: parts[0] || '',
                            pkts: parts[1] || '',
                            bytes: parts[2] || '',
                            target: parts[3] || '',
                            prot: parts[4] || '',
                            opt: parts[5] || '',
                            source: parts[6] || '',
                            destination: parts[7] || '',
                            options: parts.slice(8).join(' ') || ''
                        };

                        // Extract port info from options
                        const dportMatch = rule.options.match(/dpt:(\d+)/);
                        const sportMatch = rule.options.match(/spt:(\d+)/);
                        if (dportMatch) rule.dport = dportMatch[1];
                        if (sportMatch) rule.sport = sportMatch[1];

                        chains[currentChain].rules.push(rule);
                    }
                }
            }

            // Calculate statistics
            let totalRules = 0;
            const stats = { total: 0 };
            for (const [chainName, chainData] of Object.entries(chains)) {
                const ruleCount = chainData.rules.length;
                stats[chainName] = ruleCount;
                stats.total += ruleCount;
            }

            resolve({
                chains: chains,
                stats: stats,
                raw: iptablesOutput,
                timestamp: Date.now()
            });
        } catch (error) {
            reject(error);
        }
    });
}

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
