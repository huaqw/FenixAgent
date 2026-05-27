# Async Tree View 组件设计

## 概述

设计一个 VSCode 风格的通用异步 Tree View 组件，采用 shadcn Compound Component 模式，支持每层展开时异步加载数据。用于替换现有 `AgentSidebarTree`，并在文件浏览器、知识库目录、工作流节点树等场景复用。

## 设计决策记录

| 决策项 | 选择 |
|--------|------|
| 架构模式 | Compound Component 组合模式（shadcn 风格） |
| 数据加载 | 声明式 `getChildren` 回调 |
| 选择模型 | 仅单选 |
| 行内操作 | `renderActions` render prop |
| 右键菜单 | 外部处理，不内置 |
| 虚拟化 | 不内置，前端截断 + "展开更多"按钮 |
| 节点字段 | 中等集合（id/label/icon/hasChildren/badge/description/isDisabled） |

## 数据模型

```typescript
interface TreeNodeData {
  id: string;
  label: string;
  icon?: LucideIcon;
  hasChildren?: boolean;       // undefined = 未知，展开时尝试加载
  badge?: string | number;
  description?: string;
  isDisabled?: boolean;
}

type ChildrenLoader = (parentId: string | null) => Promise<TreeNodeData[]>;

interface NodeState {
  expanded: boolean;
  selected: boolean;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  visibleChildren: TreeNodeData[];
}
```

`hasChildren` 三态：`undefined` 表示未知（展开时触发加载），`true` 显示 chevron 但未加载，`false` 不显示 chevron。消费方可通过 `TreeNodeData & T` 扩展业务字段。

`NodeState` 是**公共接口**，通过 render prop 回调暴露给消费方，描述节点的运行时 UI 状态。`TreeNodeState`（见状态管理章节）是**内部实现**，管理缓存和加载逻辑，不对外暴露。

## 组件层级

```
<Tree>                          根容器，提供 Context
  <TreeItem nodeId="a">        节点行 + 子节点容器
    <TreeItemContent>          行内容（图标 + 标签 + 操作区），可覆盖
    </TreeItemContent>
    <TreeItemGroup>            子节点折叠容器（带动画）
      <TreeItem nodeId="a-1">
        ...
      </TreeItem>
    </TreeItemGroup>
  </TreeItem>
</Tree>
```

### `<Tree>` Props

```typescript
interface TreeProps {
  getChildren: ChildrenLoader;
  maxVisibleItems?: number;           // 默认 100
  defaultExpandedIds?: string[];
  selectedId?: string | null;         // 受控选中
  defaultSelectedId?: string | null;  // 非受控选中
  onSelect?: (nodeId: string | null, node: TreeNodeData) => void;
  onToggle?: (nodeId: string, expanded: boolean) => void;
  className?: string;
  children?: ReactNode;               // 顶层静态/特殊节点
}
```

### `<TreeItem>` Props

```typescript
interface TreeItemProps {
  nodeId: string;
  nodeData: TreeNodeData;
  renderActions?: (node: TreeNodeData, state: NodeState) => ReactNode;
  renderLabel?: (node: TreeNodeData, state: NodeState) => ReactNode;
  className?: string;
  children?: ReactNode;
}
```

### `<TreeItemContent>`

行内容默认渲染：chevron + 图标 + 标签 + badge + 操作区。可被消费方整个替换。

### `<TreeItemGroup>`

子节点折叠容器，带 CSS grid 过渡动画。

## 两种消费模式

**纯异步模式**（大多数场景）：只传 `getChildren`，组件内部递归渲染，展开时自动加载。

**混合模式**（特殊场景）：顶层手动写 `<TreeItem>` 做静态节点，深层仍走 `getChildren`。

## 状态管理

### 内部状态

扁平 `Map<string, TreeNodeState>`，O(1) 查找，无需深拷贝：

```typescript
interface TreeNodeState {
  data: TreeNodeData;
  childrenIds: string[] | null;   // null = 未加载, [] = 无子节点
  expanded: boolean;
  loading: boolean;
  error: string | null;
  truncatedCount: number;         // 被截断的数量
}
```

### 异步加载流程

1. 用户点击 chevron 展开节点
2. 检查 `childrenIds` 是否已缓存
   - 已缓存：直接展开
   - 未缓存：设置 `loading = true`，渲染 spinner，调用 `getChildren(nodeId)`
3. 成功：写入缓存 + 子节点 data，`expanded = true`
4. 失败：设置 `error`，chevron 区域替换为重试图标
5. 超出 `maxVisibleItems`：截断，显示 "+N 更多" 按钮

### 缓存策略

- 折叠不清理缓存，再次展开直接使用
- 通过 ref 暴露 `refetch(nodeId?)` 方法手动刷新
- 无全局 TTL，由消费方按需调用 `refetch`

### "展开更多"

截断时底部渲染 "+N 更多" 按钮，点击后 `visibleCount += maxVisibleItems`（累加直到全部显示）。截断只影响展示，缓存保留完整数据。

## 视觉渲染

### 行结构

```
│ ▸ 📁 agents          [2]    ⚙️
│ ▾ 🤁 my-agent              🔄 ⚙️
│   │ ● Instance 1            ⏹
│   │ ● Instance 2            ⏹
│   │ + 新实例
│ ▸ 📁 tools           [5]    ⚙️
```

从左到右：缩进指示线 → chevron → 图标 → 标签（truncate）→ badge → 操作区（hover 显示）。

### 交互

- 点击整行 → 选中
- 点击 chevron → 展开/折叠，不影响选中
- Hover → 浅色背景 + 操作按钮渐显
- 选中行 → `bg-accent` 背景
- 再次点击已选中行 → 不取消选中

### 动画

展开/折叠使用 `grid-template-rows: 0fr → 1fr` 过渡，150ms。

### 样式细节

- 缩进指示线：`border-left`，颜色 `text-muted-foreground/30`
- Chevron：`ChevronRight` / `ChevronDown`（lucide），无子节点时留空占位
- 图标：`nodeData.icon` 渲染，无图标时留空占位
- 操作区：右对齐，`opacity-0 group-hover:opacity-100` 渐显

## i18n Keys

在 `components` 命名空间中新增：

| Key | en | zh |
|-----|----|----|
| `tree.showMore` | `+{{count}} more` | `+{{count}} 更多` |
| `tree.loading` | `Loading...` | `加载中…` |
| `tree.loadError` | `Failed to load` | `加载失败` |
| `tree.retry` | `Retry` | `重试` |
| `tree.empty` | `No items` | `暂无内容` |

## 错误处理

加载失败时节点行保持可见，chevron 区域替换为重试图标（`RotateCw`，点击重新加载），不内置 toast。

## 文件结构

```
web/components/ui/tree.tsx                           # 所有组件
web/src/i18n/locales/en/components.json              # tree 相关翻译 key
web/src/i18n/locales/zh/components.json
```

单文件，与项目现有 shadcn 组件惯例一致。

## 使用场景

1. **Agent 侧边栏**（替换 `AgentSidebarTree.tsx`）— Agent → Instance 两级
2. **文件浏览器**（替换 `FileTreeTab.tsx` 中的 `@pierre/trees`）— 目录 → 文件多级
3. **知识库目录** — 知识库 → 资源两级
4. **工作流节点树** — 工作流 → 步骤 → 子步骤多级
