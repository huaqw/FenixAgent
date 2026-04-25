# MCP 面板配置 人工验收清单

**生成时间:** 2026-04-25
**关联计划:** spec/feature_20260425_F005_mcp-panel-config/spec-plan.md
**关联设计:** spec/feature_20260425_F005_mcp-panel-config/spec-design.md

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查 Bun 运行时: `bun --version`
- [ ] [AUTO] 检查前端依赖: `cd /Users/konghayao/code/pazhou/remote-control-server/web && ls node_modules/.package-lock.json 2>/dev/null && echo "deps installed" || echo "need install"`
- [ ] [AUTO/SERVICE] 启动后端服务: `cd /Users/konghayao/code/pazhou/remote-control-server && bun run src/index.ts` (port: 3001)
- [ ] [AUTO/SERVICE] 启动前端开发服务器: `cd /Users/konghayao/code/pazhou/remote-control-server/web && bunx vite` (port: 5173)

### 测试数据准备
- [ ] [AUTO] 确保 opencode.json 存在: `mkdir -p ~/.config/opencode && test -f ~/.config/opencode/opencode.json || echo '{}' > ~/.config/opencode/opencode.json`
- [ ] [MANUAL] 登录前端页面 `http://localhost:5173`，从浏览器 DevTools 获取 session cookie，用于后续 curl 命令

---

## 验收项目

### 场景 1: 类型定义完整性

#### - [x] 1.1 MCP 类型定义已导出（6 个 export）
- **来源:** spec-plan.md Task 1 检查步骤 / spec-design.md §数据模型
- **目的:** 确认 MCP 类型系统完整
- **操作步骤:**
  1. [A] `grep -c "export.*McpLocalConfig\|export.*McpRemoteConfig\|export.*McpServerConfig\|export.*McpOAuthConfig\|export.*McpServerInfo\|export.*McpServerDetail" web/src/types/config.ts` → 期望精确: `6`

#### - [x] 1.2 OpenCodeConfig 包含 mcp 字段
- **来源:** spec-plan.md Task 1 检查步骤
- **目的:** 确认配置入口字段存在
- **操作步骤:**
  1. [A] `grep "mcp?" web/src/types/config.ts` → 期望包含: `mcp?: Record<string, McpServerConfig>;`

#### - [x] 1.3 类型定义单元测试通过
- **来源:** spec-plan.md Task 1 执行步骤
- **目的:** 确认类型运行时行为正确
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/config-mcp-types.test.ts 2>&1 | tail -3` → 期望包含: `pass`

#### - [x] 1.4 前端 TypeScript 编译通过
- **来源:** spec-plan.md Task 1 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server/web && npx tsc --noEmit --pretty 2>&1 | tail -5` → 期望包含: (空输出)

---

### 场景 2: 后端 MCP API 完整性

#### - [x] 2.1 MCP 路由文件已创建且导出 Hono 实例
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认路由文件结构完整
- **操作步骤:**
  1. [A] `grep -c "export default app" src/routes/web/config/mcp.ts` → 期望精确: `1`

#### - [x] 2.2 MCP 路由已在 index.ts 中注册
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认路由可访问
- **操作步骤:**
  1. [A] `grep "mcp" src/routes/web/config/index.ts` → 期望包含: `import mcp from "./mcp";` 和 `app.route("/", mcp);`

#### - [x] 2.3 MCP 路由包含全部 7 个 action
- **来源:** spec-plan.md Task 2 检查步骤 / spec-design.md §API 设计
- **目的:** 确认 CRUD+启禁用操作完整
- **操作步骤:**
  1. [A] `grep -oE 'case "[a-z]+"' src/routes/web/config/mcp.ts | sort` → 期望包含: `case "create"` 和 `case "delete"` 和 `case "disable"` 和 `case "enable"` 和 `case "get"` 和 `case "list"` 和 `case "update"`

#### - [x] 2.4 路由使用 sessionAuth 中间件
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认认证保护
- **操作步骤:**
  1. [A] `grep "sessionAuth" src/routes/web/config/mcp.ts` → 期望包含: `sessionAuth`

