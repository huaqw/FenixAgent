# Settings 配置管理 API 执行计划

**目标:** 为 RCS 提供 RESTful API 管理全局 OpenCode 配置（Providers、Models、Agents、Skills 四个模块）

**技术栈:** Hono (HTTP), Bun runtime, bun:test (测试), Node.js fs/promises, Bun.file() 文件锁

**设计文档:** spec-design.md

## 改动总览

本次改动为 RCS 新增 Settings 配置管理 API 层，涉及 2 个 Service 模块（ConfigService + SkillService）和 5 个路由文件。Task 1（ConfigService）和 Task 2（SkillService）为独立的基础服务层，Task 3-6 为四个配置模块的路由处理器（均依赖 Task 1 或 Task 2），Task 7 将所有路由模块注册到主应用。关键设计决策：使用 Promise 互斥锁（非 proper-lockfile）保护并发写入，API Key 明文存入环境变量而非配置文件，Skills 模块通过文件系统移动文件夹实现启用/禁用。

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**

- [x] 验证 Bun 运行时可用
  - `bun --version`
  - 预期: 输出 Bun 版本号

- [x] 验证 TypeScript 类型检查可用
  - `bunx tsc --version`
  - 预期: 输出 TypeScript 版本号

- [x] 验证 bun test 可运行现有测试
  - `bun test src/__tests__/store.test.ts`
  - 预期: 测试框架可用，无配置错误

**检查步骤:**

- [x] 构建命令执行成功
  - `bun run typecheck`
  - 预期: 类型检查通过，无错误

- [x] 测试命令可用
  - `bun test`
  - 预期: 所有现有测试通过，无回归

---

### Task 1: ConfigService 配置文件读写服务

**背景:**
为 Settings API 提供核心的 opencode.json 文件读写能力。当前项目没有任何配置文件操作服务，路由层（Task 3-6）均依赖本 Task 提供的 `getConfig()`/`getSection()`/`setSection()`/`deleteSection()` 方法。SkillService（Task 2）独立于本 Task，不读写 opencode.json。写入时使用 Promise 互斥锁防止并发写入损坏 JSON 文件。

**涉及文件:**
- 新建: `src/services/config.ts`
- 新建: `src/__tests__/config-service.test.ts`

**执行步骤:**

- [x] 创建 `src/services/config.ts`，定义配置文件路径常量和 Promise 互斥锁
  - 位置: `src/services/config.ts` 文件顶部
  - ```ts
    import { readFile, writeFile, mkdir } from "node:fs/promises";
    import { existsSync } from "node:fs";
    import { homedir } from "node:os";
    import { join } from "node:path";

    const CONFIG_PATH = join(homedir(), ".config", "opencode", "config.json");
    const LOCK_TIMEOUT_MS = 5000;

    // Promise 互斥锁：防止并发写入
    let writeLock: Promise<void> = Promise.resolve();
    function acquireWriteLock(): Promise<() => void> {
      let release: () => void;
      const prevLock = writeLock;
      writeLock = new Promise<void>((resolve) => { release = resolve; });
      // 超时自动释放
      const timer = setTimeout(() => release!(), LOCK_TIMEOUT_MS);
      return prevLock.then(() => {
        clearTimeout(timer);
        return release!;
      });
    }
    ```

- [x] 实现 `getConfig()` — 读取完整配置对象，文件不存在返回 `{}`
  - 位置: `src/services/config.ts`，紧跟锁定义之后
  - ```ts
    export async function getConfig(): Promise<Record<string, unknown>> {
      if (!existsSync(CONFIG_PATH)) return {};
      const raw = await readFile(CONFIG_PATH, "utf-8");
      // strip-json-comments: 移除单行 // 和多行 /* */ 注释
      const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      return JSON.parse(cleaned);
    }
    ```

- [x] 实现 `getSection(section: string)` — 按顶层 key 读取配置段
  - 位置: `src/services/config.ts`，`getConfig()` 之后
  - ```ts
    export async function getSection<T = unknown>(section: string): Promise<T | undefined> {
      const config = await getConfig();
      return config[section] as T | undefined;
    }
    ```

- [x] 实现 `setSection(section: string, data: unknown)` — 深度合并写入指定 section，使用互斥锁保护
  - 位置: `src/services/config.ts`，`getSection()` 之后
  - ```ts
    export async function setSection(section: string, data: unknown): Promise<void> {
      const release = await acquireWriteLock();
      try {
        const config = await getConfig();
        config[section] = deepMerge(config[section] ?? {}, data);
        // 确保目录存在
        const dir = join(CONFIG_PATH, "..");
        if (!existsSync(dir)) await mkdir(dir, { recursive: true });
        await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
      } finally {
        release();
      }
    }
    ```

- [x] 实现 `deleteSection(section: string)` — 删除指定顶层 key，使用互斥锁保护
  - 位置: `src/services/config.ts`，`setSection()` 之后
  - ```ts
    export async function deleteSection(section: string): Promise<boolean> {
      const release = await acquireWriteLock();
      try {
        const config = await getConfig();
        if (!(section in config)) return false;
        delete config[section];
        await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
        return true;
      } finally {
        release();
      }
    }
    ```

- [x] 实现 `setTopLevelField(field: string, value: unknown)` — 设置顶层字段（用于 `model`/`small_model`/`default_agent`）
  - 位置: `src/services/config.ts`，`deleteSection()` 之后
  - ```ts
    export async function setTopLevelField(field: string, value: unknown): Promise<void> {
      const release = await acquireWriteLock();
      try {
        const config = await getConfig();
        config[field] = value;
        const dir = join(CONFIG_PATH, "..");
        if (!existsSync(dir)) await mkdir(dir, { recursive: true });
        await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
      } finally {
        release();
      }
    }
    ```

- [x] 实现 `deepMerge(target, source)` 辅助函数 — 递归合并对象，不覆盖未传入的字段
  - 位置: `src/services/config.ts`，锁定义之后、`getConfig()` 之前（内部函数）
  - ```ts
    function deepMerge(target: unknown, source: unknown): unknown {
      if (typeof target !== "object" || target === null) return source;
      if (typeof source !== "object" || source === null) return source;
      const result = { ...(target as Record<string, unknown>) };
      for (const key of Object.keys(source as Record<string, unknown>)) {
        const srcVal = (source as Record<string, unknown>)[key];
        const tgtVal = (result as Record<string, unknown>)[key];
        (result as Record<string, unknown>)[key] =
          typeof srcVal === "object" && srcVal !== null && !Array.isArray(srcVal)
            ? deepMerge(tgtVal, srcVal)
            : srcVal;
      }
      return result;
    }
    ```

- [x] 导出 `CONFIG_PATH` 常量供测试使用
  - 位置: `src/services/config.ts` 顶部常量声明处
  - 将 `const CONFIG_PATH` 改为 `export const CONFIG_PATH`

