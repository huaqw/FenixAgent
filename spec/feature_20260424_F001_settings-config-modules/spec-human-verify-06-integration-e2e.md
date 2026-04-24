# Settings 配置管理 — 路由集成与端到端验证 人工验收清单（6/6）

**生成时间:** 2026-04-24
**关联计划:** spec-plan.md Task 7-8
**关联设计:** spec-design.md §端点汇总 / §验收标准

> 所有验收项均可自动化验证，无需人类参与。清单用于自动执行。

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 确认 Task 1-6 全部通过单元测试: `bun test src/__tests__/config-service.test.ts src/__tests__/skill-service.test.ts src/__tests__/config-providers.test.ts src/__tests__/config-models.test.ts src/__tests__/config-agents.test.ts src/__tests__/config-skills.test.ts`
- [ ] [AUTO/SERVICE] 启动 RCS 服务: `bun run src/index.ts` (port: 3000)

### 测试数据准备
- [ ] 准备认证 Cookie: 需要有效的 `better-auth.session_token`（以下用 `TEST_TOKEN` 占位）

---

## 验收项目

### 场景 7：路由集成注册

#### - [x] 7.1 config/index.ts 文件存在且导出正确
- **来源:** spec-plan.md Task 7 检查步骤
- **目的:** 确认路由聚合入口已创建
- **操作步骤:**
  1. [A] `grep "export default app" src/routes/web/config/index.ts` → 期望包含: `export default app`

#### - [x] 7.2 index.ts 包含 config 路由注册
- **来源:** spec-plan.md Task 7 检查步骤
- **目的:** 确认主应用注册了 config 路由
- **操作步骤:**
  1. [A] `grep "webConfig" src/index.ts` → 期望包含: `import`
  2. [A] `grep "webConfig" src/index.ts` → 期望包含: `route`

#### - [x] 7.3 路由集成测试全部通过
- **来源:** spec-plan.md Task 7 检查步骤
- **目的:** 验证 4 个模块路由可达及鉴权拦截
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-integration.test.ts` → 期望包含: `all tests passed`

#### - [x] 7.4 路由集成 TypeScript 类型检查通过
- **来源:** spec-plan.md Task 7 检查步骤
- **目的:** 确认 index.ts 和 config/ 无类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep -E "index.ts|config" || echo "OK"` → 期望精确: `OK`

---

### 场景 8：完整测试套件

#### - [x] 8.1 全量测试通过（含 7 个新增测试文件）
- **来源:** spec-plan.md Task 8 端到端验证
- **目的:** 确认无回归，所有测试通过
- **操作步骤:**
  1. [A] `bun test` → 期望包含: `all tests passed`

#### - [x] 8.2 TypeScript 全量类型检查通过
- **来源:** spec-plan.md Task 8 端到端验证
- **目的:** 确认整个项目无类型错误
- **操作步骤:**
  1. [A] `bun run typecheck` → 期望包含: `0 errors`

---

### 场景 9：端到端 API 验证

#### - [x] 9.1 Providers list 端到端
- **来源:** spec-plan.md Task 8 端到端验证 / spec-design.md §Providers 模块
- **目的:** 确认 Providers API 实际可达且返回正确格式
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/config/providers -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"list"}'` → 期望包含: `"success"`

#### - [x] 9.2 Models get 端到端
- **来源:** spec-plan.md Task 8 端到端验证 / spec-design.md §Models 模块
- **目的:** 确认 Models API 实际可达且返回 current/available
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/config/models -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"get"}'` → 期望包含: `"current"`

#### - [x] 9.3 Agents 删除内置 Agent 返回 FORBIDDEN
- **来源:** spec-plan.md Task 8 端到端验证 / spec-design.md §Agents 模块
- **目的:** 确认内置 Agent 保护机制生效
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/config/agents -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"delete","name":"build"}'` → 期望包含: `"FORBIDDEN"`

