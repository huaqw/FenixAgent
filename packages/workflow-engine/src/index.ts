/**
 * `@mothership/workflow-engine` 的公开导出面。
 *
 * 原生 DAG 工作流执行引擎的类型定义和错误类型。
 */

// DAG 类型
export type {
  ParamDef,
  RetryConfig,
  NodeType,
  BaseNodeDef,
  ShellNodeDef,
  AgentNodeDef,
  ApiNodeDef,
  AuditNodeDef,
  SubWorkflowNodeDef,
  LoopBody,
  LoopNodeDef,
  NodeDef,
  WorkflowDef,
} from './types/dag';

// 执行类型
export type {
  DAGStatus,
  NodeStatus,
  NodeOutput,
  EventType,
  DAGEvent,
  DAGSnapshot,
  RunSummary,
} from './types/execution';

// 表达式类型
export type { ASTNode, EvalContext } from './types/expression';

// 错误类型（enum 和 class 用 export）
export { WorkflowErrorCode, WorkflowError } from './types/errors';