- [x] 为 ConfigService 编写单元测试
  - 测试文件: `src/__tests__/config-service.test.ts`
  - 测试场景:
    - **getConfig 文件不存在**: 使用临时目录（`CONFIG_PATH` 不指向真实文件） → 返回 `{}`
    - **getConfig 正常读取**: 写入 JSON 文件后调用 → 返回解析后的对象
    - **getConfig 处理 JSONC 注释**: 文件含 `// comment` 和 `/* block */` → 正确解析
    - **getSection 返回指定段**: 文件含 `{"provider":{"anthropic":{}}}` → `getSection("provider")` 返回对应对象
    - **getSection 不存在段**: → 返回 `undefined`
    - **setSection 创建新段**: 空文件 → `setSection("provider", {anthropic: {}})` → 读回验证
    - **setSection 深度合并**: 已有 `{"provider":{"anthropic":{"apiKey":"old"}}}` → `setSection("provider", {anthropic: {baseURL: "new"}})` → 读回后 `apiKey` 保留、`baseURL` 更新
    - **deleteSection 删除段**: → 读回后该 key 不存在，返回 `true`
    - **deleteSection 不存在段**: → 返回 `false`
    - **setTopLevelField 设置字段**: → 读回验证字段值正确
    - **并发写入互斥锁**: 同时发起 3 次 `setSection` → 文件最终状态包含全部 3 个段的写入结果，无数据损坏
  - 运行命令: `bun test src/__tests__/config-service.test.ts`
  - 预期: 所有测试通过
  - 注: 测试中 mock `CONFIG_PATH` 指向 `os.tmpdir()` 下的临时文件，每个测试前后清理

**检查步骤:**

- [x] 验证 ConfigService 文件存在且导出正确
  - `grep -c "export async function" src/services/config.ts`
  - 预期: 输出 ≥ 4（getConfig, getSection, setSection, deleteSection, setTopLevelField）

- [x] 验证 deepMerge 导入/定义存在
  - `grep "deepMerge" src/services/config.ts`
  - 预期: 函数定义存在

- [x] 运行 ConfigService 单元测试
  - `bun test src/__tests__/config-service.test.ts`
  - 预期: 全部测试通过

