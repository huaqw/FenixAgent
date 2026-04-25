# Feature: 20260425_F005 - mcp-panel-config

## 需求背景

当前 Settings UI 已支持 providers、models、agents、skills 四个配置模块，但缺少对 MCP (Model Context Protocol) 服务器的配置管理。opencode 的配置文件 (`~/.config/opencode/opencode.json`) 中包含 `mcp` 字段，支持 local（命令行）和 remote（URL）两种 MCP 服务器类型。用户需要一个可视化的 MCP 配置面板来管理这些服务器。

参考：[opencode.ai/config.json](https://opencode.ai/config.json) 中的 `mcp` 字段定义。

## 目标

- 在现有 Settings 侧栏中新增 MCP 配置页面，与 models/agents/skills 保持一致的 UI 风格
- 支持对 MCP 服务器的完整 CRUD 操作（列表、查看、新增、编辑、删除、启用/禁用）
- 兼容 opencode.ai 的 McpLocalConfig 和 McpRemoteConfig 两种配置格式
- 后端 API 遵循现有 `apiConfigAction` 模式，复用 `/web/config/mcp` 路由

## 方案设计

### 数据模型

参考 opencode.ai config.json schema，MCP 配置存储在 `opencode.json` 的 `mcp` 字段中，结构为 `Record<string, McpServerConfig>`，key 为服务器名称。

```typescript
/** 本地 MCP 服务器配置（命令行启动） */
export interface McpLocalConfig {
  type: "local";
  command: string[];                           // 启动命令及参数
  environment?: Record<string, string>;        // 环境变量
  enabled?: boolean;                           // 是否启用（默认 true）
  timeout?: number;                            // 超时时间 ms（默认 5000）
}

/** 远程 MCP 服务器配置（URL 连接） */
export interface McpRemoteConfig {
  type: "remote";
  url: string;                                 // 远程服务器 URL
  enabled?: boolean;
  headers?: Record<string, string>;            // 请求头
  oauth?: McpOAuthConfig | false;              // OAuth 配置
  timeout?: number;
}

/** OAuth 认证配置 */
export interface McpOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  redirectUri?: string;
}

/** MCP 服务器配置联合类型 */
export type McpServerConfig = McpLocalConfig | McpRemoteConfig | { enabled: false };

/** 用于前端列表展示的 MCP 服务器信息 */
export interface McpServerInfo {
  name: string;                                // 服务器名称（key）
  type: "local" | "remote" | "disabled";       // 配置类型
  enabled: boolean;
  summary: string;                             // 简要描述：local 显示 command[0]，remote 显示 url
  timeout?: number;
}

/** MCP 服务器详情（编辑用） */
export interface McpServerDetail {
  name: string;
  config: McpServerConfig;
}
```

### API 设计

遵循现有 `apiConfigAction` 模式，新增 `mcp` 模块。所有请求通过 `POST /web/config/mcp` 发送，以 `action` 字段区分操作。

| Action | Payload | Response | 说明 |
|--------|---------|----------|------|
| `list` | 无 | `{ servers: McpServerInfo[] }` | 列出所有 MCP 服务器 |
| `get` | `{ name: string }` | `McpServerDetail` | 获取单个服务器详情 |
| `create` | `{ name: string, config: McpServerConfig }` | `{ name: string }` | 创建新服务器 |
| `update` | `{ name: string, config: McpServerConfig }` | `{ name: string }` | 更新服务器配置 |
| `delete` | `{ name: string }` | `null` | 删除服务器 |
| `enable` | `{ name: string }` | `{ name: string, enabled: boolean }` | 启用服务器 |
| `disable` | `{ name: string }` | `{ name: string, enabled: boolean }` | 禁用服务器 |

后端读取和写入 `~/.config/opencode/opencode.json` 的 `mcp` 字段。

### 前端 UI

#### 页面结构

新增 `McpPage.tsx` 页面，布局与现有 `ModelsPage`、`AgentsPage`、`SkillsPage` 一致：

- **服务器列表区域**：使用 DataTable 组件，展示所有 MCP 服务器的名称、类型、启用状态、简要描述
- **新增/编辑对话框**：使用 FormDialog 组件，根据 type 字段动态切换表单字段
  - Local 模式：命令输入（支持多参数）、环境变量键值对列表、超时时间
  - Remote 模式：URL 输入、请求头键值对列表、OAuth 配置（可选）、超时时间
- **操作按钮**：启用/禁用开关、编辑、删除

#### 路由集成

在 `App.tsx` 中：
- 将 `"mcp"` 加入 `configViews` 数组
- 新增侧栏 footer item（使用 `Server` 或 `Plug` 图标）
- 新增 lazy-loaded `McpPage` 路由分支

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `web/src/types/config.ts` | 修改 | 添加 McpLocalConfig/McpRemoteConfig/McpServerConfig 等类型，OpenCodeConfig 增加 mcp 字段 |
| `web/src/api/client.ts` | 修改 | 添加 apiListMcpServers/apiGetMcpServer/apiCreateMcpServer 等函数，扩展 apiConfigAction module 联合类型 |
| `web/src/App.tsx` | 修改 | 添加 mcp 路由和侧栏入口 |
| `web/src/pages/McpPage.tsx` | 新增 | MCP 配置管理页面 |
| 后端路由处理 | 修改 | 新增 mcp config handler |

## 实现要点

1. **类型区分**：McpServerConfig 是联合类型，前端表单需要根据 `type` 字段动态切换 local/remote 的输入字段。禁用状态（`{ enabled: false }`）作为一种独立变体处理。
2. **环境变量/请求头**：local 的 `environment` 和 remote 的 `headers` 都是键值对，前端需要提供可增删的键值对列表编辑器。
3. **命令输入**：local 的 `command` 是字符串数组，前端可提供一个输入框（空格分隔自动拆分）或多行输入。
4. **配置文件读写**：后端需正确处理 opencode.json 中 mcp 字段的读写，保留其他字段不变。
5. **名称唯一性**：MCP 服务器名称（key）在配置中必须唯一，创建时需检查重名。

## 验收标准

- [ ] 侧栏显示 MCP 入口（图标 + 文字），点击跳转到 MCP 配置页面
- [ ] MCP 列表页展示所有已配置的服务器，显示名称、类型标签（local/remote）、启用状态、简要描述
- [ ] 新增 local 类型 MCP 服务器：填写名称、命令、环境变量（可选）、超时（可选），保存后出现在列表中
- [ ] 新增 remote 类型 MCP 服务器：填写名称、URL、请求头（可选）、OAuth（可选）、超时（可选），保存后出现在列表中
- [ ] 编辑已有 MCP 服务器配置，修改后正确保存到 opencode.json
- [ ] 启用/禁用切换正常工作
- [ ] 删除 MCP 服务器并确认后移除
- [ ] 配置数据正确写入 `~/.config/opencode/opencode.json` 的 `mcp` 字段，格式符合 opencode.ai schema
