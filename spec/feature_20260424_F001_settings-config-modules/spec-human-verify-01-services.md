# Settings 配置管理 — 基础服务层 人工验收清单（1/6）

**生成时间:** 2026-04-24
**关联计划:** spec-plan.md Task 1-2
**关联设计:** spec-design.md §ConfigService / §SkillService

> 所有验收项均可自动化验证，无需人类参与。清单用于自动执行。

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查 Bun 运行时: `bun --version`
- [ ] [AUTO] 检查 TypeScript 工具链: `bunx tsc --version`
- [ ] [AUTO] 验证现有测试基准: `bun test src/__tests__/store.test.ts`

---

## 验收项目

### 场景 1：ConfigService 配置文件读写

#### - [x] 1.1 ConfigService 文件存在且导出正确
- **来源:** spec-plan.md Task 1 检查步骤
- **目的:** 确认核心服务文件已创建
- **操作步骤:**
  1. [A] `grep -c "export async function" src/services/config.ts` → 期望包含: `5`
  2. [A] `grep "CONFIG_PATH" src/services/config.ts` → 期望包含: `export const CONFIG_PATH`

#### - [x] 1.2 deepMerge 辅助函数存在
- **来源:** spec-plan.md Task 1 检查步骤
- **目的:** 确认深度合并逻辑已实现
- **操作步骤:**
  1. [A] `grep "deepMerge" src/services/config.ts` → 期望包含: `function deepMerge`

#### - [x] 1.3 ConfigService 单元测试全部通过
- **来源:** spec-plan.md Task 1 检查步骤
- **目的:** 验证配置读写、JSONC 解析、并发写入等核心能力
- **操作步骤:**
  1. [A] `bun test src/__tests__/config-service.test.ts` → 期望包含: `all tests passed`

#### - [x] 1.4 ConfigService TypeScript 类型检查通过
- **来源:** spec-plan.md Task 1 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep "config.ts" || echo "OK"` → 期望精确: `OK`

---

### 场景 2：SkillService 技能文件管理

#### - [x] 2.1 SkillService 文件存在且导出正确
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认技能管理服务已创建
- **操作步骤:**
  1. [A] `grep -c "export async function" src/services/skill.ts` → 期望包含: `6`
  2. [A] `grep "SKILLS_DIR" src/services/skill.ts` → 期望包含: `export const SKILLS_DIR`

#### - [x] 2.2 SkillService 类型定义完整
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认 SkillMeta/SkillInfo/SkillDetail 接口已定义
- **操作步骤:**
  1. [A] `grep "export interface Skill" src/services/skill.ts` → 期望包含: `SkillInfo`
  2. [A] `grep "export interface Skill" src/services/skill.ts` → 期望包含: `SkillDetail`

#### - [x] 2.3 SkillService 单元测试全部通过
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 验证 list/get/set/delete/enable/disable 及 frontmatter 解析
- **操作步骤:**
  1. [A] `bun test src/__tests__/skill-service.test.ts` → 期望包含: `all tests passed`

#### - [x] 2.4 SkillService TypeScript 类型检查通过
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep "skill.ts" || echo "OK"` → 期望精确: `OK`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | ConfigService 导出正确 | ✅ | - | ✅ |
| 场景 1 | 1.2 | deepMerge 函数存在 | ✅ | - | ✅ |
| 场景 1 | 1.3 | ConfigService 单元测试通过 | ✅ | - | ✅ |
| 场景 1 | 1.4 | ConfigService 类型检查通过 | ✅ | - | ✅ |
| 场景 2 | 2.1 | SkillService 导出正确 | ✅ | - | ✅ |
| 场景 2 | 2.2 | SkillService 类型定义完整 | ✅ | - | ✅ |
| 场景 2 | 2.3 | SkillService 单元测试通过 | ✅ | - | ✅ |
| 场景 2 | 2.4 | SkillService 类型检查通过 | ✅ | - | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
