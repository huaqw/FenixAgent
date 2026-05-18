/**
 * API 节点执行器 — 通过 fetch() 发送 HTTP 请求。
 *
 * 职责：
 * - 模板解析：url / headers / body 中的 ${{ }} 替换
 * - HTTP 请求：GET / POST / PUT / DELETE，支持 JSON body
 * - 超时控制：AbortSignal.timeout + ctx.signal 组合
 * - 重试：指数退避 + jitter（继承 RemoteExecutorBase）
 * - 事件发射：node.started / node.completed / node.failed / node.retrying
 * - 大响应：超过 1MB 写入临时文件，设置 ref
 */

import type { ApiNodeDef, NodeDef } from '../types/dag';
import type { NodeExecutionContext } from '../scheduler/dag-scheduler';
import type { NodeOutput } from '../types/execution';
import { resolveTemplate } from '../parser/expression-parser';
import type { EvalContext } from '../types/expression';
import { WorkflowError, WorkflowErrorCode } from '../types/errors';
import { RemoteExecutorBase } from './remote-executor';

// ---------- ApiExecutor ----------

/** API 节点执行器 */
export class ApiExecutor extends RemoteExecutorBase {
  async execute(node: NodeDef, ctx: NodeExecutionContext): Promise<NodeOutput> {
    if (node.type !== 'api') {
      throw new WorkflowError(
        `ApiExecutor only handles 'api' nodes, got '${node.type}'`,
        WorkflowErrorCode.NODE_FAILED,
      );
    }

    const apiNode = node as ApiNodeDef;
    const evalContext = this.buildEvalContext(ctx);

    return this.executeWithRetry(apiNode, ctx, (_attempt, signal) => this.doRequest(apiNode, evalContext, ctx, signal));
  }

  /** 构建表达式求值上下文 */
  private buildEvalContext(ctx: NodeExecutionContext): EvalContext {
    return {
      params: ctx.params,
      secrets: ctx.secrets,
    };
  }

  /** 执行单次 HTTP 请求 */
  private async doRequest(
    node: ApiNodeDef,
    evalContext: EvalContext,
    ctx: NodeExecutionContext,
    signal: AbortSignal,
  ): Promise<NodeOutput> {
    // 解析模板
    const url = resolveTemplate(node.url, evalContext);
    const method = node.method ?? 'GET';

    const headers: Record<string, string> = {};
    if (node.headers) {
      for (const [k, v] of Object.entries(node.headers)) {
        headers[k] = resolveTemplate(v, evalContext);
      }
    }

    // 构建 fetch init
    const init: RequestInit = {
      method,
      headers,
      signal,
    };

    if (node.body) {
      const resolvedBody = resolveTemplate(node.body, evalContext);
      init.body = resolvedBody;
      // 设置 Content-Type（如果未指定）
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    await this.emitNodeStarted(node.id, node.type, ctx, { url, method, inputs: ctx.resolvedInputs });

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // 网络错误或超时
      if (error instanceof DOMException && error.name === 'AbortError') {
        const isExternalCancel = ctx.signal.aborted;
        await this.emitNodeFailed(
          node.id, node.type, ctx,
          isExternalCancel ? 'cancelled' : 'timeout',
        );
        throw new WorkflowError(
          isExternalCancel ? 'API request cancelled' : 'API request timed out',
          isExternalCancel ? WorkflowErrorCode.DAG_CANCELLED : WorkflowErrorCode.NODE_TIMEOUT,
          { node_id: node.id },
        );
      }
      const msg = error instanceof Error ? error.message : String(error);
      await this.emitNodeFailed(node.id, node.type, ctx, msg);
      throw new WorkflowError(`API request failed: ${msg}`, WorkflowErrorCode.NODE_FAILED, { node_id: node.id });
    }

    // 读取响应体
    const bodyText = await response.text();
    const { stdout, json, size, ref } = await this.processResponseBody(bodyText, ctx);

    const exitCode = response.ok ? 0 : response.status;

    // 非 2xx → 失败
    if (!response.ok) {
      await this.emitNodeFailed(node.id, node.type, ctx, `HTTP ${response.status}`, exitCode);
      throw new WorkflowError(
        `HTTP request failed with status ${response.status}`,
        WorkflowErrorCode.NODE_FAILED,
        { node_id: node.id, exit_code: exitCode, stdout },
      );
    }

    // 成功
    const output: NodeOutput = { stdout, json, exit_code: exitCode, size, ref };
    await this.emitNodeCompleted(node.id, node.type, ctx, output);
    return output;
  }
}
