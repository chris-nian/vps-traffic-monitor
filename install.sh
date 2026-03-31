#!/bin/bash
set -e

# ============================================================
#  VPS Traffic Monitor - One-Click Installer
#  Supports: CentOS 8 / RHEL 8 / Rocky Linux 8 / AlmaLinux 8
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="/opt/vps-traffic-monitor"
DASHBOARD_PORT="${1:-8080}"

log()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info()  { echo -e "${CYAN}[i]${NC} $1"; }

# ---- Pre-flight checks ----
[[ $EUID -ne 0 ]] && error "Please run as root"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   VPS Traffic Monitor - One-Click Installer  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""
info "Dashboard port: $DASHBOARD_PORT"
echo ""

# ---- Detect primary network interface ----
IFACE=$(ip route show default | awk '/default/ {print $5}' | head -1)
if [[ -z "$IFACE" ]]; then
    IFACE="eth0"
    warn "Could not detect default interface, falling back to eth0"
fi
log "Network interface: $IFACE"

# ---- 1. Install dependencies ----
info "Installing system packages..."
yum install -y epel-release > /dev/null 2>&1
yum install -y vnstat iftop nethogs firewalld > /dev/null 2>&1

# Install Node.js if missing
if ! command -v node &> /dev/null; then
    info "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    yum install -y nodejs > /dev/null 2>&1
fi
log "Dependencies installed (node $(node -v))"

# ---- 2. Configure firewall ----
info "Configuring firewall..."
systemctl enable --now firewalld > /dev/null 2>&1

# Bind interface
firewall-cmd --permanent --add-interface="$IFACE" > /dev/null 2>&1 || true

# Remove default open services
for svc in cockpit dhcpv6-client; do
    firewall-cmd --permanent --remove-service="$svc" > /dev/null 2>&1 || true
done

# We remove the service-based ssh entry in favour of the port + rich-rule below
firewall-cmd --permanent --remove-service=ssh > /dev/null 2>&1 || true

# Open only essential ports
firewall-cmd --permanent --add-port=22/tcp  > /dev/null 2>&1 || true
firewall-cmd --permanent --add-port=80/tcp  > /dev/null 2>&1 || true
firewall-cmd --permanent --add-port=443/tcp > /dev/null 2>&1 || true
firewall-cmd --permanent --add-port="${DASHBOARD_PORT}/tcp" > /dev/null 2>&1 || true

# SSH rate limiting (5 per minute)
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" port port="22" protocol="tcp" accept limit value="5/m" log prefix="ssh_rate_limit "' > /dev/null 2>&1 || true

# Default policy: DROP
firewall-cmd --permanent --set-target=DROP > /dev/null 2>&1 || true
firewall-cmd --reload > /dev/null 2>&1
log "Firewall configured (DROP policy, ports: 22, 80, 443, $DASHBOARD_PORT)"

# ---- 3. Deploy application ----
info "Deploying dashboard..."

# Determine source directory (works whether run from cloned repo or via curl)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$INSTALL_DIR"

# If run from the repo, copy app files; otherwise they should already be in place
if [[ -d "$SCRIPT_DIR/app" ]]; then
    cp -r "$SCRIPT_DIR/app/"* "$INSTALL_DIR/"
fi

# Write the detected interface into a small config file
cat > "$INSTALL_DIR/config.json" <<EOF
{
  "port": $DASHBOARD_PORT,
  "interface": "$IFACE",
  "dataDir": "$INSTALL_DIR/data"
}
EOF

mkdir -p "$INSTALL_DIR/data"

cd "$INSTALL_DIR"
npm install --production > /dev/null 2>&1
log "Application deployed to $INSTALL_DIR"

# ---- 4. Create systemd service ----
cat > /etc/systemd/system/traffic-monitor.service <<EOF
[Unit]
Description=VPS Traffic Monitor Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable traffic-monitor > /dev/null 2>&1
systemctl restart traffic-monitor
log "Service started and enabled"

# ---- 5. Start vnstat ----
systemctl enable --now vnstat > /dev/null 2>&1
log "vnStat started"

# ---- Done ----
SERVER_IP=$(ip -4 addr show "$IFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Installation Complete!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Dashboard:  ${CYAN}http://${SERVER_IP}:${DASHBOARD_PORT}${NC}"
echo ""
echo -e "  Firewall:   DROP all, allow 22/80/443/${DASHBOARD_PORT}"
echo -e "  SSH:        rate-limited to 5/min"
echo ""
echo -e "  Useful commands:"
echo -e "    ${YELLOW}nethogs $IFACE${NC}          Real-time per-process traffic"
echo -e "    ${YELLOW}iftop -i $IFACE${NC}         Real-time per-connection traffic"
echo -e "    ${YELLOW}vnstat -d${NC}               Daily traffic stats"
echo -e "    ${YELLOW}vnstat -m${NC}               Monthly traffic stats"
echo ""
