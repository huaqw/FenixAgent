# 配置 API

统一端点：`POST /web/config/:module`

## 通用请求格式

```json
{
  "action": "list | get | set | create | delete | enable | disable"
}
```

## 通用响应格式

```json
// 成功
{ "success": true, "data": { ... } }

// 失败
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

## 模块列表

| Module | 说明 |
|--------|------|
| `providers` | AI 服务商管理 |
| `models` | 模型配置 |
| `agents` | Agent 配置 |
| `skills` | Skill 管理 |
| `mcp` | MCP 服务器配置 |

## 错误码

| 错误码 | 说明 |
|--------|------|
| `NOT_FOUND` | 资源不存在 |
| `ALREADY_EXISTS` | 资源已存在 |
| `VALIDATION_ERROR` | 请求参数校验失败 |
| `CONFIG_READ_ERROR` | 配置文件读取失败 |
| `CONFIG_WRITE_ERROR` | 配置文件写入失败 |
| `FORBIDDEN` | 无权限操作 |

## 示例

### 列出所有 Providers

```bash
curl -X POST /web/config/providers \
  -H "Content-Type: application/json" \
  -b cookie.txt \
  -d '{"action": "list"}'
```

### 创建 Model

```bash
curl -X POST /web/config/models \
  -H "Content-Type: application/json" \
  -b cookie.txt \
  -d '{
    "action": "create",
    "id": "gpt-4o",
    "model": { "provider": "openai", "model": "gpt-4o" }
  }'
```
