# VPS Traffic Monitor

一键部署的 VPS 流量监控与安全防护系统。

## 功能特性

- 🔒 **防火墙保护**: 默认 DROP 策略，仅开放必要端口
- 📊 **实时监控**: Web 仪表板实时显示流量数据
- 🚨 **智能告警**: 自动检测异常流量
- 🛡️ **SSH 防护**: 速率限制防止暴力破解
- 📈 **历史统计**: 24 小时流量趋势分析

## 快速安装

```bash
# 一键安装（使用默认端口 8080）
curl -fsSL https://raw.githubusercontent.com/chris-nian/vps-traffic-monitor/main/install.sh | bash

# 或指定自定义端口
curl -fsSL https://raw.githubusercontent.com/chris-nian/vps-traffic-monitor/main/install.sh | bash -s 3000
```

## 手动安装

```bash
git clone https://github.com/chris-nian/vps-traffic-monitor.git
cd vps-traffic-monitor
chmod +x install.sh
./install.sh [端口号]
```

## 访问仪表板

安装完成后，在浏览器中访问：

```
http://你的服务器IP:8080
```

## 防火墙配置

系统会自动配置以下规则：

- **默认策略**: DROP（拒绝所有入站）
- **开放端口**: 22 (SSH), 80 (HTTP), 443 (HTTPS), 8080 (监控面板)
- **SSH 保护**: 每分钟最多 5 次连接

## 常用命令

```bash
# 查看服务状态
systemctl status traffic-monitor

# 重启服务
systemctl restart traffic-monitor

# 查看实时流量（按进程）
nethogs eth0

# 查看实时流量（按连接）
iftop -i eth0

# 查看历史统计
vnstat -d

# 查看防火墙规则
firewall-cmd --list-all

# 查看防火墙日志
journalctl | grep "ssh_rate_limit"
```

## 系统要求

- CentOS 8 / RHEL 8 / Rocky Linux 8 / AlmaLinux 8
- Root 权限
- 至少 512MB RAM
- Node.js 14+ (脚本会自动安装)

## 卸载

```bash
systemctl stop traffic-monitor
systemctl disable traffic-monitor
rm -rf /opt/vps-traffic-monitor
rm /etc/systemd/system/traffic-monitor.service
systemctl daemon-reload
```

## License

MIT
