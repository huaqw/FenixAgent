# Session 持久化执行计划

**目标:** 服务器重启后，通过 session ID 的 URL（如 `/ctrl/session_xxx/?cwd=...`）仍能加载 session 页面

**技术栈:** Hono + Bun + Drizzle ORM + SQLite

**设计文档:** spec-design.md

## 改动总览

本次改动涉及数据库层（schema + 建表）、Store 层（write-through 双写 + 启动恢复）、API 类型层（cwd 字段）和启动流程。Task 1 创建数据模型，Task 2-3 改造 Store 层实现持久化，Task 4 集成启动恢复，Task 5 打通 cwd 传递链路。关键设计决策：采用与 environment 一致的 write-through 双写模式，使用 `agent_session` 表名避免与 better-auth 的 session 表冲突。

---

### Task 0: 环境准备

**背景:**
确保开发环境中 Bun、TypeScript、SQLite 工具链可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**
- [x] 验证 Bun 运行时可用
  - `bun --version`
  - 预期: 输出版本号（如 1.0.x 或更高）
- [x] 验证 SQLite 数据库可创建
  - `mkdir -p /tmp/rcs-test-db && bun -e "const Database = require('bun:sqlite'); const db = new Database('/tmp/rcs-test-db/test.db'); db.exec('CREATE TABLE test (id INTEGER);'); db.close(); console.log('SQLite OK');"`
  - 预期: 输出 "SQLite OK" 且无错误
- [x] 验证项目依赖已安装
  - `test -d node_modules && echo "deps installed" || bun install`
  - 预期: 输出 "deps installed" 或依赖安装成功
- [x] 验证类型检查工具可用
  - `bun run typecheck 2>&1 | head -3`
  - 预期: 类型检查可执行（可能有类型错误，但工具可用）

**检查步骤:**
- [x] 验证 Bun 版本
  - `bun --version`
  - 预期: 版本号 >= 1.0.0
- [x] 验证 SQLite 支持可用
  - `bun -e "console.log(require('bun:sqlite').Database ? 'SQLite OK' : 'SQLite Missing')"`
  - 预期: 输出 "SQLite OK"
- [x] 验证测试框架可用
  - `bun test --help 2>&1 | head -1`
  - 预期: 输出包含 "bun test" 或用法信息

---

### Task 1: 添加 agent_session 表 schema 和建表语句

**背景:**
[业务语境] — 服务器重启后 session 元数据丢失，需要将 session 持久化到 SQLite，本 Task 创建 `agent_session` 数据表作为持久化基础
[修改原因] — 当前 session 仅存在于内存 Map（`src/store.ts`），无数据库表支撑；`src/db/schema.ts` 中无 agent_session 定义，`src/db/index.ts` 的 `initDb()` 中无对应建表语句
[上下游影响] — 本 Task 是 Task 3（Store 层 write-through 双写）和 Task 4（启动恢复）的前置依赖，Task 3 将在此表上进行 insert/update/delete 操作

**涉及文件:**
- 修改: `src/db/schema.ts`
- 修改: `src/db/index.ts`

**执行步骤:**
- [x] 在 `src/db/schema.ts` 中新增 `agentSession` 表定义 — 为 Drizzle ORM 提供类型安全的表结构
  - 位置: `src/db/schema.ts` 文件末尾（`channelBinding` 表定义之后）
  - 在文件顶部的 import 语句中确认已导入 `text`, `integer`, `index`（当前已有，无需修改）
  - 新增以下代码块：

    ```typescript
    // Agent Session 持久化表
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

  - 原因: 与项目中 `environment`、`shareLink` 等表的 Drizzle 定义风格一致，使用 `onDelete: "SET NULL"` 保证环境删除时 session 记录保留

- [x] 在 `src/db/index.ts` 的 `initDb()` 函数中新增 `agent_session` 建表语句 — 确保数据库启动时自动创建表
  - 位置: `initDb()` 函数内最后一个 `sqlite.exec(...)` 调用中，在 `channel_binding` 建表语句和对应索引之后（~L278 的 `CREATE INDEX IF NOT EXISTS idx_channel_binding_agent_id` 之后），在闭合的反引号 `` ` `` 之前
  - 在 `idx_channel_binding_agent_id` 索引创建语句之后追加：

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

  - 原因: 与现有建表语句风格一致（`CREATE TABLE IF NOT EXISTS` + 索引在表之后创建），SQL 字段名使用 snake_case 与现有表保持统一

