import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface TeamWithRole extends TeamInfo {
  role: string;
}

interface TeamContextValue {
  team: TeamInfo | null;
  role: string | null;
  teams: TeamWithRole[];
  loading: boolean;
  switchTeam: (teamId: string) => Promise<void>;
  refreshTeams: () => Promise<void>;
}

const STORAGE_KEY = "active_team_id";

const TeamContext = createContext<TeamContextValue | null>(null);

/** 团队 API 调用辅助 — 自动附带 activeTeamId header */
async function teamApi<T>(body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const activeTeamId = localStorage.getItem(STORAGE_KEY);
  if (activeTeamId) headers["X-Active-Team-Id"] = activeTeamId;
  const res = await fetch("/web/teams", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Team API error: ${res.status}`);
  const json = await res.json();
  return (json as { success: boolean; data: T }).data;
}

/** 给全局 fetch 注入 X-Active-Team-Id header */
let fetchInterceptorInstalled = false;
function installFetchInterceptor() {
  if (fetchInterceptorInstalled) return;
  fetchInterceptorInstalled = true;
  const origFetch = window.fetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const activeTeamId = localStorage.getItem(STORAGE_KEY);
    if (activeTeamId) {
      const headers = new Headers(init?.headers);
      if (!headers.has("X-Active-Team-Id")) headers.set("X-Active-Team-Id", activeTeamId);
      init = { ...init, headers };
    }
    return origFetch(input, init);
  };
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshTeams = useCallback(async () => {
    try {
      const [current, list] = await Promise.all([
        teamApi<{ team: TeamInfo; role: string; teamId?: string }>({ action: "get-current" }),
        teamApi<TeamWithRole[]>({ action: "list" }),
      ]);
      setTeam(current.team);
      setRole(current.role);
      setTeams(list);
      // 存储当前活跃 teamId 到 localStorage
      if (current.teamId) localStorage.setItem(STORAGE_KEY, current.teamId);
    } catch (err) {
      console.error("Failed to load team context:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    installFetchInterceptor();
    refreshTeams();
  }, [refreshTeams]);

  const switchTeam = useCallback(async (teamId: string) => {
    localStorage.setItem(STORAGE_KEY, teamId);
    await teamApi<void>({ action: "switch", teamId });
    window.location.reload();
  }, []);

  return (
    <TeamContext.Provider value={{ team, role, teams, loading, switchTeam, refreshTeams }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