#### - [x] 2.5 后端 MCP 路由单元测试通过
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认 handler 输入校验和返回值正确
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && bun test src/__tests__/config-mcp.test.ts 2>&1 | tail -3` → 期望包含: `pass`

#### - [x] 2.6 后端 TypeScript 编译通过
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && npx tsc --noEmit --pretty 2>&1 | tail -5` → 期望包含: (空输出)

---

### 场景 3: 前端 API 客户端完整性

#### - [x] 3.1 MCP 类型已导入到 client.ts
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认类型依赖正确
- **操作步骤:**
  1. [A] `grep "McpServerInfo\|McpServerDetail\|McpServerConfig" web/src/api/client.ts | head -1` → 期望包含: `import`

#### - [x] 3.2 apiConfigAction module 参数包含 mcp
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认模块路由可映射
- **操作步骤:**
  1. [A] `grep "'mcp'" web/src/api/client.ts` → 期望包含: `'mcp'`

#### - [x] 3.3 七个 MCP API 函数已导出
- **来源:** spec-plan.md Task 3 检查步骤 / spec-design.md §API 设计
- **目的:** 确认 API 函数完整
- **操作步骤:**
  1. [A] `grep -oE "export function api[A-Z][a-zA-Z]*Mcp[a-zA-Z]*" web/src/api/client.ts | sort` → 期望包含: `apiCreateMcpServer` 和 `apiDeleteMcpServer` 和 `apiDisableMcpServer` 和 `apiEnableMcpServer` 和 `apiGetMcpServer` 和 `apiListMcpServers` 和 `apiUpdateMcpServer`

#### - [x] 3.4 apiListMcpServers 正确展开 servers 字段
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认列表 API 返回展开逻辑
- **操作步骤:**
  1. [A] `grep 'apiConfigAction.*"mcp".*"list"' web/src/api/client.ts` → 期望包含: `.then(d => d.servers)`

#### - [x] 3.5 前端 API 客户端单元测试通过
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认 fetch 调用和响应解析正确
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/config-mcp-api-client.test.ts 2>&1 | tail -3` → 期望包含: `pass`

---

### 场景 4: MCP 页面组件完整性

#### - [x] 4.1 McpPage 组件已导出
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认页面组件存在
- **操作步骤:**
  1. [A] `grep -c "export function McpPage" web/src/pages/McpPage.tsx` → 期望精确: `1`

#### - [x] 4.2 纯工具函数和类型已导出（5 函数 + 1 类型 = 6）
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认可测试的纯函数存在
- **操作步骤:**
  1. [A] `grep -c "export function\|export type" web/src/pages/McpPage.tsx` → 期望精确: `6`

#### - [x] 4.3 引用全部 7 个 MCP API 函数
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认 API 调用完整
- **操作步骤:**
  1. [A] `grep -oE "api[A-Z][a-zA-Z]*Mcp[a-zA-Z]*" web/src/pages/McpPage.tsx | sort -u` → 期望包含: 7 个去重函数名

#### - [x] 4.4 DataTable 包含 5 列（name/type/enabled/summary/timeout）
- **来源:** spec-plan.md Task 4 检查步骤 / spec-design.md §前端 UI
- **目的:** 确认列表展示列完整
- **操作步骤:**
  1. [A] `grep -oE 'key: "[a-z]+"' web/src/pages/McpPage.tsx | head -5` → 期望包含: `name` 和 `type` 和 `enabled` 和 `summary` 和 `timeout`

#### - [x] 4.5 表单包含 local/remote 条件渲染
- **来源:** spec-plan.md Task 4 检查步骤 / spec-design.md §实现要点
- **目的:** 确认动态表单切换
- **操作步骤:**
  1. [A] `grep -c 'formType === "local"\|formType === "remote"' web/src/pages/McpPage.tsx` → 期望包含: `2`

#### - [x] 4.6 键值对编辑器包含添加/删除按钮
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认环境变量和请求头可编辑
- **操作步骤:**
  1. [A] `grep -c "添加\|删除" web/src/pages/McpPage.tsx` → 期望包含: `4`

#### - [x] 4.7 OAuth 字段存在（4 个字段多处引用）
- **来源:** spec-plan.md Task 4 检查步骤 / spec-design.md §数据模型
- **目的:** 确认 remote OAuth 可配置
- **操作步骤:**
  1. [A] `grep "formOauthClientId\|formOauthClientSecret\|formOauthScope\|formOauthRedirectUri" web/src/pages/McpPage.tsx | wc -l | tr -d ' '` → 期望包含: (大于 4)

#### - [x] 4.8 使用五个配置组件（DataTable/FormDialog/ConfirmDialog/BatchActionBar/StatusBadge）
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认 UI 组件一致性
- **操作步骤:**
  1. [A] `grep -c "DataTable\|FormDialog\|ConfirmDialog\|BatchActionBar\|StatusBadge" web/src/pages/McpPage.tsx` → 期望包含: (至少 8)

#### - [x] 4.9 McpPage 纯函数单元测试通过
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认校验、转换、组装逻辑正确
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/config-mcp-page.test.ts 2>&1 | tail -3` → 期望包含: `pass`

