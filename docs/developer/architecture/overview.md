# 架构总览

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Hono + Bun |
| 前端 | React + Vite + Tailwind CSS v4 |
| 数据库 | SQLite (Drizzle ORM) |
| 认证 | better-auth |
| 协议 | ACP (Agent Communication Protocol) |

## 系统架构

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│  ┌─────────────┐    ┌──────────────────┐   │
│  │ React App   │◄──►│ VitePress Docs   │   │
│  └──────┬──────┘    └──────────────────┘   │
└─────────┼───────────────────────────────────┘
          │ SSE / WebSocket
┌─────────▼───────────────────────────────────┐
│              Hono Server                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ /web/*   │  │ /acp/*   │  │ /v1/*     │ │
│  │ 控制面板  │  │ ACP 协议  │  │ 兼容 API  │ │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│       │              │              │       │
│  ┌────▼──────────────▼──────────────▼─────┐ │
│  │         EventBus (事件总线)             │ │
│  └────────────────┬───────────────────────┘ │
│                   │                         │
│  ┌────────────────▼───────────────────────┐ │
│  │    Store (内存) + SQLite (持久化)      │ │
│  └───────────────────────────────────────┘ │
└────────────────────┬────────────────────────┘
                     │ WebSocket (ACP)
              ┌──────▼──────┐
              │  acp-link   │
              │  AI Agents  │
              └─────────────┘
```

## 目录结构

```
src/
├── index.ts              # 入口，挂载所有路由
├── store.ts              # 内存存储 (Map)
├── logger.ts             # 日志工具
├── routes/
│   ├── web/              # 控制面板 API
│   ├── acp/              # ACP 协议路由
│   └── v1/               # 兼容 API
├── services/
│   ├── config.ts         # 配置文件 CRUD
│   ├── skill.ts          # Skills 管理
│   ├── instance.ts       # 实例管理
│   ├── task.ts           # 定时任务
│   ├── scheduler.ts      # 调度器
│   ├── session.ts        # 会话服务
│   └── environment.ts    # 环境管理
├── transport/
│   ├── acp-ws-handler.ts       # /acp/ws 连接处理
│   ├── acp-relay-handler.ts    # /acp/relay 中继
│   ├── event-bus.ts            # 事件总线
│   └── sse-writer.ts           # SSE 事件规范化
├── auth/
│   ├── better-auth.ts          # better-auth 实例
│   ├── api-key-service.ts      # API Key 管理
│   └── middleware.ts           # 认证中间件
└── db/
    └── schema.ts         # Drizzle ORM 表定义
```
