import type { ModelInfo } from "../acp/types";
import type { ModelEntry } from "../types/config";

/**
 * Keep only ACP models that map to models configured in RCS.
 */
export function filterConfiguredAcpModels(
  models: ModelInfo[],
  configuredModels: ModelEntry[],
): ModelInfo[] {
  if (configuredModels.length === 0) {
    return [];
  }

  const allowedIds = new Set<string>();
  for (const model of configuredModels) {
    allowedIds.add(model.fullId);
    allowedIds.add(model.id);
  }

  return models.filter((model) => allowedIds.has(model.modelId));
}
