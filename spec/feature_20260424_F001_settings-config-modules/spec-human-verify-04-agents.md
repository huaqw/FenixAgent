# Settings 配置管理 — Agents 配置路由 人工验收清单（4/6）

**生成时间:** 2026-04-24
**关联计划:** spec-plan.md Task 5
**关联设计:** spec-design.md §Agents 模块

> 所有验收项均可自动化验证，无需人类参与。清单用于自动执行。

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 确认 Task 1 ConfigService 已通过验收: `bun test src/__tests__/config-service.test.ts`

---

## 验收项目

### 场景 5：Agents 配置路由

#### - [x] 5.1 Agents 路由文件存在且导出正确
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认路由模块已创建
- **操作步骤:**
  1. [A] `grep -c "export default" src/routes/web/config/agents.ts` → 期望精确: `1`

#### - [x] 5.2 内置 Agent 集合定义完整（7 个）
- **来源:** spec-plan.md Task 5 检查步骤 / spec-design.md §Agents 模块
- **目的:** 确认 build/plan/general/explore/title/summary/compaction 受保护
- **操作步骤:**
  1. [A] `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts` → 期望包含: `build`
  2. [A] `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts` → 期望包含: `plan`
  2. [A] `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts` → 期望包含: `general`
  2. [A] `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts` → 期望包含: `explore`
  2. [A] `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts` → 期望包含: `title`
  2. [A] `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts` → 期望包含: `summary`
  2. [A] `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts` → 期望包含: `compaction`

#### - [x] 5.3 Agents 路由单元测试全部通过
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 验证 list/get/set/create/delete/set_default 及内置保护
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-agents.test.ts` → 期望包含: `all tests passed`

#### - [x] 5.4 Agents TypeScript 类型检查通过
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep "agents.ts" || echo "OK"` → 期望精确: `OK`

#### - [x] 5.5 Agent 名称/字段校验逻辑存在
- **来源:** spec-design.md §Agents 模块 字段校验规则 / spec-plan.md Task 5 执行步骤
- **目的:** 确认 name/mode/steps 校验函数已实现
- **操作步骤:**
  1. [A] `grep "isValidAgentName" src/routes/web/config/agents.ts` → 期望包含: `isValidAgentName`
  2. [A] `grep "isValidMode" src/routes/web/config/agents.ts` → 期望包含: `isValidMode`
  2. [A] `grep "isValidSteps" src/routes/web/config/agents.ts` → 期望包含: `isValidSteps`

#### - [x] 5.6 6 个 action 分发完整
- **来源:** spec-plan.md Task 5 执行步骤 / spec-design.md §Agents 模块
- **目的:** 确认 list/get/set/create/delete/set_default 全部实现
- **操作步骤:**
  1. [A] `grep "async function handle" src/routes/web/config/agents.ts` → 期望包含: `handleList`
  2. [A] `grep "async function handle" src/routes/web/config/agents.ts` → 期望包含: `handleGet`
  2. [A] `grep "async function handle" src/routes/web/config/agents.ts` → 期望包含: `handleSet`
  2. [A] `grep "async function handle" src/routes/web/config/agents.ts` → 期望包含: `handleCreate`
  2. [A] `grep "async function handle" src/routes/web/config/agents.ts` → 期望包含: `handleDelete`
  2. [A] `grep "async function handle" src/routes/web/config/agents.ts` → 期望包含: `handleSetDefault`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 5 | 5.1 | Agents 路由导出正确 | ✅ | - | ✅ |
| 场景 5 | 5.2 | 内置 Agent 集合完整 | ✅ | - | ✅ |
| 场景 5 | 5.3 | Agents 单元测试通过 | ✅ | - | ✅ |
| 场景 5 | 5.4 | Agents 类型检查通过 | ✅ | - | ✅ |
| 场景 5 | 5.5 | 字段校验逻辑存在 | ✅ | - | ✅ |
| 场景 5 | 5.6 | 6 个 action 分发完整 | ✅ | - | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
