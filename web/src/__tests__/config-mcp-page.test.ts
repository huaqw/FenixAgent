import { describe, test, expect } from "bun:test";
import {
  validateMcpForm,
  parseCommandString,
  commandToString,
  buildMcpSummary,
  buildMcpPayload,
} from "../pages/McpPage";

describe("validateMcpForm", () => {
  test("空名称", () => {
    expect(validateMcpForm("", "local", "npx", "")).toBe("名称不能为空");
  });

  test("无效名称（大写）", () => {
    expect(validateMcpForm("UPPER", "local", "npx", "")).toContain("小写字母");
  });

  test("名称含连字符开头", () => {
    expect(validateMcpForm("-abc", "local", "npx", "")).toContain("连字符");
  });

  test("名称含连续连字符", () => {
    expect(validateMcpForm("my--server", "local", "npx cmd", "")).toContain("连续连字符");
  });

  test("名称超长", () => {
    expect(validateMcpForm("a".repeat(65), "local", "npx", "")).toBe("名称长度不能超过 64 个字符");
  });

  test("local 缺少命令", () => {
    expect(validateMcpForm("test", "local", "", "")).toBe("命令不能为空");
  });

  test("remote 缺少 URL", () => {
    expect(validateMcpForm("test", "remote", "", "")).toBe("URL 不能为空");
  });

  test("remote 无效 URL", () => {
    expect(validateMcpForm("test", "remote", "", "not-a-url")).toBe("URL 格式不正确");
  });

  test("合法 local", () => {
    expect(validateMcpForm("my-server", "local", "npx mcp-srv", "")).toBeNull();
  });

  test("合法 remote", () => {
    expect(validateMcpForm("my-server", "remote", "", "https://example.com/mcp")).toBeNull();
  });
});

describe("parseCommandString", () => {
  test("基本拆分", () => {
    expect(parseCommandString("npx mcp-server --arg val")).toEqual(["npx", "mcp-server", "--arg", "val"]);
  });

  test("含引号参数", () => {
    expect(parseCommandString('cmd "arg with space" last')).toEqual(["cmd", "arg with space", "last"]);
  });

  test("空字符串", () => {
    expect(parseCommandString("")).toEqual([]);
  });
});

describe("commandToString", () => {
  test("基本转换", () => {
    expect(commandToString(["npx", "mcp-server"])).toBe("npx mcp-server");
  });

  test("含空格参数加引号", () => {
    expect(commandToString(["cmd", "arg with space"])).toBe('cmd "arg with space"');
  });
});

describe("buildMcpSummary", () => {
  test("local 配置", () => {
    expect(buildMcpSummary({ type: "local", command: ["npx", "srv"] })).toBe("npx");
  });

  test("remote 配置", () => {
    expect(buildMcpSummary({ type: "remote", url: "https://x.com" })).toBe("https://x.com");
  });

  test("禁用变体", () => {
    expect(buildMcpSummary({ enabled: false })).toBe("已禁用");
  });
});

describe("buildMcpPayload", () => {
  test("local 完整", () => {
    const result = buildMcpPayload("local", "npx srv", "", [{ key: "K", value: "V" }], [], "", "", "", "", "5000");
    expect(result.type).toBe("local");
    expect(result.command).toEqual(["npx", "srv"]);
    if ("environment" in result) {
      expect(result.environment).toEqual({ K: "V" });
    } else {
      throw new Error("Expected environment field");
    }
    if ("timeout" in result) {
      expect(result.timeout).toBe(5000);
    } else {
      throw new Error("Expected timeout field");
    }
  });

  test("remote 带 OAuth", () => {
    const result = buildMcpPayload(
      "remote",
      "",
      "https://x.com",
      [],
      [{ key: "Auth", value: "Bearer t" }],
      "id1",
      "sec1",
      "read",
      "https://cb",
      "",
    );
    expect(result.type).toBe("remote");
    if ("url" in result) {
      expect(result.url).toBe("https://x.com");
    }
    if ("headers" in result) {
      expect(result.headers).toEqual({ Auth: "Bearer t" });
    }
    if ("oauth" in result && result.oauth && typeof result.oauth === "object") {
      expect(result.oauth.clientId).toBe("id1");
      expect(result.oauth.clientSecret).toBe("sec1");
      expect(result.oauth.scope).toBe("read");
      expect(result.oauth.redirectUri).toBe("https://cb");
    }
  });

  test("过滤空键值对", () => {
    const result = buildMcpPayload("local", "npx", "", [{ key: "", value: "V" }], [], "", "", "", "", "");
    if ("environment" in result) {
      throw new Error("Expected no environment field for empty key");
    }
    expect(result.type).toBe("local");
  });
});
