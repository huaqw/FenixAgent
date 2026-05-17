# 贡献指南

感谢你有兴趣为 Remote Control Server (RCS) 贡献代码！

## 开发流程

### 1. 环境准备

```bash
# Fork 并克隆仓库
$ git clone https://github.com/<your-username>/remote-control-server.git
$ cd remote-control-server
$ bun install
```

### 2. 创建特性分支

```bash
$ git checkout -b feature/your-feature-name
```

### 3. 开发和测试

```bash
# 后端开发
$ bun run dev

# 前端开发（修改后必须构建）
$ bun run dev:web
$ bun run build:web

# 运行测试
$ bun test src/__tests__/
$ bun test web/src/__tests__/
```

### 4. 提交代码

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加新功能
fix: 修复 bug
refactor: 重构代码
test: 添加或修改测试
docs: 更新文档
```

### 5. 提交 Pull Request

- 填写 PR 模板
- 确保所有测试通过
- 等待 Code Review

## 代码规范

### 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `config-service.ts`, `acp-ws-handler.ts` |
| 组件名 | PascalCase | `DataTable`, `FormDialog` |
| 函数名 | camelCase | `storeGetEnvironment`, `handleAcpWsOpen` |
| 常量 | UPPER_SNAKE_CASE | `MAX_WS_MESSAGE_SIZE` |
| 接口/类型 | PascalCase | `EnvironmentRecord`, `SessionEvent` |

### 目录结构

- `src/routes/` - API 路由
- `src/services/` - 业务逻辑
- `src/transport/` - WebSocket/传输层
- `src/auth/` - 认证相关
- `web/src/components/` - 前端组件
- `web/src/pages/` - 前端页面

### 前端约束

- **禁止外部字体链接**：使用系统原生字体栈
- **使用相对路径导入 shadcn 组件**

## 文档规范

详见 [文档编写规范](../docs/CONTRIBUTING_DOCS.md)（待创建）

核心要点：
- 代码变更时同步更新文档
- 用户文档：保姆式教程，中文优先
- 开发者文档：架构 + API，H1-H3 标题层级

## 测试要求

- 新功能必须包含单元测试
- 测试覆盖率不应降低
- 使用 Bun test 框架

## 常见问题

### 前端修改未生效？

修改前端代码后必须执行 `bun run build:web` 重新构建。

### Mock 测试失败？

 Bun test 的 mock 在同一进程中全局生效，多个测试文件 mock 同一模块时可能冲突。单独运行测试文件通常正常。

### acp-link 连接失败？

检查是否残留的 acp-link 进程占用了端口，使用 `restart-server.sh` 清理。

## 联系方式

- GitHub Issues: [提交问题](https://github.com/konghayao/remote-control-server/issues)
- Discussions: [参与讨论](https://github.com/konghayao/remote-control-server/discussions)
