# VPS Traffic Monitor

一键部署的 VPS 流量监控与安全防护系统。

## 功能特性

- 🔒 **防火墙保护**: 默认 DROP 策略，仅开放必要端口
- 📊 **实时监控**: Web 仪表板实时显示流量数据
- 🚨 **智能告警**: 自动检测异常流量
- 🛡️ **SSH 防护**: 速率限制防止暴力破解
- 📈 **历史统计**: 24 小时流量趋势分析
- 🔌 **端口管理**: 通过 Web 界面管理防火墙端口（需登录）

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

## 访问界面

安装完成后，有两个页面可以访问：

### 公开页面 - 流量监控
```
http://你的服务器IP:8080
```
- **无需登录**
- 显示实时流量数据
- 流量趋势图表
- 告警信息
- 防火墙日志

### 管理页面 - 端口管理
```
http://你的服务器IP:8080/admin
```
- **需要登录**
- 开放/关闭防火墙端口
- 查看当前开放端口列表
- 操作审计日志
- 修改密码

**默认登录凭据**:
- 用户名: `admin`
- 密码: `admin123`

⚠️ **首次登录后请立即修改密码！**

## 安全架构

系统采用严格的页面分离设计：

### 页面分离

| 页面 | 地址 | 认证要求 | 功能 |
|------|------|----------|------|
| 流量监控 | `/` | 公开访问 | 流量图表、告警、日志 |
| 管理面板 | `/admin` | 需要登录 | 端口管理、审计日志 |

### 安全措施

1. **页面隔离**
   - 公开页面完全独立，不包含任何管理功能
   - 管理页面 HTML 文件放在 `views/` 目录，不在 `public/` 目录
   - 无法通过静态文件访问管理页面

2. **API 认证**
   - 所有端口管理 API 都需要有效的会话认证
   - 使用 `requireAuth` 中间件保护敏感操作
   - 会话超时: 24 小时

3. **防暴力破解**
   - 登录失败 5 次后锁定 IP 15 分钟
   - IP 级别的速率限制

4. **输入验证**
   - 端口号范围: 1-65535
   - 协议限制: 只能是 tcp 或 udp
   - 防止命令注入

5. **受保护端口**
   - 端口 22 (SSH) 无法关闭
   - 端口 80 (HTTP) 无法关闭
   - 端口 443 (HTTPS) 无法关闭

6. **审计日志**
   - 记录所有端口操作（开放/关闭）
   - 包含时间戳、用户、操作详情
   - 日志位置: `/opt/vps-traffic-monitor/data/audit.log`

## 防火墙配置

系统会自动配置以下规则：

- **默认策略**: DROP（拒绝所有入站）
- **开放端口**: 22 (SSH), 80 (HTTP), 443 (HTTPS), 8080 (监控面板)
- **SSH 保护**: 每分钟最多 5 次连接，超过则阻止并记录

## 常用命令

### 服务管理

```bash
# 查看服务状态
systemctl status traffic-monitor

# 重启服务
systemctl restart traffic-monitor

# 停止服务
systemctl stop traffic-monitor

# 启动服务
systemctl start traffic-monitor

# 查看服务日志
journalctl -u traffic-monitor -f
```

### 流量监控

```bash
# 查看实时流量（按进程）
nethogs eth0

# 查看实时流量（按连接）
iftop -i eth0

# 查看历史统计
vnstat -d

# 查看本月统计
vnstat -m
```

### 防火墙管理

```bash
# 查看防火墙规则
firewall-cmd --list-all

# 查看防火墙日志
journalctl | grep "ssh_rate_limit"

# 查看被阻止的连接
journalctl | grep "DROP"
```

### 命令行端口管理（备用方案）

如果无法访问 Web 管理页面，可以使用命令行脚本：

```bash
# 查看开放端口
/opt/vps-traffic-monitor/scripts/manage-ports.sh list

# 开放端口
/opt/vps-traffic-monitor/scripts/manage-ports.sh open 3000 tcp

# 关闭端口
/opt/vps-traffic-monitor/scripts/manage-ports.sh close 3000 tcp
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

## 故障排查

### 无法访问管理页面

```bash
# 检查服务状态
systemctl status traffic-monitor

# 查看服务日志
journalctl -u traffic-monitor -n 50

# 重置密码（恢复为默认）
rm /opt/vps-traffic-monitor/admin-config.json
systemctl restart traffic-monitor
```

### 端口操作失败

- 确保已登录管理页面
- 检查端口号是否在有效范围内 (1-65535)
- 确认协议是否为 tcp 或 udp
- 尝试访问的端口是否为受保护端口 (22, 80, 443)

### 忘记密码

```bash
# 删除配置文件
rm /opt/vps-traffic-monitor/admin-config.json

# 重启服务
systemctl restart traffic-monitor

# 使用默认凭据登录: admin / admin123
```

## 安全建议

1. **修改默认密码**: 首次登录后立即修改
2. **定期检查日志**: 查看审计日志了解系统活动
3. **最小权限原则**: 只开放必要的端口
4. **使用强密码**: 密码至少 12 个字符，包含大小写字母、数字、特殊字符
5. **定期更新**: 保持系统和软件包最新

## API 端点

### 公开 API

- `GET /api/stats` - 获取流量统计数据
- `GET /api/live` - 获取实时流量数据
- `GET /api/firewall-logs` - 获取防火墙日志
- `GET /api/alerts` - 获取告警信息

### 认证 API (需要登录)

- `GET /api/auth/check` - 检查登录状态
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `POST /api/change-password` - 修改密码
- `GET /api/firewall/rules` - 获取防火墙规则
- `GET /api/firewall/ports` - 获取开放端口列表
- `POST /api/firewall/open-port` - 开放端口
- `POST /api/firewall/close-port` - 关闭端口
- `GET /api/firewall/audit-logs` - 获取审计日志

## License

MIT

---

**最后更新**: 2026-03-31
**版本**: v1.0.0
