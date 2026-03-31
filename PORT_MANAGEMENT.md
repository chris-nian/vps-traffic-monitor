# 端口管理功能使用指南

## 功能概述

现在你可以在 Web 仪表板上直接管理防火墙端口，无需登录服务器执行命令！

## 访问方式

1. 打开浏览器访问: `http://你的服务器IP:8080`
2. 使用管理员账户登录（默认: admin / admin123）
3. 滚动到"🔌 端口管理"部分

## 功能说明

### 1. 开放端口
- 输入端口号（1-65535）
- 选择协议（TCP 或 UDP）
- 点击"开放端口"按钮
- 端口会立即开放，并显示在列表中

### 2. 关闭端口
- 方式1：在"关闭端口"表单中输入端口号和协议
- 方式2：在"当前开放的端口"列表中直接点击"关闭"按钮

### 3. 受保护端口
以下端口无法关闭，被标记为"受保护"：
- **22** - SSH（你的远程连接）
- **80** - HTTP
- **443** - HTTPS

### 4. 操作日志
所有端口操作都会被记录，包括：
- 开放端口
- 关闭端口
- 操作时间
- 操作用户

## 安全特性

### 认证保护
- 所有端口管理操作都需要登录
- 默认密码：admin123（首次登录后请立即修改）

### 输入验证
- 端口号范围：1-65535
- 协议限制：只能是 tcp 或 udp
- 防止命令注入

### 审计日志
- 记录所有端口操作
- 包含时间戳、用户、操作详情
- 日志位置：`/root/traffic-monitor/data/audit.log`

### 速率限制
- 登录失败 5 次后锁定 15 分钟
- 防止暴力破解

## 命令行管理（备用方案）

如果你无法访问 Web 界面，可以使用命令行脚本：

```bash
# 查看开放端口
/root/traffic-monitor/scripts/manage-ports.sh list

# 开放端口
/root/traffic-monitor/scripts/manage-ports.sh open 3000 tcp

# 关闭端口
/root/traffic-monitor/scripts/manage-ports.sh close 3000 tcp
```

## 修改默认密码

首次登录后强烈建议修改密码：

1. 登录后访问页面上的"修改密码"功能
2. 输入当前密码和新密码（至少 12 个字符）
3. 点击"修改密码"

## 故障排查

### 无法访问端口管理界面
```bash
# 检查服务状态
systemctl status traffic-monitor

# 重启服务
systemctl restart traffic-monitor
```

### 端口操作失败
- 检查是否已登录
- 确认端口号在有效范围内（1-65535）
- 查看操作日志了解失败原因

### 忘记密码
```bash
# 重置为默认密码
rm /root/traffic-monitor/admin-config.json
systemctl restart traffic-monitor
# 然后使用 admin / admin123 登录
```

## 技术细节

### API 端点
- `GET /api/firewall/ports` - 获取开放端口列表（需要认证）
- `POST /api/firewall/open-port` - 开放端口（需要认证）
- `POST /api/firewall/close-port` - 关闭端口（需要认证）
- `GET /api/firewall/audit-logs` - 获取操作日志（需要认证）

### 防火墙后端
- 自动检测使用 firewalld 或 iptables
- 支持 CentOS/RHEL/Rocky/AlmaLinux 8

## 安全建议

1. **定期修改密码**：建议每个月修改一次密码
2. **检查审计日志**：定期查看是否有异常操作
3. **最小权限原则**：只开放必要的端口
4. **使用强密码**：密码至少 12 个字符，包含大小写字母、数字、特殊字符

## 示例场景

### 场景1：部署 Node.js 应用
```bash
# 在 Web 界面中：
1. 输入端口号：3000
2. 选择协议：TCP
3. 点击"开放端口"
# 完成！现在可以通过 http://你的IP:3000 访问应用
```

### 场景2：临时测试后关闭端口
```bash
# 开放 8081 端口测试
# 测试完成后，在端口列表中点击"关闭"按钮
# 端口立即关闭，服务器安全得到保障
```

---

**注意**：所有端口操作都会实时生效，无需重启服务或防火墙。
