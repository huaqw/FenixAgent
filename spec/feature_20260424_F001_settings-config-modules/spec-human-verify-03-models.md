# Settings 配置管理 — Models 配置路由 人工验收清单（3/6）

**生成时间:** 2026-04-24
**关联计划:** spec-plan.md Task 4
**关联设计:** spec-design.md §Models 模块

> 所有验收项均可自动化验证，无需人类参与。清单用于自动执行。

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 确认 Task 1 ConfigService 已通过验收: `bun test src/__tests__/config-service.test.ts`

---

## 验收项目

### 场景 4：Models 配置路由

#### - [x] 4.1 Models 路由文件存在且导出 Hono app
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认路由模块已创建
- **操作步骤:**
  1. [A] `grep "export default app" src/routes/web/config/models.ts` → 期望包含: `export default app`

#### - [x] 4.2 3 个 action handler 函数完整
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认 get/set/refresh 全部实现
- **操作步骤:**
  1. [A] `grep -c "async function handle" src/routes/web/config/models.ts` → 期望精确: `3`
  2. [A] `grep "async function handle" src/routes/web/config/models.ts` → 期望包含: `handleGet`
  2. [A] `grep "async function handle" src/routes/web/config/models.ts` → 期望包含: `handleSet`
  2. [A] `grep "async function handle" src/routes/web/config/models.ts` → 期望包含: `handleRefresh`

#### - [x] 4.3 Models 路由单元测试全部通过
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 验证 get/set/refresh action 和缓存机制
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-models.test.ts` → 期望包含: `all tests passed`

#### - [x] 4.4 Models TypeScript 类型检查通过
- **来源:** spec-plan.md Task 4 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep "models.ts" || echo "OK"` → 期望精确: `OK`

#### - [x] 4.5 可用模型缓存机制存在
- **来源:** spec-design.md §Models 模块 / spec-plan.md Task 4 执行步骤
- **目的:** 确认 TTL 缓存避免频繁查询
- **操作步骤:**
  1. [A] `grep "CACHE_TTL" src/routes/web/config/models.ts` → 期望包含: `CACHE_TTL`
  2. [A] `grep "cachedAvailable" src/routes/web/config/models.ts` → 期望包含: `cachedAvailable`

#### - [x] 4.6 使用 setTopLevelField 写入模型配置
- **来源:** spec-plan.md Task 4 执行步骤 / spec-design.md §Models 模块
- **目的:** 确认 model/small_model 写入顶层字段
- **操作步骤:**
  1. [A] `grep "setTopLevelField" src/routes/web/config/models.ts` → 期望包含: `setTopLevelField`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 4 | 4.1 | Models 路由导出正确 | ✅ | - | ✅ |
| 场景 4 | 4.2 | 3 个 action handler 完整 | ✅ | - | ✅ |
| 场景 4 | 4.3 | Models 单元测试通过 | ✅ | - | ✅ |
| 场景 4 | 4.4 | Models 类型检查通过 | ✅ | - | ✅ |
| 场景 4 | 4.5 | 缓存机制存在 | ✅ | - | ✅ |
| 场景 4 | 4.6 | 使用 setTopLevelField | ✅ | - | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