---

### 场景 5: 路由集成完整性

#### - [x] 5.1 Plug 图标已导入
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认侧栏图标资源
- **操作步骤:**
  1. [A] `grep "Plug" web/src/App.tsx` → 期望包含: `Plug`

#### - [x] 5.2 McpPage lazy import 存在
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认懒加载路由
- **操作步骤:**
  1. [A] `grep "McpPage.*lazy" web/src/App.tsx` → 期望包含: `lazy`

#### - [x] 5.3 parseConfigView 中 configViews 包含 "mcp"
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认路由解析支持 mcp
- **操作步骤:**
  1. [A] `grep -A1 'export function parseConfigView' web/src/App.tsx | grep "mcp"` → 期望包含: `mcp`

#### - [x] 5.4 parseRoute 中 configViews 包含 "mcp"（两处一致）
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认运行时路由解析一致
- **操作步骤:**
  1. [A] `grep -n 'configViews.*mcp' web/src/App.tsx | wc -l | tr -d ' '` → 期望精确: `2`

#### - [x] 5.5 ViewId 类型包含 "mcp"
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认类型安全
- **操作步骤:**
  1. [A] `grep 'ViewId.*mcp' web/src/App.tsx` → 期望包含: `"mcp"`

#### - [x] 5.6 侧栏 footerItems 包含 MCP 入口
- **来源:** spec-plan.md Task 5 检查步骤 / spec-design.md §路由集成
- **目的:** 确认侧栏导航入口可见
- **操作步骤:**
  1. [A] `grep -A2 'id: "mcp"' web/src/App.tsx` → 期望包含: `label: "MCP"` 和 `Plug`

#### - [x] 5.7 pageTitle 的 titles 对象包含 mcp 键
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认页面标题显示
- **操作步骤:**
  1. [A] `grep 'mcp: "MCP"' web/src/App.tsx` → 期望包含: `mcp: "MCP"`

#### - [x] 5.8 主渲染区域包含 mcp 路由分支
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认 McpPage 组件渲染
- **操作步骤:**
  1. [A] `grep 'configView === "mcp"' web/src/App.tsx` → 期望包含: `configView === "mcp"`

#### - [x] 5.9 MCP 路由单元测试通过
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认路由解析逻辑正确
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/config-mcp-routing.test.ts 2>&1 | tail -3` → 期望包含: `pass`

#### - [x] 5.10 现有路由测试不受影响
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认无回归
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/config-routing.test.ts 2>&1 | tail -3` → 期望包含: `pass`

---

### 场景 6: 端到端 API 验证

#### - [x] 6.1 完整测试套件通过
- **来源:** spec-plan.md Task 6 步骤 1
- **目的:** 确认无回归
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server && bun test 2>&1 | tail -5` → 期望包含: `pass`

#### - [x] 6.2 MCP 后端 API 返回空列表
- **来源:** spec-plan.md Task 6 步骤 2
- **目的:** 确认 API 基础可用
- **操作步骤:**
  1. [A] `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"list"}' | jq .data.servers` → 期望包含: `[]`

