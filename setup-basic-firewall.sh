#!/bin/bash
# 基本防火墙规则设置脚本
# 使用方法: bash setup-basic-firewall.sh

echo "=== VPS 防火墙基本规则设置 ==="
echo "⚠️  警告：此脚本将修改 iptables 规则"
echo ""
read -p "是否继续？(y/n): " confirm

if [ "$confirm" != "y" ]; then
    echo "操作已取消"
    exit 0
fi

echo "正在设置防火墙规则..."

# 清除所有现有规则
iptables -F
iptables -X
iptables -Z

# 设置默认策略（拒绝所有，然后允许需要的）
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# 允许本地回环
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# 允许已建立的连接
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 允许 SSH（根据你的 SSH 端口修改，默认 22）
SSH_PORT=22
echo "允许 SSH 端口: $SSH_PORT"
iptables -A INPUT -p tcp --dport $SSH_PORT -j ACCEPT

# 允许 HTTP 和 HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# 允许流量监控端口（8080）
iptables -A INPUT -p tcp --dport 8080 -j ACCEPT

# 防止 SSH 暴力破解（限制每分钟最多 3 个新连接）
iptables -A INPUT -p tcp --dport $SSH_PORT -m state --state NEW -m recent --set
iptables -A INPUT -p tcp --dport $SSH_PORT -m state --state NEW -m recent --update --seconds 60 --hitcount 3 -j DROP

# 防止 Ping 洪水攻击
iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 1/s -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-request -j DROP

# 记录并丢弃其他数据包
iptables -A INPUT -j LOG --log-prefix "[防火墙丢弃]: " --log-level 4
iptables -A INPUT -j DROP

# 保存规则（根据系统不同，命令可能不同）
echo ""
echo "防火墙规则设置完成！"
echo ""
echo "当前规则："
iptables -L -n -v --line-numbers

echo ""
echo "⚠️  重要提醒："
echo "1. 这些规则在重启后会丢失"
echo "2. 要永久保存，需要使用："
echo "   - CentOS/RHEL: service iptables save"
echo "   - Debian/Ubuntu: iptables-save > /etc/iptables/rules.v4"
echo ""
echo "3. 确保 SSH 端口正确，否则会被锁定在外！"
echo "4. 当前允许的端口: SSH($SSH_PORT), HTTP(80), HTTPS(443), 监控(8080)"