# 环境 API

管理 acp-link Agent 的注册和连接。

## REST 注册

```
POST /v1/environments/bridge
```

注册新的 acp-link Agent，返回 `environment_id` 和 `session_id`。

## 注销

```
DELETE /v1/environments/bridge/:id
```

注销指定 Agent，删除内存记录和关联 session。

## 重连

```
POST /v1/environments/bridge/:id/bridge/reconnect
```

标记 Agent 状态为 `active`，用于断线重连场景。

## 获取环境列表

```
GET /web/environments
```

返回所有已注册的 Agent 环境信息。
