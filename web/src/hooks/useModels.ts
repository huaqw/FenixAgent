import { useState, useEffect, useMemo, useCallback } from "react";
import type { ACPClient } from "../acp/client";
import type { ModelInfo, SessionModelState } from "../acp/types";
import { apiGetModels } from "../api/client";
import type { ModelEntry } from "../types/config";
import { filterConfiguredAcpModels } from "../lib/acp-model-filter";

export interface UseModelsResult {
  /** Whether model selection is supported by the current agent */
  supportsModelSelection: boolean;
  /** List of available models */
  availableModels: ModelInfo[];
  /** The currently selected model ID */
  currentModelId: string | null;
  /** The currently selected model info */
  currentModel: ModelInfo | null;
  /** Set the model for the current session */
  setModel: (modelId: string) => Promise<void>;
  /** Whether a model change is in progress */
  isLoading: boolean;
}

/**
 * Hook to manage model selection state.
 * Reference: Zed's AcpModelSelector reads from state.available_models and state.current_model_id
 *
 * Uses event-driven updates instead of polling:
 * - setModelStateChangedHandler: called on session create/disconnect
 * - setModelChangedHandler: called when model selection changes
 */
export function useModels(client: ACPClient): UseModelsResult {
  const [modelState, setModelState] = useState<SessionModelState | null>(
    client.modelState
  );
  const [configuredModels, setConfiguredModels] = useState<ModelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiGetModels()
      .then((config) => {
        if (!cancelled) {
          setConfiguredModels(config.available);
        }
      })
      .catch((error) => {
        console.error("[useModels] Failed to load configured models:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to model state changes (session created/destroyed)
  // This replaces the previous 500ms polling approach
  useEffect(() => {
    // Handler for when model state changes (session created or disconnected)
    const handleModelStateChanged = (state: SessionModelState | null) => {
      setModelState(state);
      // Auto-restore previously selected model when a new session is created
      if (state && state.availableModels.length > 0) {
        const saved = localStorage.getItem("acp_model_id");
        if (saved && saved !== state.currentModelId && state.availableModels.some((m) => m.modelId === saved)) {
          client.setSessionModel(saved).catch(() => {});
        }
      }
    };

    // Handler for when current model changes within a session
    const handleModelChanged = (modelId: string) => {
      setModelState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentModelId: modelId,
        };
      });
      setIsLoading(false);
    };

    // Register handlers - setModelStateChangedHandler immediately calls with current state
    client.setModelStateChangedHandler(handleModelStateChanged);
    client.setModelChangedHandler(handleModelChanged);

    return () => {
      // Clear handlers on unmount
      client.setModelStateChangedHandler(() => {});
      client.setModelChangedHandler(() => {});
    };
  }, [client]);

  const availableModels = useMemo(
    () => filterConfiguredAcpModels(modelState?.availableModels ?? [], configuredModels),
    [configuredModels, modelState]
  );

  const currentModelId = modelState?.currentModelId ?? null;

  const currentModel = useMemo(
    () =>
      availableModels.find((m) => m.modelId === currentModelId) ?? null,
    [availableModels, currentModelId]
  );

  const setModel = useCallback(
    async (modelId: string) => {
      if (!modelState) {
        throw new Error("Model selection not supported");
      }
      setIsLoading(true);
      try {
        await client.setSessionModel(modelId);
        localStorage.setItem("acp_model_id", modelId);
        // The model_changed event will update the state
      } catch (error) {
        setIsLoading(false);
        throw error;
      }
    },
    [client, modelState]
  );

  return {
    supportsModelSelection: modelState !== null && availableModels.length > 0,
    availableModels,
    currentModelId,
    currentModel,
    setModel,
    isLoading,
  };
}
