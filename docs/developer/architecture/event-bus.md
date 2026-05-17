# 事件总线

EventBus 是 RCS 的核心消息路由组件，连接会话事件和 ACP 连接。

## 事件流

```
acp-link → WebSocket → EventBus → SSE → 前端
                ↘ store（内存更新）
```

## 会话事件类型

| 事件 | 说明 |
|------|------|
| `user` | 用户消息 |
| `assistant` | Agent 回复 |
| `tool_use` | 工具调用 |
| `permission_request` | 权限请求 |
| `tool_result` | 工具返回 |
| `session_created` | 会话创建 |
| `session_closed` | 会话关闭 |

## SSE 推送

前端通过 SSE (Server-Sent Events) 接收实时事件流，所有事件经过规范化处理后再推送。