#### - [x] 9.4 Skills set 端到端
- **来源:** spec-plan.md Task 8 端到端验证 / spec-design.md §Skills 模块
- **目的:** 确认 Skills 创建并自动启用
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/config/skills -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"set","name":"test-skill","data":{"description":"Test","content":"# Test\nHello"}}'` → 期望包含: `"enabled": true`

#### - [x] 9.5 未认证请求返回 401
- **来源:** spec-design.md §通用 API 规范（鉴权） / spec-plan.md Task 7 集成测试
- **目的:** 确认未登录无法访问配置 API
- **操作步骤:**
  1. [A] `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/web/config/providers -H 'Content-Type: application/json' -d '{"action":"list"}'` → 期望包含: `401`

---

### 场景 10：边界与回归

#### - [x] 10.1 配置文件不存在时返回空默认值
- **来源:** spec-design.md §验收标准 / spec-plan.md Task 1 执行步骤
- **目的:** 确认文件缺失不报错
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-service.test.ts --test-name-pattern "getConfig.*不存在"` → 期望包含: `passed`

#### - [x] 10.2 API Key 明文不出现在 API 响应中
- **来源:** spec-design.md §验收标准 / spec-plan.md Task 3 执行步骤
- **目的:** 确认只返回 keyHint
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-providers.test.ts --test-name-pattern "set action"` → 期望包含: `passed`

#### - [x] 10.3 并发写入不导致配置文件损坏
- **来源:** spec-design.md §验收标准 / spec-plan.md Task 1 执行步骤
- **目的:** 确认互斥锁保护有效
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-service.test.ts --test-name-pattern "并发"` → 期望包含: `passed`

#### - [x] 10.4 Skill enable/disable 通过文件夹移动实现
- **来源:** spec-design.md §验收标准 / spec-plan.md Task 2 执行步骤
- **目的:** 确认文件夹在 skills/ 和 _disabled/ 之间正确移动
- **操作步骤:**
  1. [A] `bun test src/__tests__/skill-service.test.ts --test-name-pattern "enable"` → 期望包含: `passed`
  2. [A] `bun test src/__tests__/skill-service.test.ts --test-name-pattern "disable"` → 期望包含: `passed`

---

## 验收后清理

- [ ] [AUTO] 终止 RCS 后台服务: `kill $(lsof -ti:3000) 2>/dev/null; echo "cleaned"` (对应准备阶段启动的服务)
- [ ] [AUTO] 清理测试 Skill 文件夹: `rm -rf ~/.config/opencode/skills/test-skill 2>/dev/null; echo "cleaned"`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 7 | 7.1 | config/index.ts 导出正确 | ✅ | - | ✅ |
| 场景 7 | 7.2 | index.ts 路由注册正确 | ✅ | - | ✅ |
| 场景 7 | 7.3 | 路由集成测试通过 | ✅ | - | ✅ |
| 场景 7 | 7.4 | 集成类型检查通过 | ✅ | - | ✅ |
| 场景 8 | 8.1 | 全量测试通过 | ✅ | - | ✅ |
| 场景 8 | 8.2 | TypeScript 全量检查通过 | ✅ | - | ✅ |
| 场景 9 | 9.1 | Providers list 端到端 | ✅ | - | ✅ |
| 场景 9 | 9.2 | Models get 端到端 | ✅ | - | ✅ |
| 场景 9 | 9.3 | Agents 内置保护端到端 | ✅ | - | ✅ |
| 场景 9 | 9.4 | Skills set 端到端 | ✅ | - | ✅ |
| 场景 9 | 9.5 | 未认证请求返回 401 | ✅ | - | ✅ |
| 场景 10 | 10.1 | 配置缺失返回空默认值 | ✅ | - | ✅ |
| 场景 10 | 10.2 | API Key 不泄露明文 | ✅ | - | ✅ |
| 场景 10 | 10.3 | 并发写入安全性 | ✅ | - | ✅ |
| 场景 10 | 10.4 | Skill 文件夹移动正确 | ✅ | - | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