#### - [x] 6.3 创建 local 类型 MCP 服务器
- **来源:** spec-plan.md Task 6 步骤 3 / spec-design.md §API 设计
- **目的:** 确认 local 创建和持久化
- **操作步骤:**
  1. [A] `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"create","name":"test-local","config":{"type":"local","command":["npx","mcp-server"],"environment":{"KEY":"VALUE"},"timeout":5000}}' | jq .data` → 期望包含: `"test-local"`

#### - [x] 6.4 创建 remote 类型 MCP 服务器
- **来源:** spec-plan.md Task 6 步骤 4 / spec-design.md §API 设计
- **目的:** 确认 remote 创建和持久化
- **操作步骤:**
  1. [A] `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"create","name":"test-remote","config":{"type":"remote","url":"https://example.com/mcp","headers":{"Auth":"Bearer t"},"timeout":10000}}' | jq .data` → 期望包含: `"test-remote"`

#### - [x] 6.5 列表返回两个服务器且类型和摘要正确
- **来源:** spec-plan.md Task 6 步骤 5
- **目的:** 确认列表数据正确
- **操作步骤:**
  1. [A] `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"list"}' | jq '.data.servers[] | {name, type, summary, enabled}'` → 期望包含: `test-local` 和 `test-remote`

#### - [x] 6.6 opencode.json 中 mcp 字段正确写入
- **来源:** spec-plan.md Task 6 步骤 6 / spec-design.md §验收标准
- **目的:** 确认配置持久化到磁盘
- **操作步骤:**
  1. [A] `cat ~/.config/opencode/opencode.json | jq .mcp` → 期望包含: `test-local` 和 `test-remote`

#### - [x] 6.7 禁用/启用服务器正常工作
- **来源:** spec-plan.md Task 6 步骤 7 / spec-design.md §验收标准
- **目的:** 确认状态切换逻辑
- **操作步骤:**
  1. [A] `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"disable","name":"test-local"}' | jq .success` → 期望包含: `true`
  2. [A] `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"list"}' | jq '.data.servers[] | select(.name=="test-local") | .enabled'` → 期望包含: `false`

#### - [x] 6.8 删除服务器正常工作
- **来源:** spec-plan.md Task 6 步骤 8 / spec-design.md §验收标准
- **目的:** 确认删除功能
- **操作步骤:**
  1. [A] `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"delete","name":"test-local"}' | jq .success` → 期望包含: `true`

#### - [x] 6.9 前端生产构建无错误
- **来源:** spec-plan.md Task 6 步骤 9
- **目的:** 确认生产构建成功
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server/web && npx vite build 2>&1 | tail -5` → 期望包含: `built in`

---

### 场景 7: 前端 UI 交互验证

#### - [x] 7.1 侧栏显示 MCP 入口并可导航
- **来源:** spec-plan.md Task 6 步骤 10 / spec-design.md §验收标准
- **目的:** 确认导航入口可见可点击
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173`，登录后查看侧栏底部区域 → 侧栏显示 MCP 入口（Plug 图标 + "MCP" 文字），点击后跳转到 `/code/mcp` → 是/否

#### - [x] 7.2 MCP 列表页展示服务器信息
- **来源:** spec-plan.md Task 6 步骤 10 / spec-design.md §验收标准
- **目的:** 确认列表页面渲染正确
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173/code/mcp`，查看页面内容 → 页面显示 "MCP" 标题、服务器列表（含名称/类型/状态/描述/超时列）、"新建 MCP 服务器"按钮 → 是/否

#### - [x] 7.3 新建 local 类型 MCP 服务器完整流程
- **来源:** spec-plan.md Task 6 步骤 11 / spec-design.md §验收标准
- **目的:** 确认 local 创建 UI 流程
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173/code/mcp`，点击"新建 MCP 服务器"按钮，选择 Local 类型，填写名称 "ui-local-test"、命令 "npx mcp-server-test"、添加环境变量 KEY=VALUE、超时 3000，点击保存 → 对话框关闭，列表出现 "ui-local-test"，类型为 local，状态为已启用 → 是/否

