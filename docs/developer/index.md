# 开发者文档

Remote Control Server (RCS) 开发者文档，面向参与项目开发的工程师。

## 文档结构

- **[架构设计](./architecture/overview)** - 系统架构概述
- **[API 参考](./api/config)** - RESTful API 端点文档
- **[贡献指南](./contributing.md)** - 开发流程和规范

## 技术栈

| 组件 | 技术选型 |
|------|----------|
| 后端框架 | Hono + Bun |
| 前端框架 | React + Vite |
| 数据库 | SQLite + Drizzle ORM |
| 认证系统 | better-auth |
| 实时通信 | WebSocket (ACP)、SSE (会话事件) |
| 文档系统 | VitePress |
| 测试框架 | Bun test |

## 快速开始

### 本地开发环境

```bash
# 克隆仓库
$ git clone https://github.com/konghayao/remote-control-server.git
$ cd remote-control-server

# 安装依赖
$ bun install

# 启动后端开发服务器
$ bun run dev

# 启动前端开发服务器（另一个终端）
$ bun run dev:web

# 构建前端（修改前端代码后必须执行）
$ bun run build:web
```

### 运行测试

```bash
# 后端测试
$ bun test src/__tests__/

# 前端测试
$ bun test web/src/__tests__/
```

## 关键概念

### ACP 协议

RCS 通过 ACP (Agent Control Protocol) 与 acp-link 通信，实现 Agent 注册、消息中继和事件流转发。详见 [ACP 协议文档](./architecture/acp-protocol)。

### 配置系统

RCS 配置存储于 `~/.config/opencode/opencode.json`，包含 Providers、Models、Agents、Skills 和 MCP 配置。详见 [Config API](./api/config)。

### 事件总线

事件总线 (EventBus) 负责在会话、WebSocket 连接和 SSE 客户端之间传递事件。详见 [EventBus 文档](./architecture/event-bus)。

## 贡献流程

1. Fork 项目并创建特性分支
2. 按照 [开发规范](./contributing.md) 提交代码
3. 确保测试通过
4. 提交 Pull Request

## 许可证

MIT License
