import { describe, test, expect } from "bun:test";
import { parseConfigView } from "../App";

describe("parseConfigView MCP 路由", () => {
  test("/code/mcp → mcp", () => {
    expect(parseConfigView("/code/mcp")).toBe("mcp");
  });

  test("/code/mcp/ → mcp", () => {
    expect(parseConfigView("/code/mcp/")).toBe("mcp");
  });
});

describe("parseConfigView 现有路由不受影响", () => {
  test("/code/models → models", () => {
    expect(parseConfigView("/code/models")).toBe("models");
  });

  test("/code/agents → agents", () => {
    expect(parseConfigView("/code/agents")).toBe("agents");
  });

  test("/code/skills → skills", () => {
    expect(parseConfigView("/code/skills")).toBe("skills");
  });

  test("/code/ → null", () => {
    expect(parseConfigView("/code/")).toBeNull();
  });

  test("/code/session-123 → null", () => {
    expect(parseConfigView("/code/session-123")).toBeNull();
  });
});
