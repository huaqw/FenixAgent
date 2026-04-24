# Settings 配置管理 — Providers 配置路由 人工验收清单（2/6）

**生成时间:** 2026-04-24
**关联计划:** spec-plan.md Task 3
**关联设计:** spec-design.md §Providers 模块

> 所有验收项均可自动化验证，无需人类参与。清单用于自动执行。

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 确认 Task 1 ConfigService 已通过验收: `bun test src/__tests__/config-service.test.ts`

---

## 验收项目

### 场景 3：Providers 配置路由

#### - [x] 3.1 Providers 路由文件存在且导出 Hono app
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认路由模块已创建
- **操作步骤:**
  1. [A] `grep "export default app" src/routes/web/config/providers.ts` → 期望包含: `export default app`

#### - [x] 3.2 5 个 action handler 函数完整
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认 list/get/set/test/delete 全部实现
- **操作步骤:**
  1. [A] `grep -c "async function handle" src/routes/web/config/providers.ts` → 期望精确: `5`
  2. [A] `grep "async function handle" src/routes/web/config/providers.ts` → 期望包含: `handleList`
  2. [A] `grep "async function handle" src/routes/web/config/providers.ts` → 期望包含: `handleGet`
  2. [A] `grep "async function handle" src/routes/web/config/providers.ts` → 期望包含: `handleSet`
  2. [A] `grep "async function handle" src/routes/web/config/providers.ts` → 期望包含: `handleTest`
  2. [A] `grep "async function handle" src/routes/web/config/providers.ts` → 期望包含: `handleDelete`

#### - [x] 3.3 Providers 路由单元测试全部通过
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 验证 list/get/set/test/delete action 的请求处理逻辑
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-providers.test.ts` → 期望包含: `all tests passed`

#### - [x] 3.4 Providers TypeScript 类型检查通过
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep "providers.ts" || echo "OK"` → 期望精确: `OK`

#### - [x] 3.5 API Key 安全处理逻辑存在
- **来源:** spec-design.md §Providers 模块 / spec-plan.md Task 3 执行步骤
- **目的:** 确认明文 Key 替换为环境变量引用
- **操作步骤:**
  1. [A] `grep "RCS_SECRET_" src/routes/web/config/providers.ts` → 期望包含: `RCS_SECRET_`
  2. [A] `grep "keyHint" src/routes/web/config/providers.ts` → 期望包含: `toKeyHint`

#### - [x] 3.6 标准 ok/err 响应辅助函数存在
- **来源:** spec-design.md §通用 API 规范 / spec-plan.md Task 3 执行步骤
- **目的:** 确认统一响应格式
- **操作步骤:**
  1. [A] `grep "function ok" src/routes/web/config/providers.ts` → 期望包含: `success: true`
  2. [A] `grep "function err" src/routes/web/config/providers.ts` → 期望包含: `success: false`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 3 | 3.1 | Providers 路由导出正确 | ✅ | - | ✅ |
| 场景 3 | 3.2 | 5 个 action handler 完整 | ✅ | - | ✅ |
| 场景 3 | 3.3 | Providers 单元测试通过 | ✅ | - | ✅ |
| 场景 3 | 3.4 | Providers 类型检查通过 | ✅ | - | ✅ |
| 场景 3 | 3.5 | API Key 安全处理存在 | ✅ | - | ✅ |
| 场景 3 | 3.6 | 标准响应格式存在 | ✅ | - | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