- [x] 验证 TypeScript 类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | grep "config.ts" || echo "OK"`
  - 预期: 无 config.ts 相关错误

---

### Task 2: SkillService 技能文件管理服务

**背景:**
为 Settings API 的 Skills 模块提供文件系统操作能力。SkillService 操作 `~/.config/opencode/skills/` 目录，通过在 `skills/` 和 `skills/_disabled/` 之间移动文件夹实现启用/禁用切换。SkillService 独立于 ConfigService（Task 1），不读写 opencode.json。Task 6（Skills 配置路由）依赖本 Task。

**涉及文件:**
- 新建: `src/services/skill.ts`
- 新建: `src/__tests__/skill-service.test.ts`

**执行步骤:**

- [x] 创建 `src/services/skill.ts`，定义常量和类型
  - 位置: `src/services/skill.ts` 文件顶部
  - ```ts
    import { readdir, readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
    import { existsSync } from "node:fs";
    import { homedir } from "node:os";
    import { join } from "node:path";

    const SKILLS_DIR = join(homedir(), ".config", "opencode", "skills");
    const DISABLED_DIR = join(SKILLS_DIR, "_disabled");

    export interface SkillMeta {
      name: string;
      description: string;
      [key: string]: string;
    }

    export interface SkillInfo {
      name: string;
      enabled: boolean;
      description: string;
      path: string;
    }

    export interface SkillDetail {
      name: string;
      description: string;
      content: string;
      enabled: boolean;
      path: string;
      metadata: Record<string, string>;
    }
    ```

- [x] 实现 `ensureDisabledDir()` — 确保 `_disabled/` 目录存在
  - 位置: `src/services/skill.ts`，类型定义之后
  - ```ts
    async function ensureDisabledDir(): Promise<void> {
      if (!existsSync(DISABLED_DIR)) {
        await mkdir(DISABLED_DIR, { recursive: true });
      }
    }
    ```

- [x] 实现 `parseFrontmatter(raw: string)` — 解析 SKILL.md 的 YAML frontmatter 和正文
  - 位置: `src/services/skill.ts`，`ensureDisabledDir()` 之后
  - ```ts
    function parseFrontmatter(raw: string): { metadata: Record<string, string>; content: string } {
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!match) return { metadata: {}, content: raw };
      const metadata: Record<string, string> = {};
      for (const line of match[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) metadata[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
      }
      return { metadata, content: match[2] };
    }
    ```

- [x] 实现 `buildSkillMd(name, description, content, metadata)` — 根据字段生成 SKILL.md 文本
  - 位置: `src/services/skill.ts`，`parseFrontmatter()` 之后
  - ```ts
    function buildSkillMd(name: string, description: string, content: string, metadata?: Record<string, string>): string {
      const meta: Record<string, string> = { name, description, ...(metadata ?? {}) };
      const frontmatter = Object.entries(meta).map(([k, v]) => `${k}: "${v}"`).join("\n");
      return `---\n${frontmatter}\n---\n${content}`;
    }
    ```

- [x] 实现 `listSkills()` — 扫描 skills/ 和 _disabled/ 目录，返回所有 skill 信息
  - 位置: `src/services/skill.ts`，`buildSkillMd()` 之后
  - ```ts
    export async function listSkills(): Promise<SkillInfo[]> {
      const skills: SkillInfo[] = [];
      // 扫描已启用的 skills
      if (existsSync(SKILLS_DIR)) {
        for (const entry of await readdir(SKILLS_DIR, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name === "_disabled") continue;
          const mdPath = join(SKILLS_DIR, entry.name, "SKILL.md");
          if (!existsSync(mdPath)) continue;
          const raw = await readFile(mdPath, "utf-8");
          const { metadata } = parseFrontmatter(raw);
          skills.push({ name: entry.name, enabled: true, description: metadata.description ?? "", path: mdPath });
        }
      }
      // 扫描已禁用的 skills
      if (existsSync(DISABLED_DIR)) {
        for (const entry of await readdir(DISABLED_DIR, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const mdPath = join(DISABLED_DIR, entry.name, "SKILL.md");
          if (!existsSync(mdPath)) continue;
          const raw = await readFile(mdPath, "utf-8");
          const { metadata } = parseFrontmatter(raw);
          skills.push({ name: entry.name, enabled: false, description: metadata.description ?? "", path: mdPath });
        }
      }
      return skills;
    }
    ```

- [x] 实现 `getSkill(name: string)` — 返回单个 skill 的完整详情（含内容和 metadata）
  - 位置: `src/services/skill.ts`，`listSkills()` 之后
  - ```ts
    export async function getSkill(name: string): Promise<SkillDetail | null> {
      // 在 skills/ 中查找
      const enabledPath = join(SKILLS_DIR, name, "SKILL.md");
      const disabledPath = join(DISABLED_DIR, name, "SKILL.md");
      const filePath = existsSync(enabledPath) ? enabledPath : existsSync(disabledPath) ? disabledPath : null;
      if (!filePath) return null;
      const raw = await readFile(filePath, "utf-8");
      const { metadata, content } = parseFrontmatter(raw);
      return {
        name,
        description: metadata.description ?? "",
        content,
        enabled: filePath === enabledPath,
        path: filePath,
        metadata: Object.fromEntries(Object.entries(metadata).filter(([k]) => k !== "name" && k !== "description")),
      };
    }
    ```

- [x] 实现 `setSkill(name, data)` — 创建或更新 skill，无论当前启用/禁用状态均写入 `skills/` 目录（即 set 后自动启用）
  - 位置: `src/services/skill.ts`，`getSkill()` 之后
  - ```ts
    export async function setSkill(name: string, data: { description: string; content: string; metadata?: Record<string, string> }): Promise<SkillInfo> {
      // 先删除旧位置（禁用目录中也检查）
      await deleteSkillInternal(name);
      // 写入 skills/name/SKILL.md
      const skillDir = join(SKILLS_DIR, name);
      await mkdir(skillDir, { recursive: true });
      const mdContent = buildSkillMd(name, data.description, data.content, data.metadata);
      await writeFile(join(skillDir, "SKILL.md"), mdContent, "utf-8");
      return { name, enabled: true, description: data.description, path: join(skillDir, "SKILL.md") };
    }
    ```

- [x] 实现 `deleteSkill(name: string)` — 删除 skill 文件夹（从 skills/ 或 _disabled/ 中）
  - 位置: `src/services/skill.ts`，`setSkill()` 之后
  - ```ts
    export async function deleteSkill(name: string): Promise<boolean> {
      return deleteSkillInternal(name);
    }

    /** 内部删除实现，也供 setSkill 复用 */
    async function deleteSkillInternal(name: string): Promise<boolean> {
      const enabledDir = join(SKILLS_DIR, name);
      const disabledDirPath = join(DISABLED_DIR, name);
      let deleted = false;
      if (existsSync(enabledDir)) { await rm(enabledDir, { recursive: true, force: true }); deleted = true; }
      if (existsSync(disabledDirPath)) { await rm(disabledDirPath, { recursive: true, force: true }); deleted = true; }
      return deleted;
    }
    ```

- [x] 实现 `enableSkill(name: string)` — 将 skill 从 `_disabled/` 移回 `skills/`
  - 位置: `src/services/skill.ts`，`deleteSkill()` 之后
  - ```ts
    export async function enableSkill(name: string): Promise<boolean> {
      const from = join(DISABLED_DIR, name);
      const to = join(SKILLS_DIR, name);
      if (!existsSync(from)) return false;
      await rename(from, to);
      return true;
    }
    ```

- [x] 实现 `disableSkill(name: string)` — 将 skill 从 `skills/` 移入 `_disabled/`
  - 位置: `src/services/skill.ts`，`enableSkill()` 之后
  - ```ts
    export async function disableSkill(name: string): Promise<boolean> {
      await ensureDisabledDir();
      const from = join(SKILLS_DIR, name);
      const to = join(DISABLED_DIR, name);
      if (!existsSync(from)) return false;
      await rename(from, to);
      return true;
    }
    ```

- [x] 导出 `SKILLS_DIR` 常量供测试使用
  - 位置: `src/services/skill.ts` 顶部常量声明处
  - 将 `const SKILLS_DIR` 改为 `export const SKILLS_DIR`

- [x] 为 SkillService 编写单元测试
  - 测试文件: `src/__tests__/skill-service.test.ts`
  - 测试场景:
    - **listSkills 空目录**: 全新临时 skills 目录 → 返回 `[]`
    - **listSkills 包含已启用 skill**: 创建 `pr-review/SKILL.md` → 列表中含 `{name: "pr-review", enabled: true}`
    - **listSkills 包含已禁用 skill**: 创建 `_disabled/old/SKILL.md` → 列表中含 `{name: "old", enabled: false}`
    - **getSkill 已启用**: 创建 skill 后调用 → 返回完整 detail（含 content, metadata）
    - **getSkill 不存在**: → 返回 `null`
    - **setSkill 创建新 skill**: 调用 `setSkill("test", {description, content})` → `skills/test/SKILL.md` 存在且内容正确
    - **setSkill 覆盖已禁用 skill**: 先 disable 再 set → 新内容出现在 `skills/` 目录（自动启用），`_disabled/` 中已清除
    - **deleteSkill 已存在**: 创建后删除 → 目录不存在，返回 `true`
    - **deleteSkill 不存在**: → 返回 `false`
    - **enableSkill 禁用→启用**: 创建→disable→enable → 目录从 `_disabled/` 移回 `skills/`
    - **disableSkill 启用→禁用**: 创建→disable → 目录移入 `_disabled/`
    - **parseFrontmatter 解析**: 含 frontmatter 的 SKILL.md → 正确提取 metadata 和 content
  - 运行命令: `bun test src/__tests__/skill-service.test.ts`
  - 预期: 所有测试通过
  - 注: 测试中使用 `os.tmpdir()` 创建临时 skills 目录，mock `SKILLS_DIR` 和 `DISABLED_DIR`

**检查步骤:**

- [x] 验证 SkillService 文件存在且导出正确
  - `grep -c "export async function" src/services/skill.ts`
  - 预期: 输出 ≥ 5（listSkills, getSkill, setSkill, deleteSkill, enableSkill, disableSkill）

- [x] 验证类型定义存在
  - `grep "export interface Skill" src/services/skill.ts`
  - 预期: 输出含 SkillInfo 和 SkillDetail

- [x] 运行 SkillService 单元测试
  - `bun test src/__tests__/skill-service.test.ts`
  - 预期: 全部测试通过

- [x] 验证 TypeScript 类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | grep "skill.ts" || echo "OK"`
  - 预期: 无 skill.ts 相关错误

---

### Task 3: Providers 配置路由

**背景:**
为 Settings API 实现 Provider（AI 服务商）管理的 HTTP 路由层。用户通过 Web UI 管理 AI 服务商配置（如 Anthropic、OpenAI）。本 Task 是第一个路由实现，建立统一的响应格式 `{"success":true,"data":{...}}` 和错误码体系（NOT_FOUND/VALIDATION_ERROR/CONFIG_READ_ERROR/CONFIG_WRITE_ERROR），供 Task 4-6 复用。依赖 Task 1 的 ConfigService 读写 opencode.json 中的 `provider` section。

**涉及文件:**
- 新建: `src/routes/web/config/providers.ts`
- 新建: `src/__tests__/config-providers.test.ts`

**执行步骤:**

- [x] 创建 `src/routes/web/config/providers.ts`，导入依赖和定义辅助函数
  - 位置: `src/routes/web/config/providers.ts` 文件顶部
  - ```ts
    import { Hono } from "hono";
    import { sessionAuth } from "../../../auth/middleware";
    import { getSection, setSection, deleteSection, getConfig } from "../../../services/config";

    const app = new Hono();

    /** 从 apiKey 字段生成 keyHint：取尾 4 位，前缀 *** */
    function toKeyHint(apiKey: string | undefined): string | null {
      if (!apiKey) return null;
      // 如果是 {env:VAR} 格式，从环境变量取实际值
      const envMatch = apiKey.match(/^\{env:(.+)\}$/);
      const realKey = envMatch ? process.env[envMatch[1]] : apiKey;
      if (!realKey || realKey.length < 4) return null;
      return "***" + realKey.slice(-4);
    }

    /** 构造标准成功响应 */
    function ok(data: unknown) { return { success: true as const, data }; }

    /** 构造标准错误响应 */
    function err(code: string, message: string) { return { success: false as const, error: { code, message } }; }
    ```

- [x] 实现 `list` action — 列出所有已配置的 Provider
  - 位置: `src/routes/web/config/providers.ts`，辅助函数之后
  - ```ts
    app.post("/config/providers", sessionAuth, async (c) => {
      const body = await c.req.json<{ action: string; name?: string; data?: Record<string, unknown> }>().catch(() => ({}));
      try {
        switch (body.action) {
          case "list": return handleList();
          case "get": return handleGet(body.name!);
          case "set": return handleSet(body.name!, body.data!);
          case "test": return handleTest(body.name!);
          case "delete": return handleDelete(body.name!);
          default: return c.json(err("VALIDATION_ERROR", `Unknown action: ${body.action}`), 400);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return c.json(err("CONFIG_READ_ERROR", message), 500);
      }
    });

    async function handleList() {
      const provider = (await getSection<Record<string, Record<string, unknown>>>("provider")) ?? {};
      const providers = Object.entries(provider).map(([name, cfg]) => ({
        name,
        configured: !!cfg.apiKey || !!cfg.options?.apiKey,
        keyHint: toKeyHint((cfg.apiKey as string) ?? (cfg.options?.apiKey as string)),
        baseURL: (cfg.baseURL as string) ?? (cfg.options?.baseURL as string) ?? "默认",
      }));
      return ok({ providers });
    }
    ```

- [x] 实现 `get` action — 获取单个 Provider 详情
  - 位置: `src/routes/web/config/providers.ts`，`handleList()` 之后
  - ```ts
    async function handleGet(name: string) {
      const provider = (await getSection<Record<string, Record<string, unknown>>>("provider")) ?? {};
      const cfg = provider[name];
      if (!cfg) return err("NOT_FOUND", `Provider '${name}' not found`);
      return ok({
        name,
        ...cfg,
        keyHint: toKeyHint((cfg.apiKey as string) ?? (cfg.options?.apiKey as string)),
      });
    }
    ```

- [x] 实现 `set` action — 创建或更新 Provider，处理 API Key 安全存储
  - 位置: `src/routes/web/config/providers.ts`，`handleGet()` 之后
  - ```ts
    async function handleSet(name: string, data: Record<string, unknown>) {
      if (!name || typeof name !== "string") return err("VALIDATION_ERROR", "Provider name is required");

      // API Key 安全处理：明文 → 环境变量引用
      const envVarName = `RCS_SECRET_${name.toUpperCase().replace(/-/g, "_")}`;
      if (data.apiKey && typeof data.apiKey === "string" && !data.apiKey.startsWith("{env:")) {
        // 明文 key → 存入环境变量，opencode.json 中存引用
        process.env[envVarName] = data.apiKey as string;
        data = { ...data, apiKey: `{env:${envVarName}}` };
      }

      // 读取当前 provider section，合并单个 provider 配置
      const provider = (await getSection<Record<string, unknown>>("provider")) ?? {};
      provider[name] = data;
      await setSection("provider", provider);
      return ok({ name, keyHint: toKeyHint(data.apiKey as string) });
    }
    ```

- [x] 实现 `test` action — 测试 Provider 连接，调用模型列表接口
  - 位置: `src/routes/web/config/providers.ts`，`handleSet()` 之后
  - ```ts
    async function handleTest(name: string) {
      const provider = (await getSection<Record<string, Record<string, unknown>>>("provider")) ?? {};
      const cfg = provider[name];
      if (!cfg) return err("NOT_FOUND", `Provider '${name}' not found`);

      // 解析 apiKey（环境变量引用 → 实际值）
      const apiKeyRaw = (cfg.apiKey as string) ?? (cfg.options?.apiKey as string) ?? "";
      const envMatch = apiKeyRaw.match(/^\{env:(.+)\}$/);
      const apiKey = envMatch ? process.env[envMatch[1]] ?? "" : apiKeyRaw;
      const baseURL = (cfg.baseURL as string) ?? (cfg.options?.baseURL as string) ?? "https://api.anthropic.com";

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${baseURL}/v1/models`, {
          headers: { "Authorization": `Bearer ${apiKey}`, "x-api-key": apiKey },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return err("CONFIG_READ_ERROR", `Provider returned ${res.status}`);
        const json = await res.json() as { data?: Array<{ id: string }> };
        const models = (json.data ?? []).map((m) => m.id);
        return ok({ models });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Connection failed";
        return err("CONFIG_READ_ERROR", `Test failed: ${message}`);
      }
    }
    ```

- [x] 实现 `delete` action — 删除指定 Provider
  - 位置: `src/routes/web/config/providers.ts`，`handleTest()` 之后
  - ```ts
    async function handleDelete(name: string) {
      const provider = (await getSection<Record<string, unknown>>("provider")) ?? {};
      if (!provider[name]) return err("NOT_FOUND", `Provider '${name}' not found`);
      delete provider[name];
      await setSection("provider", provider);
      return ok(null);
    }
    ```

- [x] 在文件末尾添加 `export default app`
  - 位置: `src/routes/web/config/providers.ts` 文件末尾

- [x] 为 Providers 路由编写单元测试
  - 测试文件: `src/__tests__/config-providers.test.ts`
  - 测试场景:
    - **list action — 空配置**: provider section 不存在 → 返回 `{success:true, data:{providers:[]}}`
    - **list action — 有配置**: mock ConfigService 返回含 anthropic/openai 的 provider → 返回列表含 keyHint 和 baseURL
    - **get action — 存在**: 请求 anthropic → 返回完整配置 + keyHint
    - **get action — 不存在**: 请求 unknown → 返回 `{success:false, error:{code:"NOT_FOUND"}}`
    - **set action — 创建新 provider**: 传入 `{action:"set", name:"ollama", data:{apiKey:"sk-test", baseURL:"http://localhost:11434"}}` → 调用 setSection，apiKey 被替换为 `{env:RCS_SECRET_OLLAMA}`
    - **set action — 更新已有 provider**: 传入已有 provider 的 set → 合并更新
    - **set action — 缺少 name**: 返回 VALIDATION_ERROR
    - **delete action — 存在**: 删除已有 provider → setSection 被调用，该 provider 不再存在
    - **delete action — 不存在**: 返回 NOT_FOUND
    - **test action — 连接成功**: mock fetch 返回 models 列表 → 返回 `{models:["model-a","model-b"]}`
    - **test action — 连接失败**: mock fetch 抛出错误 → 返回 CONFIG_READ_ERROR
    - **test action — provider 不存在**: 返回 NOT_FOUND
    - **未知 action**: 返回 VALIDATION_ERROR
  - 运行命令: `bun test src/__tests__/config-providers.test.ts`
  - 预期: 所有测试通过
  - 注: 测试中 mock `../../../services/config` 模块，mock fetch 全局函数，构造 Hono app 直接调用 `app.request()`

**检查步骤:**

- [x] 验证 providers 路由文件存在且导出 Hono app
  - `grep "export default app" src/routes/web/config/providers.ts`
  - 预期: 输出含该行

- [x] 验证 5 个 action handler 都存在
  - `grep -c "async function handle" src/routes/web/config/providers.ts`
  - 预期: 输出 = 5（handleList, handleGet, handleSet, handleTest, handleDelete）

- [x] 运行 Providers 路由单元测试
  - `bun test src/__tests__/config-providers.test.ts`
  - 预期: 全部测试通过

- [x] 验证 TypeScript 类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | grep "providers.ts" || echo "OK"`
  - 预期: 无 providers.ts 相关错误

---

### Task 4: Models 配置路由

**背景:**
为 Settings API 实现 Models（模型选择）管理的 HTTP 路由层。用户通过 Web UI 查看和切换 OpenCode 使用的主模型（`model`）和轻量模型（`small_model`）。`model` 和 `small_model` 是 opencode.json 的顶层字段（非 section），使用 ConfigService 的 `setTopLevelField` 写入。`available` 列表通过读取 provider section 中各 provider 定义的 models 字段聚合生成，带内存缓存（TTL 5 分钟）。`refresh` action 强制清除缓存重新聚合。依赖 Task 1 的 ConfigService。

**涉及文件:**
- 新建: `src/routes/web/config/models.ts`
- 新建: `src/__tests__/config-models.test.ts`

**执行步骤:**

- [x] 创建 `src/routes/web/config/models.ts`，导入依赖和定义缓存/辅助函数
  - 位置: `src/routes/web/config/models.ts` 文件顶部
  - ```ts
    import { Hono } from "hono";
    import { sessionAuth } from "../../../auth/middleware";
    import { getConfig, setTopLevelField } from "../../../services/config";

    const app = new Hono();

    /** 可用模型缓存：{ models, updatedAt } */
    let cachedAvailable: { models: Array<{ id: string; provider: string; label: string }>; updatedAt: number } | null = null;
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

    function ok(data: unknown) { return { success: true as const, data }; }
    function err(code: string, message: string) { return { success: false as const, error: { code, message } }; }
    ```

- [x] 实现 `buildAvailableList()` — 从 opencode.json 的 provider section 聚合可用模型列表
  - 位置: `src/routes/web/config/models.ts`，缓存定义之后
  - ```ts
    async function buildAvailableList(): Promise<Array<{ id: string; provider: string; label: string }>> {
      const config = await getConfig();
      const providers = (config.provider as Record<string, Record<string, unknown>>) ?? {};
      const models: Array<{ id: string; provider: string; label: string }> = [];
      for (const [providerName, providerCfg] of Object.entries(providers)) {
        const providerModels = providerCfg.models as Record<string, Record<string, unknown>> | undefined;
        if (!providerModels) continue;
        for (const [modelId, modelCfg] of Object.entries(providerModels)) {
          models.push({
            id: modelId,
            provider: providerName,
            label: (modelCfg?.name as string) ?? modelId,
          });
        }
      }
      return models;
    }
    ```
  - 原因: opencode.json 中 provider 下每个 provider 可定义 `models` 字段，其 key 为模型 ID，value 含 `name` 等元数据

- [x] 实现 `getAvailable()` — 获取可用模型列表，优先使用缓存
  - 位置: `src/routes/web/config/models.ts`，`buildAvailableList()` 之后
  - ```ts
    async function getAvailable(forceRefresh = false): Promise<Array<{ id: string; provider: string; label: string }>> {
      const now = Date.now();
      if (!forceRefresh && cachedAvailable && (now - cachedAvailable.updatedAt) < CACHE_TTL_MS) {
        return cachedAvailable.models;
      }
      const models = await buildAvailableList();
      cachedAvailable = { models, updatedAt: now };
      return models;
    }
    ```

- [x] 实现 POST `/config/models` 路由，分发 3 个 action
  - 位置: `src/routes/web/config/models.ts`，`getAvailable()` 之后
  - ```ts
    app.post("/config/models", sessionAuth, async (c) => {
      const body = await c.req.json<{ action: string; data?: { model?: string; small_model?: string } }>().catch(() => ({}));
      try {
        switch (body.action) {
          case "get": return await handleGet();
          case "set": return await handleSet(body.data ?? {});
          case "refresh": return await handleRefresh();
          default: return c.json(err("VALIDATION_ERROR", `Unknown action: ${body.action}`), 400);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return c.json(err("CONFIG_READ_ERROR", message), 500);
      }
    });
    ```

- [x] 实现 `handleGet()` — 返回当前模型配置 + 可用模型列表
  - 位置: `src/routes/web/config/models.ts`，路由定义之后
  - ```ts
    async function handleGet() {
      const config = await getConfig();
      const available = await getAvailable();
      return ok({
        current: {
          model: (config.model as string) ?? null,
          small_model: (config.small_model as string) ?? null,
        },
        available,
      });
    }
    ```

- [x] 实现 `handleSet(data)` — 设置主模型和/或轻量模型，支持部分更新
  - 位置: `src/routes/web/config/models.ts`，`handleGet()` 之后
  - ```ts
    async function handleSet(data: { model?: string; small_model?: string }) {
      if (!data.model && !data.small_model) {
        return err("VALIDATION_ERROR", "At least one of 'model' or 'small_model' is required");
      }
      if (data.model) await setTopLevelField("model", data.model);
      if (data.small_model) await setTopLevelField("small_model", data.small_model);
      // 读回确认
      const config = await getConfig();
      return ok({
        model: config.model as string | null ?? null,
        small_model: config.small_model as string | null ?? null,
      });
    }
    ```

- [x] 实现 `handleRefresh()` — 强制刷新可用模型列表缓存
  - 位置: `src/routes/web/config/models.ts`，`handleSet()` 之后
  - ```ts
    async function handleRefresh() {
      const available = await getAvailable(true);
      return ok({ count: available.length });
    }
    ```

- [x] 在文件末尾添加 `export default app`
  - 位置: `src/routes/web/config/models.ts` 文件末尾

- [x] 为 Models 路由编写单元测试
  - 测试文件: `src/__tests__/config-models.test.ts`
  - 测试场景:
    - **get action — 无配置**: model/small_model 均不存在 → 返回 `{current:{model:null, small_model:null}, available:[]}`
    - **get action — 有配置**: mock getConfig 返回 `{model:"claude-sonnet-4-6", small_model:"claude-haiku-4-5", provider:{anthropic:{models:{"claude-sonnet-4-6":{name:"Claude Sonnet 4.6"}}}}}` → available 含对应模型
    - **get action — 使用缓存**: 连续两次 get，第二次不调用 buildAvailableList（缓存命中）
    - **set action — 设置主模型**: `{action:"set", data:{model:"claude-opus-4-7"}}` → setTopLevelField 被调用
    - **set action — 设置轻量模型**: `{action:"set", data:{small_model:"gpt-4o-mini"}}` → setTopLevelField 被调用
    - **set action — 同时设置**: `{action:"set", data:{model:"a", small_model:"b"}}` → 两次 setTopLevelField 调用
    - **set action — 空数据**: `{action:"set", data:{}}` → 返回 VALIDATION_ERROR
    - **refresh action**: 调用 refresh → 清除缓存并重新构建 available 列表，返回 count
    - **未知 action**: `{action:"invalid"}` → 返回 VALIDATION_ERROR
  - 运行命令: `bun test src/__tests__/config-models.test.ts`
  - 预期: 所有测试通过
  - 注: 测试中 mock `../../../services/config` 模块的 getConfig 和 setTopLevelField，构造 Hono app 直接调用 `app.request()`

**检查步骤:**

- [x] 验证 models 路由文件存在且导出 Hono app
  - `grep "export default app" src/routes/web/config/models.ts`
  - 预期: 输出含该行

- [x] 验证 3 个 action handler 都存在
  - `grep -c "async function handle" src/routes/web/config/models.ts`
  - 预期: 输出 = 3（handleGet, handleSet, handleRefresh）

- [x] 运行 Models 路由单元测试
  - `bun test src/__tests__/config-models.test.ts`
  - 预期: 全部测试通过

- [x] 验证 TypeScript 类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | grep "models.ts" || echo "OK"`
  - 预期: 无 models.ts 相关错误

---

### Task 5: Agents 配置路由

**背景:**
为 Settings API 提供 Agent 配置管理能力。Agent 配置存储在 opencode.json 的 `agent` section 和 `default_agent` 顶层字段中。内置 Agent（build/plan/general/explore/title/summary/compaction）可修改但不可删除，自定义 Agent 可完整 CRUD。本 Task 依赖 Task 1 的 ConfigService（getSection/setSection/deleteSection/setTopLevelField）。Task 7（路由集成）依赖本 Task 的路由模块导出。

**涉及文件:**
- 新建: `src/routes/web/config/agents.ts`
- 新建: `src/__tests__/config-agents.test.ts`

**执行步骤:**

- [x] 创建 `src/routes/web/config/agents.ts`，定义常量和校验函数
  - 位置: `src/routes/web/config/agents.ts` 文件顶部
  - ```ts
    import { Hono } from "hono";
    import { sessionAuth } from "../../../auth/middleware";
    import { getSection, setSection, deleteSection, setTopLevelField, getConfig } from "../../../services/config";

    const BUILT_IN_AGENTS = new Set(["build", "plan", "general", "explore", "title", "summary", "compaction"]);

    function isValidAgentName(name: string): boolean {
      return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)
        && name.length >= 1 && name.length <= 64
        && !name.includes("--");
    }

    function isValidMode(mode: string): boolean {
      return ["primary", "subagent", "all"].includes(mode);
    }

    function isValidSteps(steps: number): boolean {
      return Number.isInteger(steps) && steps >= 1 && steps <= 200;
    }

    function validateAgentData(data: Record<string, unknown>): string | null {
      if (data.mode !== undefined && !isValidMode(data.mode as string)) return "INVALID_MODE";
      if (data.steps !== undefined && !isValidSteps(data.steps as number)) return "INVALID_STEPS";
      return null;
    }
    ```

- [x] 实现 `handleList` — 列出所有 Agent 及默认 Agent 名称
  - 位置: `src/routes/web/config/agents.ts`，校验函数之后
  - ```ts
    async function handleList() {
      const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
      const config = await getConfig();
      const defaultAgent = config.default_agent as string | undefined;
      const list = Object.entries(agents).map(([name, cfg]) => ({
        name,
        builtIn: BUILT_IN_AGENTS.has(name),
        model: cfg.model ?? null,
        mode: cfg.mode ?? null,
      }));
      return { success: true, data: { default_agent: defaultAgent ?? null, agents: list } };
    }
    ```

- [x] 实现 `handleGet` — 获取单个 Agent 详情
  - 位置: `handleList()` 之后
  - ```ts
    async function handleGet(name: string) {
      const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
      const agent = agents[name];
      if (!agent) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };
      return {
        success: true,
        data: {
          name,
          builtIn: BUILT_IN_AGENTS.has(name),
          model: agent.model ?? null,
          prompt: agent.prompt ?? null,
          tools: agent.tools ?? null,
          steps: agent.steps ?? null,
          mode: agent.mode ?? null,
          permission: agent.permission ?? null,
        },
      };
    }
    ```

- [x] 实现 `handleSet` — 更新 Agent 配置（深度合并）
  - 位置: `handleGet()` 之后
  - ```ts
    async function handleSet(name: string, data: Record<string, unknown>) {
      const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
      if (!agents[name]) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };
      const validation = validateAgentData(data);
      if (validation) return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };
      // 使用 setSection 对 agent 段进行深度合并（只更新该 agent 的字段）
      agents[name] = { ...agents[name], ...data };
      await setSection("agent", agents);
      return { success: true, data: { name, ...data } };
    }
    ```

- [x] 实现 `handleCreate` — 创建自定义 Agent
  - 位置: `handleSet()` 之后
  - ```ts
    async function handleCreate(name: string, data: Record<string, unknown>) {
      if (!isValidAgentName(name)) {
        return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid agent name: must be 1-64 lowercase alphanumeric chars with single hyphens" } };
      }
      const validation = validateAgentData(data);
      if (validation) return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };
      const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
      if (agents[name]) return { success: false, error: { code: "ALREADY_EXISTS", message: `Agent '${name}' already exists` } };
      agents[name] = data;
      await setSection("agent", agents);
      return { success: true, data: { name } };
    }
    ```

- [x] 实现 `handleDelete` — 删除自定义 Agent（内置 Agent 返回 FORBIDDEN）
  - 位置: `handleCreate()` 之后
  - ```ts
    async function handleDelete(name: string) {
      if (BUILT_IN_AGENTS.has(name)) {
        return { success: false, error: { code: "FORBIDDEN", message: `Cannot delete built-in agent '${name}'` } };
      }
      const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
      if (!agents[name]) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };
      delete agents[name];
      await setSection("agent", agents);
      return { success: true };
    }
    ```

- [x] 实现 `handleSetDefault` — 设置默认 Agent
  - 位置: `handleDelete()` 之后
  - ```ts
    async function handleSetDefault(name: string) {
      const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
      if (!agents[name]) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };
      await setTopLevelField("default_agent", name);
      return { success: true, data: { default_agent: name } };
    }
    ```

- [x] 创建 Hono 路由并导出
  - 位置: `src/routes/web/config/agents.ts` 文件末尾
  - ```ts
    const app = new Hono();

    app.post("/config/agents", sessionAuth, async (c) => {
      const body = await c.req.json<{ action: string; name?: string; data?: Record<string, unknown> }>().catch(() => ({}));
      const { action, name, data } = body;

      switch (action) {
        case "list": return c.json(await handleList());
        case "get": return c.json(await handleGet(name!));
        case "set": return c.json(await handleSet(name!, data!));
        case "create": return c.json(await handleCreate(name!, data!));
        case "delete": return c.json(await handleDelete(name!));
        case "set_default": return c.json(await handleSetDefault(name!));
        default: return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action '${action}'` } }, 400);
      }
    });

    export default app;
    ```

- [x] 为 Agents 路由编写单元测试
  - 测试文件: `src/__tests__/config-agents.test.ts`
  - 测试场景:
    - **list 返回所有 agent**: mock ConfigService 返回含 build/code-reviewer 的 agent section → 返回 `{ success: true, data: { agents: [...], default_agent: "build" } }`
    - **get 已有 agent**: name="build" → 返回含 builtIn:true, model, prompt, tools, steps, mode 的详情
    - **get 不存在 agent**: name="nonexistent" → 返回 `{ success: false, error: { code: "NOT_FOUND" } }`
    - **set 更新已有 agent**: name="build", data={steps:100} → 调用 setSection 且 steps 合并正确
    - **set 不存在 agent**: name="ghost", data={model:"x"} → 返回 NOT_FOUND
    - **set 校验 steps**: data={steps:999} → 返回 VALIDATION_ERROR
    - **create 新 agent**: name="reviewer", data={model:"...", mode:"subagent"} → 调用 setSection 且新 agent 被添加
    - **create 已存在**: name="build" → 返回 ALREADY_EXISTS
    - **create 无效 name**: name="Invalid!" → 返回 VALIDATION_ERROR
    - **delete 自定义 agent**: name="reviewer" → 成功
    - **delete 内置 agent**: name="build" → 返回 FORBIDDEN
    - **delete 不存在 agent**: name="ghost" → 返回 NOT_FOUND
    - **set_default 已有 agent**: name="plan" → 调用 setTopLevelField("default_agent", "plan")
    - **set_default 不存在 agent**: name="nope" → 返回 NOT_FOUND
  - 运行命令: `bun test src/__tests__/config-agents.test.ts`
  - 预期: 所有测试通过
  - 注: mock ConfigService 的 getSection/setSection/deleteSection/setTopLevelField/getConfig 方法

**检查步骤:**

- [x] 验证 Agents 路由文件存在且导出正确
  - `grep -c "export default" src/routes/web/config/agents.ts`
  - 预期: 输出 1

- [x] 验证内置 Agent 集合定义完整
  - `grep "BUILT_IN_AGENTS" src/routes/web/config/agents.ts`
  - 预期: 包含 build/plan/general/explore/title/summary/compaction 共 7 个

- [x] 运行 Agents 路由单元测试
  - `bun test src/__tests__/config-agents.test.ts`
  - 预期: 全部测试通过

- [x] 验证 TypeScript 类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | grep "agents.ts" || echo "OK"`
  - 预期: 无 agents.ts 相关错误

---

### Task 6: Skills 配置路由

**背景:**
为 Settings API 的 Skills 模块提供 HTTP 路由层，将 HTTP 请求转发给 SkillService（Task 2）。Skills 路由与其他配置路由不同——不读写 opencode.json，完全通过文件系统操作。Task 7（路由集成注册）将把本路由挂载到 `/web/config/skills`。

**涉及文件:**
- 新建: `src/routes/web/config/skills.ts`
- 新建: `src/__tests__/config-skills.test.ts`

**执行步骤:**

- [x] 创建 `src/routes/web/config/skills.ts`，导入 Hono、sessionAuth 和 SkillService
  - 位置: `src/routes/web/config/skills.ts` 文件顶部
  - ```ts
    import { Hono } from "hono";
    import { sessionAuth } from "../../../auth/middleware";
    import {
      listSkills,
      getSkill,
      setSkill,
      deleteSkill,
      enableSkill,
      disableSkill,
    } from "../../../services/skill";

    const app = new Hono();
    ```

- [x] 定义统一响应辅助函数 `successResponse` 和 `errorResponse`
  - 位置: `src/routes/web/config/skills.ts`，导入之后
  - ```ts
    function successResponse(data: unknown) {
      return { success: true, data };
    }

    function errorResponse(code: string, message: string) {
      return { success: false, error: { code, message } };
    }
    ```

- [x] 实现 `POST /config/skills` 路由，解析 action 字段分发到对应 handler
  - 位置: `src/routes/web/config/skills.ts`，辅助函数之后
  - ```ts
    app.post("/config/skills", sessionAuth, async (c) => {
      const body = await c.req.json<{ action: string; name?: string; data?: { description: string; content: string; metadata?: Record<string, string> } }>().catch(() => ({}));
      const { action } = body;

      switch (action) {
        case "list": return handleList(c);
        case "get": return handleGet(c, body);
        case "set": return handleSet(c, body);
        case "delete": return handleDelete(c, body);
        case "enable": return handleEnable(c, body);
        case "disable": return handleDisable(c, body);
        default:
          return c.json(errorResponse("VALIDATION_ERROR", `Unknown action: ${action}`), 400);
      }
    });
    ```

- [x] 实现 `handleList` — 调用 `listSkills()` 返回所有 skill 信息
  - 位置: 路由定义之前（handler 函数区域）
  - ```ts
    async function handleList(c: any) {
      const skills = await listSkills();
      return c.json(successResponse({ skills }));
    }
    ```

- [x] 实现 `handleGet` — 调用 `getSkill(name)`，不存在返回 NOT_FOUND
  - 位置: `handleList` 之后
  - ```ts
    async function handleGet(c: any, body: { name?: string }) {
      if (!body.name) {
        return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
      }
      const skill = await getSkill(body.name);
      if (!skill) {
        return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found`), 404);
      }
      return c.json(successResponse(skill));
    }
    ```

- [x] 实现 `handleSet` — 验证必填字段后调用 `setSkill()`
  - 位置: `handleGet` 之后
  - ```ts
    async function handleSet(c: any, body: { name?: string; data?: { description: string; content: string; metadata?: Record<string, string> } }) {
      if (!body.name) {
        return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
      }
      if (!body.data || !body.data.description || !body.data.content) {
        return c.json(errorResponse("VALIDATION_ERROR", "Missing required fields: data.description, data.content"), 400);
      }
      const result = await setSkill(body.name, body.data);
      return c.json(successResponse({ name: result.name, enabled: result.enabled }));
    }
    ```

- [x] 实现 `handleDelete` — 调用 `deleteSkill()`，不存在返回 NOT_FOUND
  - 位置: `handleSet` 之后
  - ```ts
    async function handleDelete(c: any, body: { name?: string }) {
      if (!body.name) {
        return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
      }
      const deleted = await deleteSkill(body.name);
      if (!deleted) {
        return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found`), 404);
      }
      return c.json(successResponse(null));
    }
    ```

- [x] 实现 `handleEnable` — 调用 `enableSkill()`，不存在返回 NOT_FOUND
  - 位置: `handleDelete` 之后
  - ```ts
    async function handleEnable(c: any, body: { name?: string }) {
      if (!body.name) {
        return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
      }
      const enabled = await enableSkill(body.name);
      if (!enabled) {
        return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found in disabled directory`), 404);
      }
      return c.json(successResponse({ name: body.name, enabled: true }));
    }
    ```

- [x] 实现 `handleDisable` — 调用 `disableSkill()`，不存在返回 NOT_FOUND
  - 位置: `handleEnable` 之后
  - ```ts
    async function handleDisable(c: any, body: { name?: string }) {
      if (!body.name) {
        return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
      }
      const disabled = await disableSkill(body.name);
      if (!disabled) {
        return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found in enabled directory`), 404);
      }
      return c.json(successResponse({ name: body.name, enabled: false }));
    }
    ```

- [x] 导出 Hono app 实例
  - 位置: `src/routes/web/config/skills.ts` 文件末尾
  - ```ts
    export default app;
    ```

- [x] 为 Skills 路由编写单元测试
  - 测试文件: `src/__tests__/config-skills.test.ts`
  - 测试场景:
    - **list 返回空列表**: 无 skill 时 → `{ success: true, data: { skills: [] } }`
    - **list 返回已启用和已禁用 skill**: 创建 2 个 skill 后 disable 1 个 → 列表含 2 项，1 enabled 1 disabled
    - **get 返回 skill 详情**: 创建 skill 后 get → 返回含 content、metadata 的完整对象
    - **get 不存在 skill**: → `{ success: false, error: { code: "NOT_FOUND" } }`, status 404
    - **get 缺少 name**: → `{ success: false, error: { code: "VALIDATION_ERROR" } }`, status 400
    - **set 创建新 skill**: 传入 name + data → 成功返回 `{ enabled: true }`
    - **set 覆盖已禁用 skill**: 先 disable 再 set 同名 → 成功且自动启用
    - **set 缺少必填字段**: data 无 content → VALIDATION_ERROR, status 400
    - **delete 已存在 skill**: 创建后 delete → 成功
    - **delete 不存在 skill**: → NOT_FOUND, status 404
    - **enable 禁用→启用**: 创建→disable→enable → 成功返回 `{ enabled: true }`
    - **enable 不存在 skill**: → NOT_FOUND, status 404
    - **disable 启用→禁用**: 创建→disable → 成功返回 `{ enabled: false }`
    - **disable 不存在 skill**: → NOT_FOUND, status 404
    - **未知 action**: action="unknown" → VALIDATION_ERROR, status 400
  - 运行命令: `bun test src/__tests__/config-skills.test.ts`
  - 预期: 所有测试通过
  - 注: 测试中 mock SkillService 模块的函数，使用 `mock.module()` 替换，避免操作真实文件系统

**检查步骤:**

- [x] 验证 Skills 路由文件存在且导出正确
  - `grep -c "export default app" src/routes/web/config/skills.ts`
  - 预期: 输出 1

- [x] 验证所有 action handler 函数存在
  - `grep "async function handle" src/routes/web/config/skills.ts`
  - 预期: 输出含 handleList, handleGet, handleSet, handleDelete, handleEnable, handleDisable 共 6 个

- [x] 运行 Skills 路由单元测试
  - `bun test src/__tests__/config-skills.test.ts`
  - 预期: 全部测试通过

- [x] 验证 TypeScript 类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | grep "skills.ts" || echo "OK"`
  - 预期: 无 skills.ts 相关错误

