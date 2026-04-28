import { describe, expect, test } from "bun:test";
import { filterConfiguredAcpModels } from "../lib/acp-model-filter";

describe("filterConfiguredAcpModels", () => {
  test("keeps ACP models that match configured full ids", () => {
    const result = filterConfiguredAcpModels(
      [
        { modelId: "openai/gpt-4o", name: "GPT-4o" },
        { modelId: "opencode/default", name: "Default" },
      ],
      [
        { id: "gpt-4o", provider: "openai", fullId: "openai/gpt-4o", label: "GPT-4o", contextLimit: null, outputLimit: null },
      ],
    );

    expect(result).toEqual([{ modelId: "openai/gpt-4o", name: "GPT-4o" }]);
  });

  test("keeps ACP models that match configured short ids", () => {
    const result = filterConfiguredAcpModels(
      [
        { modelId: "gpt-4o", name: "GPT-4o" },
        { modelId: "opencode/default", name: "Default" },
      ],
      [
        { id: "gpt-4o", provider: "openai", fullId: "openai/gpt-4o", label: "GPT-4o", contextLimit: null, outputLimit: null },
      ],
    );

    expect(result).toEqual([{ modelId: "gpt-4o", name: "GPT-4o" }]);
  });

  test("returns empty list when no configured models exist", () => {
    const result = filterConfiguredAcpModels(
      [{ modelId: "opencode/default", name: "Default" }],
      [],
    );

    expect(result).toEqual([]);
  });
});