- [x] 为 agent_session 表定义编写结构验证测试
  - 测试文件: `src/__tests__/agent-session-schema.test.ts`
  - 测试场景:
    - `agent_session 表创建成功`: 调用 initDb() 后，`PRAGMA table_info(agent_session)` 返回包含所有 14 个字段（id, environment_id, title, status, source, permission_mode, worker_epoch, username, user_id, cwd, share_mode, created_at, updated_at）
    - `索引创建成功`: `PRAGMA index_list(agent_session)` 返回包含 `idx_agent_session_env` 索引
    - `外键约束存在`: `PRAGMA foreign_key_list(agent_session)` 返回包含指向 environment 表的引用，且 on_delete 为 SET NULL
    - `默认值正确`: worker_epoch 默认为 0，share_mode 默认为 'none'
  - 运行命令: `bun test src/__tests__/agent-session-schema.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证 schema.ts 导出 agentSession 表定义
  - `grep -n "export const agentSession" src/db/schema.ts`
  - 预期: 输出包含 `agentSession` 的行号
- [x] 验证建表语句已添加到 initDb()
  - `grep -n "agent_session" src/db/index.ts`
  - 预期: 输出包含 `CREATE TABLE IF NOT EXISTS agent_session` 和 `idx_agent_session_env` 的行
- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误
- [x] 验证新增测试通过
  - `bun test src/__tests__/agent-session-schema.test.ts`
  - 预期: 所有测试通过

---

### Task 2: SessionRecord 接口新增 cwd 字段

**背景:**
当前 `SessionRecord` 接口（`src/store.ts` ~L31-44）没有 `cwd` 字段，session 的工作目录信息只能通过关联 environment 的 `workspacePath` 间接获取。本 Task 在接口中新增 `cwd: string | null` 字段，为后续 write-through 双写（Task 3）和 cwd 传递链路（Task 5）提供数据模型基础。本 Task 仅修改接口定义和构造点，不涉及 DB 持久化逻辑。

**涉及文件:**
- 修改: `src/store.ts`

**执行步骤:**
- [x] 在 `SessionRecord` 接口中新增 `cwd` 字段
  - 位置: `src/store.ts:SessionRecord` (~L31-44)，在 `userId: string | null;` 之后、`shareMode` 之前插入
  - 插入内容: `cwd: string | null;`
  - 原因: cwd 与 userId 同属 session 的归属/上下文信息分组，放在 userId 之后保持逻辑一致性
- [x] 在 `storeCreateSession` 函数的 `req` 参数类型中新增 `cwd` 字段
  - 位置: `src/store.ts:storeCreateSession()` 的 `req` 参数对象 (~L183-191)，在 `userId?: string | null;` 之后插入
  - 插入内容: `cwd?: string | null;`
- [x] 在 `storeCreateSession` 函数的 `record` 构造中新增 `cwd` 赋值
  - 位置: `src/store.ts:storeCreateSession()` 内部的 `record: SessionRecord` 对象 (~L194-207)，在 `userId: req.userId ?? null,` 之后、`shareMode: "none" as const,` 之前插入
  - 插入内容: `cwd: req.cwd ?? null,`
  - 原因: 保持与接口定义的字段顺序一致，cwd 默认为 null（与其它可选字段一致）
- [x] 为 SessionRecord cwd 字段编写单元测试
  - 测试文件: `src/__tests__/store.test.ts`
  - 测试场景:
    - `storeCreateSession` 默认不传 cwd 时，`session.cwd` 为 `null`
    - `storeCreateSession` 传入 `cwd: "/home/user/project"` 时，`session.cwd` 等于该值
    - `storeCreateSession` 传入 `cwd: null` 时，`session.cwd` 为 `null`
  - 运行命令: `bun test src/__tests__/store.test.ts`
  - 预期: 所有测试通过（包括现有测试不受影响）

**检查步骤:**
- [x] 验证 SessionRecord 接口包含 cwd 字段
  - `grep -n "cwd" src/store.ts | head -10`
  - 预期: 输出包含接口定义中的 `cwd: string | null;`、参数类型中的 `cwd?: string | null;`、构造赋值中的 `cwd: req.cwd ?? null,`
- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误
- [x] 验证现有 store 测试不受影响
  - `bun test src/__tests__/store.test.ts`
  - 预期: 全部测试通过，无新增失败

---

### Task 3: Store 层 write-through 双写改造

**背景:**
[业务语境] — 当前 session 仅存于内存 Map，服务器重启后丢失。本 Task 改造 store 层实现 write-through 双写，所有 session 的创建/更新/删除操作同时写入 SQLite 的 `agent_session` 表
[修改原因] — `storeCreateSession`/`storeUpdateSession`/`storeDeleteSession`/`storeDeleteEnvironment`/`storeRefreshSessionShareMode` 当前只操作内存 Map，缺少 DB 持久化；缺少从 DB 恢复 session 到内存的 `storeLoadSessionsFromDB()` 函数
[上下游影响] — 本 Task 依赖 Task 1（agent_session 表）和 Task 2（SessionRecord.cwd 字段）的输出；本 Task 的 `storeLoadSessionsFromDB()` 被 Task 4（启动恢复流程集成）调用

**涉及文件:**
- 修改: `src/store.ts`
- 修改: `src/__tests__/store.test.ts`（更新 `storeDeleteEnvironment` 测试 + 新增双写测试）

**执行步骤:**
- [x] 在 `src/store.ts` 顶部新增 `agentSession` 表导入 — 为后续双写操作提供 Drizzle 表引用
  - 位置: `src/store.ts` 第 3 行的 import 语句中，在 `shareEventSnapshot` 之后追加
  - 插入内容: `agentSession`
  - 原因: `agentSession` 表已在 Task 1 的 `src/db/schema.ts` 中定义，此处导入以供 `db.insert`/`db.update`/`db.delete` 使用

- [x] 改造 `storeCreateSession` 实现 write-through 双写 — 创建 session 时同步写入内存 Map 和 SQLite
  - 位置: `src/store.ts:storeCreateSession()` (~L183-210)，在 `sessions.set(id, record);` 之后追加 DB 写入
  - 在 `sessions.set(id, record);` 之后插入：
    ```typescript
    db.insert(agentSession).values({
      id,
      environmentId: record.environmentId,
      title: record.title,
      status: record.status,
      source: record.source,
      permissionMode: record.permissionMode,
      workerEpoch: record.workerEpoch,
      username: record.username,
      userId: record.userId,
      cwd: record.cwd,
      shareMode: record.shareMode,
      createdAt: now,
      updatedAt: now,
    }).run();
    ```
  - 原因: 采用与 `storeCreateEnvironment` 一致的 write-through 模式，DB 写入在内存写入之后，保证返回值不受 DB 异常影响

- [x] 改造 `storeUpdateSession` 实现 write-through 双写 — 更新 session 时同步更新内存 Map 和 SQLite
  - 位置: `src/store.ts:storeUpdateSession()` (~L216-221)，在 `Object.assign(rec, patch, { updatedAt: new Date() });` 之后追加 DB 更新
  - 在 `Object.assign(rec, patch, { updatedAt: new Date() });` 之后插入：
    ```typescript
    const dbSet: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) dbSet.title = patch.title;
    if (patch.status !== undefined) dbSet.status = patch.status;
    if (patch.workerEpoch !== undefined) dbSet.workerEpoch = patch.workerEpoch;
    db.update(agentSession).set(dbSet).where(eq(agentSession.id, id)).run();
    ```
  - 原因: 只同步 patch 中实际提供的字段，避免覆盖 DB 中已有的字段值；`updatedAt` 始终更新

- [x] 改造 `storeDeleteSession` 实现 write-through 双写 — 删除 session 时同步删除内存 Map 和 SQLite
  - 位置: `src/store.ts:storeDeleteSession()` (~L248-250)，在 `sessions.delete(id)` 之前追加 DB 删除
  - 将函数体改为：
    ```typescript
    db.delete(agentSession).where(eq(agentSession.id, id)).run();
    return sessions.delete(id);
    ```
  - 原因: 先删 DB 再删内存，与 `storeCreateSession`（先内存后 DB）相反，因为删除失败时不应清理内存数据；但此处简化为先删 DB（保持幂等）

- [x] 改造 `storeDeleteEnvironment` — 不再级联删除 session 记录，只清空关联 session 的 environmentId
  - 位置: `src/store.ts:storeDeleteEnvironment()` (~L432-440)
  - 将 `for (const [sid, s] of sessions) { if (s.environmentId === id) sessions.delete(sid); }` 替换为：
    ```typescript
    for (const s of sessions.values()) {
      if (s.environmentId === id) {
        s.environmentId = null;
        db.update(agentSession).set({ environmentId: null, updatedAt: new Date() }).where(eq(agentSession.id, s.id)).run();
      }
    }
    ```
  - 原因: 设计要求 environment 删除时 session 记录保留（外键 SET NULL），只清空 environmentId 关联

- [x] 改造 `storeRefreshSessionShareMode` 实现 write-through 双写 — 更新 shareMode 时同步写入 SQLite
  - 位置: `src/store.ts:storeRefreshSessionShareMode()` (~L308-321)，在 `if (rec) rec.shareMode = mode;` 之后追加 DB 更新
  - 在 `if (rec) rec.shareMode = mode;` 之后插入：
    ```typescript
    db.update(agentSession).set({ shareMode: mode, updatedAt: new Date() }).where(eq(agentSession.id, sessionId)).run();
    ```
  - 原因: shareMode 变更需要持久化，否则重启后 session 的 shareMode 恢复为默认值 "none"

- [x] 新增 `storeLoadSessionsFromDB()` 函数 — 启动时从 SQLite 恢复所有 session 到内存 Map
  - 位置: `src/store.ts` 的 Session 区域（`storeDeleteSession` 之后、Share Link 区域之前，~L251）
  - 插入以下函数：
    ```typescript
    /** Load all sessions from SQLite into the in-memory sessions Map (called at startup) */
    export function storeLoadSessionsFromDB(): void {
      const rows = db.select().from(agentSession).all();
      for (const row of rows) {
        sessions.set(row.id, {
          id: row.id,
          environmentId: row.environmentId,
          title: row.title,
          status: row.status,
          source: row.source,
          permissionMode: row.permissionMode,
          workerEpoch: row.workerEpoch,
          username: row.username,
          userId: row.userId,
          cwd: row.cwd,
          shareMode: (row.shareMode as "none" | "readonly" | "writable") ?? "none",
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }
    }
    ```
  - 原因: 保持 DB 中的原始 status 不做转换（不自动改为 inactive），使用 `sessions.set()` 直接覆盖 Map 中可能存在的旧数据

- [x] 更新 `storeDeleteEnvironment` 的现有测试 — 测试预期从"级联删除 session"改为"保留 session 但清空 environmentId"
  - 位置: `src/__tests__/store.test.ts` 的 `describe("ACP agent lifecycle")` 中 `test("deletes agent and associated sessions")` (~L267-273)
  - 将测试改为：
    ```typescript
    test("deletes agent and disassociates sessions (SET NULL)", () => {
      const env = storeCreateEnvironment({ userId: "u1", workerType: "acp", machineName: "agent1" });
      const session = storeCreateSession({ environmentId: env.id, title: "test session", userId: "u1" });
      expect(storeDeleteEnvironment(env.id)).toBe(true);
      expect(storeGetEnvironment(env.id)).toBeUndefined();
      // Session should still exist but with null environmentId
      const updatedSession = storeGetSession(session.id);
      expect(updatedSession).toBeDefined();
      expect(updatedSession!.environmentId).toBeNull();
    });
    ```
  - 原因: 设计变更——environment 删除后 session 保留，environmentId 置 null

- [x] 为 Store 层 write-through 双写编写单元测试
  - 测试文件: `src/__tests__/store.test.ts`
  - 测试场景:
    - `storeCreateSession 双写 DB`: 创建 session 后，通过 `db.select().from(agentSession).where(eq(agentSession.id, session.id))` 查询 DB 确认记录存在，且所有字段值正确
    - `storeUpdateSession 双写 DB`: 更新 session 的 title 和 status 后，查询 DB 确认已同步更新
    - `storeDeleteSession 双写 DB`: 删除 session 后，查询 DB 确认记录已不存在
    - `storeLoadSessionsFromDB 恢复 session`: 创建 session 后调用 `storeReset()` 清空内存，再调用 `storeLoadSessionsFromDB()`，验证 `storeGetSession()` 能获取到该 session 且字段正确
    - `storeDeleteEnvironment 保留 session`: 创建 environment + session 后删除 environment，查询 DB 确认 session 记录仍存在且 environmentId 为 null
    - `storeRefreshSessionShareMode 双写 DB`: 创建 share link 后调用 `storeRefreshSessionShareMode()`，查询 DB 确认 shareMode 已更新
  - 运行命令: `bun test src/__tests__/store.test.ts`
  - 预期: 所有测试通过（包括现有测试和新增测试）

**检查步骤:**
- [x] 验证 agentSession 已在 store.ts 中导入
  - `grep -n "agentSession" src/store.ts | head -5`
  - 预期: 输出包含 import 行和 `db.insert(agentSession)`、`db.update(agentSession)`、`db.delete(agentSession)` 的行
- [x] 验证 storeCreateSession 包含 DB 写入
  - `grep -A2 "sessions.set(id, record)" src/store.ts`
  - 预期: 在 `sessions.set` 之后紧跟 `db.insert(agentSession)` 调用
- [x] 验证 storeLoadSessionsFromDB 已导出
  - `grep -n "export function storeLoadSessionsFromDB" src/store.ts`
  - 预期: 输出包含该函数定义的行号
- [x] 验证 storeDeleteEnvironment 不再级联删除 session
  - `grep -n "sessions.delete" src/store.ts`
  - 预期: 仅在 `storeDeleteSession` 函数中出现，不在 `storeDeleteEnvironment` 中出现
- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误
- [x] 验证所有 store 测试通过
  - `bun test src/__tests__/store.test.ts`
  - 预期: 全部测试通过

---

### Task 4: 启动恢复流程集成

**背景:**
[业务语境] — 服务器重启后需要自动从 SQLite 恢复 session 到内存 Map，使得前端通过 session ID 的 URL（如 `/ctrl/session_xxx/`）仍能加载 session 页面
[修改原因] — 当前 `src/index.ts` 启动流程中没有调用 `storeLoadSessionsFromDB()`，内存 `sessions` Map 在每次启动时为空，即使 DB 中已有持久化 session 也无法访问
[上下游影响] — 本 Task 依赖 Task 3（`storeLoadSessionsFromDB()` 函数实现）的输出；本 Task 的执行结果使 Task 5（CWD 传递链路）能基于恢复后的 session 正常工作

**涉及文件:**
- 修改: `src/index.ts`
- 修改: `src/__tests__/startup-recovery.test.ts`（新建测试文件）

**执行步骤:**
- [x] 在 `src/index.ts` 顶部 import 区域新增 `storeLoadSessionsFromDB` 导入 — 为启动恢复调用提供函数引用
  - 位置: `src/index.ts` 第 27 行 `import { storeListAllEnvironments } from "./store";` 处，在该行的导入列表中追加 `storeLoadSessionsFromDB`
  - 修改后: `import { storeListAllEnvironments, storeLoadSessionsFromDB } from "./store";`
  - 原因: `storeLoadSessionsFromDB` 由 Task 3 在 `src/store.ts` 中实现并导出，与 `storeListAllEnvironments` 同属 store 模块，合并到同一 import 语句

- [x] 在 `src/index.ts` 启动流程中调用 `storeLoadSessionsFromDB()` — 在 HTTP 服务启动前将 DB 中的 session 恢复到内存
  - 位置: `src/index.ts` 第 36 行 `await startScheduler();` 之后、第 38 行 `const hermesUrl = ...` 之前（即 `startScheduler()` 和 Hermes 初始化之间）
  - 插入内容:
    ```typescript
    storeLoadSessionsFromDB();
    console.log("[RCS] Sessions restored from database");
    ```
  - 原因: `initDb()` 在 `src/db/index.ts` 模块加载时（~L282）已执行完毕，此时 `agent_session` 表已就绪；放在 `startScheduler()` 之后确保调度器先启动，放在 Hermes 初始化之前确保 session 数据在所有后续逻辑（auto-start instances、路由处理）之前可用

- [x] 为启动恢复流程编写单元测试 — 验证 `storeLoadSessionsFromDB()` 在模拟启动场景中正确恢复 session
  - 测试文件: `src/__tests__/startup-recovery.test.ts`
  - 测试场景:
    - `DB 中有 session 记录时恢复到内存`: 向 `agent_session` 表插入 2 条记录，调用 `storeReset()` 清空内存后调用 `storeLoadSessionsFromDB()`，验证 `storeListSessions().length === 2` 且各字段值正确
    - `DB 为空时不影响内存`: DB 无记录时调用 `storeLoadSessionsFromDB()`，验证 `storeListSessions().length === 0`
    - `恢复后 session 可被正常查询和更新`: 恢复 session 后调用 `storeGetSession(id)` 返回正确记录，调用 `storeUpdateSession(id, { title: "updated" })` 成功且内存和 DB 同步更新
  - 运行命令: `bun test src/__tests__/startup-recovery.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证 storeLoadSessionsFromDB 已在 index.ts 中导入
  - `grep -n "storeLoadSessionsFromDB" src/index.ts`
  - 预期: 输出包含 import 行和函数调用行
- [x] 验证恢复调用位于 startScheduler 之后
  - `grep -A1 "startScheduler" src/index.ts | head -4`
  - 预期: `startScheduler()` 之后紧跟 `storeLoadSessionsFromDB()` 调用
- [x] 验证启动日志包含 session 恢复信息
  - `grep -n "Sessions restored from database" src/index.ts`
  - 预期: 输出包含该日志行的行号
- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误
- [x] 验证新增测试通过
  - `bun test src/__tests__/startup-recovery.test.ts`
  - 预期: 所有测试通过

---

### Task 5: CWD 传递链路打通

**背景:**
[业务语境] — session 的 cwd（工作目录）是持久化后的核心检索字段，重启恢复的 session 需要携带原始工作目录才能正确加载。本 Task 打通从 API 类型层、服务层到 ACP WS handler 的 cwd 传递链路，确保 session 创建时 cwd 能正确写入 `SessionRecord`（进而通过 Task 3 的 write-through 双写写入 SQLite）
[修改原因] — 当前 `CreateSessionRequest` 和 `CreateCodeSessionRequest` 无 cwd 字段；`createSession()`/`createCodeSession()` 未向 `storeCreateSession` 传递 cwd；`spawnInstanceFromEnvironment()` 创建 session 时未传递 cwd；`handleRegister()` 两处创建 session 均未传递 cwd。这些调用点的 cwd 信息实际在上下文中已经存在（`env.workspacePath`、`directory` 变量等），只是未透传
[上下游影响] — 本 Task 依赖 Task 2（`storeCreateSession` 的 `req` 参数已包含 `cwd?: string | null`）和 Task 3（write-through 双写会将 cwd 写入 DB）；本 Task 完成后 Task 4（启动恢复）恢复的 session 将携带正确的 cwd 值

**涉及文件:**
- 修改: `src/types/api.ts`
- 修改: `src/services/session.ts`
- 修改: `src/services/instance.ts`
- 修改: `src/transport/acp-ws-handler.ts`

**执行步骤:**
- [x] 在 `CreateSessionRequest` 接口中新增 `cwd` 字段 — 允许 API 调用方指定 session 的工作目录
  - 位置: `src/types/api.ts:CreateSessionRequest` (~L62-68)，在 `username?: string;` 之后插入
  - 插入内容: `cwd?: string;`
  - 原因: cwd 是 session 的上下文信息，与 username 同属可选元数据分组
- [x] 在 `CreateCodeSessionRequest` 接口中新增 `cwd` 字段 — 保持两种 session 创建接口的字段一致性
  - 位置: `src/types/api.ts:CreateCodeSessionRequest` (~L70-75)，在 `permission_mode?: string;` 之后插入
  - 插入内容: `cwd?: string;`
  - 原因: Code Session 同样需要携带工作目录信息
- [x] 在 `createSession()` 中将 `req.cwd` 透传到 `storeCreateSession` — 打通 API 层到 Store 层的 cwd 传递
  - 位置: `src/services/session.ts:createSession()` (~L57-66)，在 `storeCreateSession({})` 调用中追加 `cwd` 字段
  - 将 `storeCreateSession({...})` 的参数对象改为：
    ```typescript
    storeCreateSession({
      environmentId: req.environment_id,
      title: req.title,
      source: req.source,
      permissionMode: req.permission_mode,
      username: req.username,
      cwd: req.cwd,
    });
    ```
  - 原因: 直接透传，不做额外处理，与现有字段传递模式一致
- [x] 在 `createCodeSession()` 中将 `req.cwd` 透传到 `storeCreateSession` — 打通 Code Session 的 cwd 传递
  - 位置: `src/services/session.ts:createCodeSession()` (~L68-76)，在 `storeCreateSession({})` 调用中追加 `cwd` 字段
  - 将 `storeCreateSession({...})` 的参数对象改为：
    ```typescript
    storeCreateSession({
      idPrefix: "cse_",
      title: req.title,
      source: req.source,
      permissionMode: req.permission_mode,
      cwd: req.cwd,
    });
    ```
  - 原因: 保持与 `createSession()` 一致的 cwd 透传模式
- [x] 在 `spawnInstanceFromEnvironment()` 创建 session 时传递 cwd — 确保 spawn 场景的 session 携带工作目录
  - 位置: `src/services/instance.ts:spawnInstanceFromEnvironment()` (~L201-206)，在 `storeCreateSession({})` 调用中追加 `cwd` 字段
  - 将 `storeCreateSession({...})` 的参数对象改为：
    ```typescript
    storeCreateSession({
      environmentId,
      title: env.agentName || env.name,
      source: "acp",
      userId,
      cwd: env.workspacePath || env.directory || null,
    });
    ```
  - 原因: `cwd` 变量在 ~L209 才定义，此处需内联获取；使用 `env.workspacePath || env.directory` 与后续 cwd 校验逻辑（~L209-210）保持一致
- [x] 在 `handleRegister()` 的 bound env 场景创建 session 时传递 cwd — 确保 persistent environment 绑定场景的 session 携带工作目录
  - 位置: `src/transport/acp-ws-handler.ts:handleRegister()` bound env 分支 (~L138-143)
  - 将 `storeCreateSession({...})` 的参数对象改为：
    ```typescript
    storeCreateSession({
      environmentId: entry.boundEnvId,
      title: agentName || "ACP Agent",
      source: "acp",
      userId: entry.userId,
      cwd: storeGetEnvironment(entry.boundEnvId)?.workspacePath ?? null,
    });
    ```
  - 原因: bound env 场景中 cwd 只能从已持久化的 environment 记录的 `workspacePath` 获取（该字段在 `storeCreateEnvironment` 时已从 `directory` 写入 `workspacePath`，见 `src/store.ts` ~L98）
- [x] 在 `handleRegister()` 的 new env 场景创建 session 时传递 cwd — 确保 temporary environment 场景的 session 携带工作目录
  - 位置: `src/transport/acp-ws-handler.ts:handleRegister()` new env 分支 (~L168-173)
  - 将 `storeCreateSession({...})` 的参数对象改为：
    ```typescript
    storeCreateSession({
      environmentId: record.id,
      title: agentName || "ACP Agent",
      source: "acp",
      userId: entry.userId,
      cwd: directory || null,
    });
    ```
  - 原因: `directory` 变量在 ~L121 已从 `msg.directory` 解析（类型为 `string | undefined`），直接透传即可
- [x] 为 cwd 传递链路编写单元测试
  - 测试文件: `src/__tests__/session-service.test.ts`
  - 测试场景:
    - `createSession 传递 cwd`: 调用 `createSession({ cwd: "/home/user/project" })` 后，返回的 session 的 cwd 字段等于 `"/home/user/project"`
    - `createSession 不传 cwd 时 cwd 为 null`: 调用 `createSession({})` 后，返回的 session 的 cwd 为 `null`
    - `createCodeSession 传递 cwd`: 调用 `createCodeSession({ cwd: "/tmp/workspace" })` 后，返回的 session 的 cwd 字段等于 `"/tmp/workspace"`
  - 运行命令: `bun test src/__tests__/session-service.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证 CreateSessionRequest 和 CreateCodeSessionRequest 包含 cwd 字段
  - `grep -n "cwd" src/types/api.ts`
  - 预期: 输出包含两个接口定义中的 `cwd?: string;`
- [x] 验证 createSession 和 createCodeSession 透传 cwd
  - `grep -n "cwd" src/services/session.ts`
  - 预期: 输出包含两个函数中的 `cwd: req.cwd,`
- [x] 验证 spawnInstanceFromEnvironment 传递 cwd
  - `grep -n "cwd" src/services/instance.ts`
  - 预期: 输出包含 `cwd: env.workspacePath`
- [x] 验证 handleRegister 两处创建 session 均传递 cwd
  - `grep -n "cwd" src/transport/acp-ws-handler.ts`
  - 预期: 输出包含两处 `cwd:` 赋值（bound env 分支和 new env 分支）
- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误
- [x] 验证新增测试通过
  - `bun test src/__tests__/session-service.test.ts`
  - 预期: 所有测试通过

---

### Task 6: 功能验收

**前置条件:**
- 启动命令: `bun run dev`（开发模式）或 `bun run start`（生产模式）
- 数据库: `data/rcs.db` 已初始化（自动创建）
- 测试数据: 通过 API 或测试脚本创建若干 session 记录

**端到端验证:**

1. 运行完整测试套件确保无回归（仅运行改动相关测试文件，已知 mock 隔离问题除外）
   - `bun test src/__tests__/`
   - 预期: 全部测试通过
   - 失败排查: 检查各 Task 的测试步骤，确认 agent_session 表已创建且外键约束正确

2. 验证 session 持久化 — 创建 session 后重启服务器，session 仍可查询
   - `# 启动服务器
bun run dev &
SERVER_PID=$!
sleep 3
# 创建 session（通过 API 或直接调用 storeCreateSession）
curl -s -X POST http://localhost:3000/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "persistence test", "source": "web"}' | jq .
SESSION_ID=$(curl -s http://localhost:3000/web/sessions 2>/dev/null | jq -r '.[0].id')
echo "Session ID: $SESSION_ID"
# 重启服务器
kill $SERVER_PID 2>/dev/null || true
sleep 2
bun run dev &
sleep 3
# 验证 session 仍存在
curl -s http://localhost:3000/web/sessions | jq ".[] | select(.id == \"$SESSION_ID\")"
# 清理
kill %1 2>/dev/null || true`
   - 预期: 重启后仍能查询到该 session，title/status 等字段与创建时一致
   - 失败排查: 检查 Task 4 的 `storeLoadSessionsFromDB()` 是否被正确调用，Task 3 的 `storeCreateSession` 双写逻辑是否正确

3. 验证 URL `/ctrl/session_xxx/?cwd=...` 重启后仍有效 — 前端能加载 session 页面
   - `# 获取 session ID 和 cwd
SESSION_ID=$(curl -s http://localhost:3000/web/sessions | jq -r '.[0].id')
CWD=$(curl -s "http://localhost:3000/web/sessions" | jq -r '.[0].cwd // "/tmp"')
# 重启后访问前端 URL
curl -s "http://localhost:3000/ctrl/${SESSION_ID}/?cwd=${CWD}" -o /dev/null -w "%{http_code}"
kill %1 2>/dev/null || true`
   - 预期: 返回 200（前端页面加载成功），不是 404
   - 失败排查: 检查 Task 5 的 cwd 传递链路是否完整，Task 4 的启动恢复是否在 HTTP 服务之前执行

4. 验证 environment 删除后 session 记录保留且 environmentId 为 null
   - `# 创建 environment 和关联 session
ENV_ID=$(curl -s -X POST http://localhost:3000/v1/environments \
  -H "Content-Type: application/json" \
  -d '{"workspace_path": "/tmp/test-env", "name": "test-env"}' | jq -r '.id')
SESSION_ID=$(curl -s -X POST http://localhost:3000/v1/sessions \
  -H "Content-Type: application/json" \
  -d "{\"environment_id\": \"$ENV_ID\"}" | jq -r '.id')
# 删除 environment
curl -s -X DELETE "http://localhost:3000/v1/environments/$ENV_ID"
# 验证 session 仍存在且 environmentId 为 null
curl -s "http://localhost:3000/web/sessions/$SESSION_ID" | jq '.environment_id'
kill %1 2>/dev/null || true`
   - 预期: 输出 `null`，而非 environment ID
   - 失败排查: 检查 Task 3 的 `storeDeleteEnvironment` 是否正确改为只清空 environmentId，Task 1 的外键 `ON DELETE SET NULL` 是否生效

5. 验证 session 的 status 在重启后保持原值（不做自动状态转换）
   - `# 创建 session 并设置 status 为 running
SESSION_ID=$(curl -s -X POST http://localhost:3000/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "status test"}' | jq -r '.id')
# 通过 storeUpdateSession 将 status 设为 running（需直接访问内部 store 或通过 API）
# 重启后检查 status
#（此验证需通过测试脚本直接调用 storeUpdateSession 和 storeLoadSessionsFromDB）
bun -e "
import { storeCreateSession, storeUpdateSession, db } from './src/store';
import { agentSession } from './src/db/schema';
const s = storeCreateSession({ title: 'status test' });
storeUpdateSession(s.id, { status: 'running' });
console.log('Before restart:', s.status);
// 模拟重启：清空内存后从 DB 恢复
const { storeReset, storeLoadSessionsFromDB, storeGetSession } = await import('./src/store');
storeReset();
storeLoadSessionsFromDB();
const restored = storeGetSession(s.id);
console.log('After restart:', restored?.status);
" | grep "After restart"`
   - 预期: 输出 "After restart: running"（与重启前一致）
   - 失败排查: 检查 Task 3 的 `storeLoadSessionsFromDB` 是否直接使用 DB 中的 status 而未做转换

6. 验证类型检查无错误
   - `bun run typecheck`
   - 预期: 无类型错误
   - 失败排查: 检查 Task 1 的 agentSession schema 导入是否正确，Task 2 的 SessionRecord.cwd 类型是否与 DB schema 一致