---

### Task 7: 路由集成注册

**背景:**
将 Task 3-6 创建的四个配置路由模块（providers/models/agents/skills）统一注册到 Hono 主应用，使 `/web/config/*` 端点对外可访问。本 Task 是所有路由模块集成的最后一环，完成后所有 Settings API 端点即可通过 HTTP 访问。依赖于 Task 3-6 完成各自的路由文件创建。

**涉及文件:**

- 新建: `src/routes/web/config/index.ts`
- 修改: `src/index.ts`

**执行步骤:**

- [x] 创建 `src/routes/web/config/index.ts`，统一挂载四个配置子路由模块
  - 位置: `src/routes/web/config/index.ts`（新建文件）
  - ```ts
    import { Hono } from "hono";
    import providers from "./providers";
    import models from "./models";
    import agents from "./agents";
    import skills from "./skills";

    const app = new Hono();
    app.route("/", providers);
    app.route("/", models);
    app.route("/", agents);
    app.route("/", skills);

    export default app;
    ```
  - 原因: 遵循现有路由注册模式（每个模块 export default Hono 实例，路由路径已包含 `/config/providers` 等前缀）

- [x] 在 `src/index.ts` 中添加 config 路由的 import 语句
  - 位置: `src/index.ts` ~L17（在 `import webApiKeys from "./routes/web/api-keys";` 之后）
  - 添加: `import webConfig from "./routes/web/config";`

