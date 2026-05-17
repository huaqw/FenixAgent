# ACP 协议

ACP (Agent Communication Protocol) 是 RCS 与 AI Agent 之间的通信协议，基于 WebSocket + NDJSON。

## 连接流程

### 标准 acp-link 连接

```
1. REST POST /v1/environments/bridge
   ← { environment_id: "env_xxx", session_id: "ses_xxx" }

2. WebSocket /acp/ws?token=rcs_xxx
   → { "type": "identify", "agent_id": "env_xxx" }
   ← { "type": "registered", "agent_id": "env_xxx" }
```

### 前端中继连接

```
前端 ←WebSocket→ /acp/relay/:agentId?sessionId=xxx ←WebSocket→ acp-link
```

## 认证方式

| 优先级 | 方式 | 说明 |
|--------|------|------|
| 1 | Per-user API Key | `Authorization: Bearer rcs_xxx` |
| 2 | 全局 API Key | `RCS_API_KEYS=key1,key2` 环境变量 |

## 消息类型

### 注册与保活

```json
{ "type": "register", "agent_name": "my-agent", "max_sessions": 1 }
{ "type": "identify", "agent_id": "env_xxx" }
{ "type": "keep_alive" }
```

### 业务消息

所有非协议消息通过 EventBus 透传，支持双向通信。

## 保活机制

| 方向 | 间隔 | 说明 |
|------|------|------|
| 服务器 → acp-link | 20s | 防止反向 Agent 超时 |
| acp-link → 服务器 | 60s | 检测死连接 |
| 服务器 → 前端 | 20s | 保持 relay 连接 |
