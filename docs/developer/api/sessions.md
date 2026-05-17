# 会话 API

## 获取会话列表

```
GET /web/sessions
```

## 获取会话详情

```
GET /web/sessions/:id
```

## 会话事件流

```
GET /web/sessions/:id/events
```

返回 SSE 事件流，实时推送会话中的所有消息和事件。