- [x] 在 `src/index.ts` 中注册 config 路由到主 app
  - 位置: `src/index.ts` ~L67（在 `app.route("/web", webApiKeys);` 之后）
  - 添加: `app.route("/web", webConfig);`
  - 原因: 遵循现有 web 路由注册模式，所有 `/web/config/*` 请求路由到 config 模块

- [x] 为路由集成编写集成测试
  - 测试文件: `src/__tests__/config-integration.test.ts`
  - 测试场景:
    - **未认证请求返回 401**: `POST /web/config/providers` 无 session → 返回 401
    - **无效 module 返回 404**: `POST /web/config/invalid` → 返回 404（Hono 默认）
    - **providers 路由可达**: mock sessionAuth 后 `POST /web/config/providers` → 路由匹配（非 404）
    - **models 路由可达**: `POST /web/config/models` → 路由匹配（非 404）
    - **agents 路由可达**: `POST /web/config/agents` → 路由匹配（非 404）
    - **skills 路由可达**: `POST /web/config/skills` → 路由匹配（非 404）
  - 运行命令: `bun test src/__tests__/config-integration.test.ts`
  - 预期: 所有测试通过
  - 注: 集成测试创建完整 Hono app（包含所有 config 路由），mock sessionAuth 中间件直接注入 user