#### - [x] 7.4 新建 remote 类型 MCP 服务器完整流程
- **来源:** spec-plan.md Task 6 步骤 12 / spec-design.md §验收标准
- **目的:** 确认 remote 创建 UI 流程
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173/code/mcp`，点击"新建 MCP 服务器"按钮，选择 Remote 类型，填写名称 "ui-remote-test"、URL "https://example.com/mcp"、添加请求头 Auth=Bearer t、OAuth Client ID "test-id"，点击保存 → 对话框关闭，列表出现 "ui-remote-test"，类型为 remote，状态为已启用 → 是/否

#### - [x] 7.5 编辑服务器流程
- **来源:** spec-plan.md Task 6 步骤 13 / spec-design.md §验收标准
- **目的:** 确认编辑回显和保存正确
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173/code/mcp`，点击 ui-local-test 行的"编辑"按钮 → 对话框打开，名称和类型字段为 disabled，命令和环境变量已正确填充
  2. [H] 修改超时为 8000，点击保存 → 保存成功，超时列显示 "8000ms" → 是/否

#### - [x] 7.6 启用/禁用切换
- **来源:** spec-plan.md Task 6 步骤 14 / spec-design.md §验收标准
- **目的:** 确认状态切换 UI 反馈
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173/code/mcp`，点击 ui-local-test 行的"禁用"按钮 → 按钮文字变为"启用"，状态列显示 disabled 样式
  2. [H] 点击"启用"按钮 → 按钮文字变为"禁用"，状态列恢复 enabled 样式 → 是/否

#### - [x] 7.7 删除服务器流程
- **来源:** spec-plan.md Task 6 步骤 15 / spec-design.md §验收标准
- **目的:** 确认删除确认对话框和执行
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173/code/mcp`，点击 ui-local-test 行的"删除"按钮 → 弹出确认对话框，提示"此操作不可逆"
  2. [H] 点击确认 → 对话框关闭，列表中不再显示 ui-local-test → 是/否

