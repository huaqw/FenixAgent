import { useState, useEffect, useCallback } from "react";
import { apiFetchAllSessions, apiCreateInstance } from "../api/client";
import type { Session } from "../types";
import { SessionList } from "../components/SessionList";

interface DashboardProps {
  onNavigateSession: (sessionId: string) => void;
}

export function Dashboard({ onNavigateSession }: DashboardProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [creatingInstance, setCreatingInstance] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const sess = await apiFetchAllSessions();
      setSessions(sess || []);
    } catch (err) {
      console.error("Dashboard render error:", err);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const handleSelectSession = useCallback((sessionId: string) => {
    onNavigateSession(sessionId);
  }, [onNavigateSession]);

  const handleCreateInstance = useCallback(async () => {
    setCreatingInstance(true);
    try {
      await apiCreateInstance();
      await new Promise((r) => setTimeout(r, 500));
      await loadDashboard();
    } catch (err) {
      console.error("Failed to create instance:", err);
    } finally {
      setCreatingInstance(false);
    }
  }, [loadDashboard]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="sr-only">Dashboard</h1>

        {/* Stats overview */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
            <div className="text-xs font-medium text-text-muted">Agent</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{sessions.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
            <div className="text-xs font-medium text-text-muted">活跃</div>
            <div className="mt-1 text-2xl font-semibold text-status-running">
              {sessions.filter((s) => s.status === "idle" || s.status === "active").length}
            </div>
          </div>
        </div>

        {/* Agent (Sessions) */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Agent</h2>
            <button
              type="button"
              onClick={handleCreateInstance}
              disabled={creatingInstance}
              className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand/80 disabled:opacity-50"
            >
              {creatingInstance ? "Creating..." : "+ 新增实例"}
            </button>
          </div>
          <SessionList sessions={sessions} onSelect={handleSelectSession} />
        </section>
      </div>
    </div>
  );
}
