# Settings 配置管理 — Skills 配置路由 人工验收清单（5/6）

**生成时间:** 2026-04-24
**关联计划:** spec-plan.md Task 6
**关联设计:** spec-design.md §Skills 模块

> 所有验收项均可自动化验证，无需人类参与。清单用于自动执行。

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 确认 Task 2 SkillService 已通过验收: `bun test src/__tests__/skill-service.test.ts`

---

## 验收项目

### 场景 6：Skills 配置路由

#### - [x] 6.1 Skills 路由文件存在且导出正确
- **来源:** spec-plan.md Task 6 检查步骤
- **目的:** 确认路由模块已创建
- **操作步骤:**
  1. [A] `grep -c "export default app" src/routes/web/config/skills.ts` → 期望精确: `1`

#### - [x] 6.2 6 个 action handler 函数完整
- **来源:** spec-plan.md Task 6 检查步骤
- **目的:** 确认 list/get/set/delete/enable/disable 全部实现
- **操作步骤:**
  1. [A] `grep "async function handle" src/routes/web/config/skills.ts` → 期望包含: `handleList`
  2. [A] `grep "async function handle" src/routes/web/config/skills.ts` → 期望包含: `handleGet`
  2. [A] `grep "async function handle" src/routes/web/config/skills.ts` → 期望包含: `handleSet`
  2. [A] `grep "async function handle" src/routes/web/config/skills.ts` → 期望包含: `handleDelete`
  2. [A] `grep "async function handle" src/routes/web/config/skills.ts` → 期望包含: `handleEnable`
  2. [A] `grep "async function handle" src/routes/web/config/skills.ts` → 期望包含: `handleDisable`

#### - [x] 6.3 Skills 路由单元测试全部通过
- **来源:** spec-plan.md Task 6 检查步骤
- **目的:** 验证 list/get/set/delete/enable/disable 及边界情况
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-skills.test.ts` → 期望包含: `all tests passed`

#### - [x] 6.4 Skills TypeScript 类型检查通过
- **来源:** spec-plan.md Task 6 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep "skills.ts" || echo "OK"` → 期望精确: `OK`

#### - [x] 6.5 Skills 路由调用 SkillService 而非 ConfigService
- **来源:** spec-design.md §Skills 模块 / spec-plan.md Task 6 执行步骤
- **目的:** 确认 Skills 通过文件系统操作而非读写 opencode.json
- **操作步骤:**
  1. [A] `grep "import" src/routes/web/config/skills.ts` → 期望包含: `services/skill`
  2. [A] `grep "import" src/routes/web/config/skills.ts | grep -c "services/config"` → 期望精确: `0`

#### - [x] 6.6 统一响应辅助函数存在
- **来源:** spec-plan.md Task 6 执行步骤 / spec-design.md §通用 API 规范
- **目的:** 确认 successResponse/errorResponse 格式一致
- **操作步骤:**
  1. [A] `grep "successResponse" src/routes/web/config/skills.ts` → 期望包含: `success: true`
  2. [A] `grep "errorResponse" src/routes/web/config/skills.ts` → 期望包含: `success: false`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 6 | 6.1 | Skills 路由导出正确 | ✅ | - | ✅ |
| 场景 6 | 6.2 | 6 个 action handler 完整 | ✅ | - | ✅ |
| 场景 6 | 6.3 | Skills 单元测试通过 | ✅ | - | ✅ |
| 场景 6 | 6.4 | Skills 类型检查通过 | ✅ | - | ✅ |
| 场景 6 | 6.5 | 调用 SkillService 非 ConfigService | ✅ | - | ✅ |
| 场景 6 | 6.6 | 统一响应辅助函数存在 | ✅ | - | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