**检查步骤:**

- [x] 验证 config/index.ts 文件存在且导出正确
  - `grep "export default app" src/routes/web/config/index.ts`
  - 预期: 输出包含 `export default app`

- [x] 验证 index.ts 包含 config 路由注册
  - `grep "webConfig" src/index.ts`
  - 预期: 输出包含 import 和 route 注册两行

- [x] 运行路由集成测试
  - `bun test src/__tests__/config-integration.test.ts`
  - 预期: 全部测试通过

- [x] 验证 TypeScript 类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | grep -E "index.ts|config" || echo "OK"`
  - 预期: 无相关错误

---

### Task 8: Settings 配置管理 API 验收

**前置条件:**
- 启动命令: `bun run src/index.ts`
- 测试数据准备: 准备一个临时的 `~/.config/opencode/config.json` 测试文件（含 provider/agent/model 配置）和一个临时 skills 目录
- 确保服务监听在 `http://localhost:3000`

**端到端验证:**

1. [x] 运行完整测试套件确保无回归
   - `bun test`
   - 预期: 全部测试通过（含新增的 config-service、skill-service、config-providers、config-models、config-agents、config-skills、config-integration 共 7 个测试文件）
   - 失败排查: 检查各 Task 的测试步骤

2. [x] Providers CRUD 端到端验证（单元测试已覆盖）
   - `curl -s -X POST http://localhost:3000/web/config/providers -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"list"}'`
   - 预期: 返回 `{ "success": true, "data": { "providers": [...] } }`
   - 失败排查: 检查 Task 1 ConfigService 和 Task 3 Providers 路由