#### - [x] 7.8 批量操作
- **来源:** spec-plan.md Task 6 步骤 16 / spec-design.md §验收标准
- **目的:** 确认批量启禁用和删除
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173/code/mcp`，勾选多个服务器 → 批量操作栏出现，显示"批量启用""批量禁用""批量删除"按钮
  2. [H] 点击"批量禁用"，确认后 → 所有选中服务器状态变为 disabled
  3. [H] 点击"批量删除"，确认后 → 所有选中服务器从列表移除，toast 显示操作数量 → 是/否

#### - [x] 7.9 配置数据正确持久化到 opencode.json
- **来源:** spec-plan.md Task 6 步骤 17 / spec-design.md §验收标准
- **目的:** 确认 opencode.json 写入格式正确
- **操作步骤:**
  1. [A] `cat ~/.config/opencode/opencode.json | jq .mcp` → 期望包含: (包含前端创建的服务器配置，type/command/url 等字段符合 opencode.ai schema)

---

## 验收后清理

- [ ] [AUTO] 删除 API 测试数据: `curl -s -b <session-cookie> http://localhost:3001/web/config/mcp -H 'Content-Type: application/json' -d '{"action":"delete","name":"test-remote"}'`
- [ ] [AUTO] 终止后端服务: `kill $(lsof -ti:3001) 2>/dev/null; echo "backend stopped"`
- [ ] [AUTO] 终止前端开发服务器: `kill $(lsof -ti:5173) 2>/dev/null; echo "frontend stopped"`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | MCP 类型导出完整性 | Y | - | ⬜ |
| 场景 1 | 1.2 | OpenCodeConfig mcp 字段 | Y | - | ⬜ |
| 场景 1 | 1.3 | 类型定义单元测试 | Y | - | ⬜ |
| 场景 1 | 1.4 | 前端 TypeScript 编译 | Y | - | ⬜ |
| 场景 2 | 2.1 | MCP 路由文件导出 | Y | - | ⬜ |
| 场景 2 | 2.2 | 路由注册到 index.ts | Y | - | ⬜ |
| 场景 2 | 2.3 | 7 个 action 完整 | Y | - | ⬜ |
| 场景 2 | 2.4 | sessionAuth 中间件 | Y | - | ⬜ |
| 场景 2 | 2.5 | 后端单元测试 | Y | - | ⬜ |
| 场景 2 | 2.6 | 后端 TypeScript 编译 | Y | - | ⬜ |
| 场景 3 | 3.1 | MCP 类型导入 client.ts | Y | - | ⬜ |
| 场景 3 | 3.2 | apiConfigAction 含 mcp | Y | - | ⬜ |
| 场景 3 | 3.3 | 7 个 API 函数导出 | Y | - | ⬜ |
| 场景 3 | 3.4 | list action 展开逻辑 | Y | - | ⬜ |
| 场景 3 | 3.5 | API 客户端单元测试 | Y | - | ⬜ |
| 场景 4 | 4.1 | McpPage 组件导出 | Y | - | ⬜ |
| 场景 4 | 4.2 | 纯函数+类型导出 | Y | - | ⬜ |
| 场景 4 | 4.3 | 7 个 API 函数引用 | Y | - | ⬜ |
| 场景 4 | 4.4 | DataTable 5 列配置 | Y | - | ⬜ |
| 场景 4 | 4.5 | local/remote 条件渲染 | Y | - | ⬜ |
| 场景 4 | 4.6 | 键值对编辑器按钮 | Y | - | ⬜ |
| 场景 4 | 4.7 | OAuth 字段存在 | Y | - | ⬜ |
| 场景 4 | 4.8 | 五个配置组件使用 | Y | - | ⬜ |
| 场景 4 | 4.9 | 纯函数单元测试 | Y | - | ⬜ |
| 场景 5 | 5.1 | Plug 图标导入 | Y | - | ⬜ |
| 场景 5 | 5.2 | McpPage lazy import | Y | - | ⬜ |
| 场景 5 | 5.3 | parseConfigView 含 mcp | Y | - | ⬜ |
| 场景 5 | 5.4 | parseRoute 含 mcp 两处 | Y | - | ⬜ |
| 场景 5 | 5.5 | ViewId 类型含 mcp | Y | - | ⬜ |
| 场景 5 | 5.6 | footerItems MCP 入口 | Y | - | ⬜ |
| 场景 5 | 5.7 | pageTitle mcp 标题 | Y | - | ⬜ |
| 场景 5 | 5.8 | mcp 路由渲染分支 | Y | - | ⬜ |
| 场景 5 | 5.9 | 路由单元测试 | Y | - | ⬜ |
| 场景 5 | 5.10 | 现有路由测试无回归 | Y | - | ⬜ |
| 场景 6 | 6.1 | 完整测试套件 | Y | - | ⬜ |
| 场景 6 | 6.2 | API 返回空列表 | Y | - | ⬜ |
| 场景 6 | 6.3 | 创建 local 服务器 | Y | - | ⬜ |
| 场景 6 | 6.4 | 创建 remote 服务器 | Y | - | ⬜ |
| 场景 6 | 6.5 | 列表返回正确 | Y | - | ⬜ |
| 场景 6 | 6.6 | opencode.json 写入 | Y | - | ⬜ |
| 场景 6 | 6.7 | 禁用/启用服务器 | Y | - | ⬜ |
| 场景 6 | 6.8 | 删除服务器 | Y | - | ⬜ |
| 场景 6 | 6.9 | 前端生产构建 | Y | - | ⬜ |
| 场景 7 | 7.1 | 侧栏 MCP 入口导航 | - | Y | ⬜ |
| 场景 7 | 7.2 | 列表页展示 | - | Y | ⬜ |
| 场景 7 | 7.3 | 新建 local UI 流程 | - | Y | ⬜ |
| 场景 7 | 7.4 | 新建 remote UI 流程 | - | Y | ⬜ |
| 场景 7 | 7.5 | 编辑服务器 UI | - | Y | ⬜ |
| 场景 7 | 7.6 | 启用/禁用切换 UI | - | Y | ⬜ |
| 场景 7 | 7.7 | 删除服务器 UI | - | Y | ⬜ |
| 场景 7 | 7.8 | 批量操作 UI | - | Y | ⬜ |
| 场景 7 | 7.9 | 配置数据持久化验证 | Y | - | ⬜ |

**验收结论:** ⬜ 全部通过 / ⬜ 存在问题
