# 认证系统

## 双层认证

RCS 使用两套独立的认证机制，分别服务于不同场景：

### 1. 用户认证 (better-auth)

用于前端控制面板的访问控制，基于 cookie session。

```typescript
// 中间件自动验证
app.get("/web/sessions", sessionAuth, async (c) => {
  const user = c.get("user")!;
  // ...
});
```

### 2. API Key 认证

用于 acp-link 等外部服务的认证，支持 Bearer token 或 query param。

```
Authorization: Bearer rcs_xxx
# 或
/acp/ws?token=rcs_xxx
```

## API Key 管理

- 每个用户可创建多个 API Key
- Key 存储于 SQLite，支持启用/禁用
- 用于 acp-link 注册时的身份验证