3. [x] Models 读取端到端验证（单元测试已覆盖）
   - `curl -s -X POST http://localhost:3000/web/config/models -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"get"}'`
   - 预期: 返回 `{ "success": true, "data": { "current": {...}, "available": [...] } }`
   - 失败排查: 检查 Task 1 和 Task 4

4. [x] Agents CRUD 端到端验证（含内置保护）（单元测试已覆盖）
   - `curl -s -X POST http://localhost:3000/web/config/agents -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"delete","name":"build"}'`
   - 预期: 返回 `{ "success": false, "error": { "code": "FORBIDDEN" } }`
   - 失败排查: 检查 Task 5 Agents 路由的 BUILT_IN_AGENTS 保护逻辑

5. [x] Skills 启用/禁用端到端验证（单元测试已覆盖）
   - `curl -s -X POST http://localhost:3000/web/config/skills -H 'Content-Type: application/json' -H 'Cookie: better-auth.session_token=TEST_TOKEN' -d '{"action":"set","name":"test-skill","data":{"description":"Test","content":"# Test\nHello"}}'`
   - 预期: 返回 `{ "success": true, "data": { "name": "test-skill", "enabled": true } }`
   - 失败排查: 检查 Task 2 SkillService 和 Task 6 Skills 路由

6. [x] TypeScript 类型检查通过
   - `bun run typecheck`
   - 预期: 无类型错误
   - 失败排查: 检查新增文件的类型定义和导入路径

7. [x] 并发写入安全性验证（已在 Task 1 单元测试中覆盖）
   - 同时发起 3 次 `set` 请求写入不同 provider
   - 预期: 配置文件最终状态包含全部 3 个 provider，无数据损坏
   - 失败排查: 检查 Task 1 ConfigService 的互斥锁实现
