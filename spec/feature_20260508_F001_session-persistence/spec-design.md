# Feature: 20260508_F001 - session-persistence

## 需求背景

当前 session 元数据存储在内存 Map 中（`src/store.ts` 的 `sessions`），服务器重启后所有 session 记录丢失。前端 URL（如 `/ctrl/session_e10299ad39be4674b812570f3afddc4c/?cwd=...`）在重启后返回 404，用户无法访问历史会话。

Environment 已通过 SQLite 持久化，但 Session 尚未持久化，导致重启后 environment 存活但 session 丢失的不一致体验。

## 目标

- 服务器重启后，通过 session ID 的 URL 仍能加载 session 页面
- Session 元数据（id, title, status, cwd, environmentId 等）持久化到 SQLite
- 保持原始 status（不做自动状态转换）
- 保留与 environment 的关联关系
- 聊天历史事件不在本次范围内，后续单独处理

## 方案设计

### 整体方案：Write-through 双写

采用与 `environment` 一致的持久化模式：Session 的创建/更新/删除操作同时写入内存 Map 和 SQLite。服务器启动时从 SQLite 加载到内存 Map。

选择此方案的理由：
- 与项目已有的 environment 持久化模式一致，代码风格统一
- 数据零丢失（非优雅关机也不丢数据）
- 实现简单直观，SQLite 本地写入性能足够

### 数据模型

新增 `agent_session` 表（避免与 better-auth 的 `session` 表冲突）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | session_xxx 或 cse_xxx |
| environmentId | TEXT | FK→environment.id, SET NULL | 关联环境 |
| title | TEXT | | 会话标题 |
| status | TEXT | NOT NULL | idle/running/active/archived 等 |
| source | TEXT | NOT NULL | acp/code 等 |
| permissionMode | TEXT | | 权限模式 |
| workerEpoch | INTEGER | NOT NULL DEFAULT 0 | 工作纪元 |
| username | TEXT | | 用户名 |
| userId | TEXT | | 用户 ID |
| cwd | TEXT | | 工作目录（新增字段） |
| shareMode | TEXT | NOT NULL DEFAULT 'none' | none/readonly/writable |
| createdAt | TIMESTAMP | NOT NULL | 创建时间 |
| updatedAt | TIMESTAMP | NOT NULL | 更新时间 |

关键约束：
- `environmentId` 外键使用 `SET NULL`（环境被删除时不清除 session 记录，只清空关联）
- 在 environmentId 上建索引，加速按环境查询

### Schema 变更

**`src/db/schema.ts`** 新增：

```typescript
export const agentSession = sqliteTable("agent_session", {
  id: text("id").primaryKey(),
  environmentId: text("environment_id")
    .references(() => environment.id, { onDelete: "SET NULL" }),
  title: text("title"),
  status: text("status").notNull(),
  source: text("source").notNull(),
  permissionMode: text("permission_mode"),
  workerEpoch: integer("worker_epoch").notNull().default(0),
  username: text("username"),
  userId: text("user_id"),
  cwd: text("cwd"),
  shareMode: text("share_mode").notNull().default("none"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  envIdx: index("idx_agent_session_env").on(table.environmentId),
}));
```

**`src/db/index.ts`** 新增建表语句：

```sql
CREATE TABLE IF NOT EXISTS agent_session (
  id TEXT PRIMARY KEY,
  environment_id TEXT REFERENCES environment(id) ON DELETE SET NULL,
  title TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  permission_mode TEXT,
  worker_epoch INTEGER NOT NULL DEFAULT 0,
  username TEXT,
  user_id TEXT,
  cwd TEXT,
  share_mode TEXT NOT NULL DEFAULT 'none',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_session_env ON agent_session(environment_id);
```

### Store 层改造

**`src/store.ts`** 改动点：

1. **`SessionRecord` 接口**：新增 `cwd` 字段

2. **`storeCreateSession`**：接收 `cwd` 参数，写入内存 Map 的同时 `db.insert(agentSession)` 写入 SQLite

3. **`storeUpdateSession`**：内存 Map 更新后同步 `db.update(agentSession)` 更新 DB

4. **`storeDeleteSession`**：内存 Map 删除后同步 `db.delete(agentSession)` 删除 DB 记录

5. **`storeDeleteEnvironment`**：不再级联删除 session 记录（外键 SET NULL 自动处理 environmentId），只清理内存 Map 中的关联 session 的 environmentId

6. **新增 `storeLoadSessionsFromDB()`**：启动时从 SQLite 查询所有 `agent_session` 记录，恢复到内存 Map。保持 DB 中的原始 status 不做转换。

7. **`storeRefreshSessionShareMode`**：需同步更新 DB 中的 shareMode 字段

不改动的部分：
- `sessionOwners`、`sessionWorkers`、`tokens` 保持纯内存
- EventBus 保持内存态
- `storeReset()` 测试函数保持只清内存

### 启动恢复流程

在 `src/index.ts` 启动流程中，数据库初始化之后、HTTP 服务监听之前：

```
1. 初始化 SQLite（已有）
2. CREATE TABLE IF NOT EXISTS agent_session（已有建表逻辑）
3. 调用 storeLoadSessionsFromDB() 恢复 session 到内存
4. 启动 HTTP 服务
```

加载时直接使用 DB 中的 status 值，不做自动状态转换（如不自动改为 inactive）。重启后 session 的 status 与关机前一致。

### CWD 传递链路

Session 创建时需要传递 cwd 参数：

1. **ACP 注册时自动创建 session**：从 environment 的 workspacePath 获取 cwd
2. **前端创建 session**：从请求参数的 cwd 字段获取
3. **Code session 创建**：从请求参数获取

当前 `storeCreateSession` 的 `req` 参数需新增 `cwd` 字段。

### 前端影响

前端无需改动。原因：
- `apiFetchSession(sessionId)` 调用后端 API，session 已从 DB 恢复到内存，API 正常返回
- 事件历史为空时前端已有容错（`rcs-chat-adapter.ts` 判断 events 为空直接 return）
- SSE 重连时 session 存在，只是无历史事件可回放

## 实现要点

1. **表命名**：使用 `agent_session` 而非 `session`，避免与 better-auth 的 session 表冲突
2. **外键 SET NULL**：环境删除时 session 记录保留，environmentId 被置为 null
3. **storeReset 限制**：测试中的 storeReset 只清内存 Map，不删 DB 记录。测试需要额外处理 DB 清理
4. **storeDeleteEnvironment 改动**：当前级联删除 session 记录，改为只清理内存 Map 中 session 的 environmentId，DB 中由外键 SET NULL 处理
5. **storeLoadSessionsFromDB 时机**：必须在 environment 表已加载之后（因为某些查询依赖 environment 数据），在 HTTP 服务启动之前

## 验收标准

- [ ] 服务器重启后，通过 `/ctrl/session_xxx/?cwd=...` URL 能正常加载 session 页面
- [ ] Session 元数据（title, status, cwd, environmentId）在重启后完整保留
- [ ] Session 的 status 与重启前一致（不自动改为 inactive）
- [ ] Environment 删除后，关联 session 记录保留，environmentId 被置 null
- [ ] ACP agent 重连后能通过 resolveExistingSessionId 找到已有 session
- [ ] 现有测试不受影响（storeReset 行为不变）
- [ ] 新增 agent_session 表的建表语句和 schema 定义
