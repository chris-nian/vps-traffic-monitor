# 防火墙规则管理功能说明

## 功能概述

本系统现在包含一个安全的防火墙规则查看功能，需要管理员登录才能访问。

## 默认登录凭据

**用户名:** `admin`
**密码:** `admin123`

⚠️ **重要安全提示：首次使用后请立即修改默认密码！**

## 如何修改管理员密码

1. 登录服务器
2. 编辑配置文件：`/root/vps-traffic-monitor/app/admin-config.json`
3. 使用 bcrypt 生成新的密码哈希：

```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('your-new-password', 10));"
```

4. 将生成的哈希值替换到配置文件中的 `passwordHash` 字段
5. 重启服务：

```bash
pkill -f "node.*server.js"
cd /root/vps-traffic-monitor/app
node server.js &
```

## 访问防火墙规则页面

1. 在浏览器中访问：`http://your-server-ip:8080/login.html`
2. 输入管理员凭据登录
3. 登录成功后会自动跳转到防火墙规则管理页面
4. 或者直接访问：`http://your-server-ip:8080/firewall-rules.html`

## 功能特性

### 防暴力破解保护

- 最多 5 次登录尝试
- 失败 5 次后锁定账户 15 分钟
- 基于IP地址的尝试跟踪
- 自动清理过期的锁定记录

### 防火墙规则查看

- 查看 iptables 防火墙规则
- 按链（INPUT/OUTPUT/FORWARD）筛选
- 按目标（ACCEPT/DROP/REJECT/LOG）筛选
- 显示规则统计信息
- 显示原始 iptables 输出
- 实时刷新功能

### 会话管理

- 会话有效期：24 小时
- 安全的 HTTP-only cookies
- 自动登出功能

## 安全建议

1. **修改默认密码** - 首次使用后立即修改
2. **使用强密码** - 至少 12 个字符，包含大小写字母、数字和特殊字符
3. **定期更新密码** - 建议每 30-90 天更新一次
4. **限制访问** - 使用防火墙规则限制管理页面的访问来源 IP
5. **启用 HTTPS** - 生产环境建议使用反向代理（如 Nginx）并启用 SSL
6. **监控日志** - 定期检查访问日志和异常登录尝试

## API 端点

### 认证相关

- `POST /api/login` - 登录
- `POST /api/logout` - 登出
- `GET /api/auth/check` - 检查认证状态

### 防火墙规则（需要认证）

- `GET /api/firewall/rules` - 获取防火墙规则

## 故障排除

### 无法登录

1. 确认使用正确的用户名和密码
2. 检查是否被锁定（等待 15 分钟或重启服务）
3. 检查配置文件是否存在：`/root/vps-traffic-monitor/app/admin-config.json`

### 无法访问防火墙规则页面

1. 确认已登录
2. 检查浏览器控制台是否有错误
3. 确认服务正在运行：`ps aux | grep "node.*server.js"`

### 重置密码

如果忘记密码，可以删除配置文件，系统会自动创建带有默认凭据的新配置：

```bash
rm /root/vps-traffic-monitor/app/admin-config.json
pkill -f "node.*server.js"
cd /root/vps-traffic-monitor/app
node server.js &
```

## 技术细节

- **密码加密**: 使用 bcrypt（10 rounds）
- **会话管理**: express-session
- **防护措施**: IP 限制、尝试次数限制、自动锁定
- **防火墙解析**: iptables 命令行工具

## 更新日志

### v1.1.0 (2026-03-30)
- ✅ 添加管理员登录功能
- ✅ 添加防暴力破解保护
- ✅ 添加防火墙规则查看页面
- ✅ 添加会话管理
- ✅ 添加安全认证中间件
