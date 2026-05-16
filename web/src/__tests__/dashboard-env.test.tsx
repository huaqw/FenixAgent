import { describe, test, expect } from "bun:test";

// Type imports
import type { Environment, EnvironmentDetail, CreateEnvironmentRequest, UpdateEnvironmentRequest } from "../types";

// Client imports
import { client } from "../api/client";

// Component imports
import { Dashboard } from "../pages/Dashboard";

describe("Dashboard Environment Management - Exports", () => {
  // 测试类型正确导出
  test("Environment types are exported correctly", () => {
    const env: Environment = {
      id: "test",
      name: "test-env",
      description: null,
      workspace_path: "/tmp",
      agent_name: null,
      agent_config_id: null,
      status: "idle",
      machine_name: null,
      branch: null,
      last_poll_at: null,
      created_at: 0,
      updated_at: 0,
    };
    expect(env.id).toBe("test");

    const detail: EnvironmentDetail = {
      ...env,
      secret: "env_secret_test",
      capabilities: null,
      worker_type: "acp",
      max_sessions: 1,
    };
    expect(detail.secret).toBe("env_secret_test");

    const createReq: CreateEnvironmentRequest = {
      name: "new-env",
      workspacePath: "/tmp/new",
      agentConfigId: "agent-config-uuid",
    };
    expect(createReq.name).toBe("new-env");

    const updateReq: UpdateEnvironmentRequest = {
      description: "updated",
      agentConfigId: null,
    };
    expect(updateReq.description).toBe("updated");
  });

  // 测试 Eden Treaty client 正确导出
  test("Eden Treaty client is exported", () => {
    expect(client).toBeDefined();
    expect(client.web).toBeDefined();
  });

  // 测试 Dashboard 组件是函数
  test("Dashboard component is a function", () => {
    expect(typeof Dashboard).toBe("function");
  });
});
