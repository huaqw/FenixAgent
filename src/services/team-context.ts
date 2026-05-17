import type { AuthContext } from "../plugins/auth";
import { getAuthContextByTeamId, ensurePersonalTeam, listMyTeams } from "./team";

/** 从请求中解析 activeTeamId（header > query param > cookie） */
function extractActiveTeamId(request: Request): string | null {
  const header = request.headers.get("x-active-team-id");
  if (header) return header;
  // EventSource 无法发送自定义 header，通过 query param 传递
  const url = new URL(request.url);
  const query = url.searchParams.get("activeTeamId");
  if (query) return query;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)active_team_id=([^;]+)/)?.[1];
  if (cookie) return cookie;
  return null;
}

/**
 * 从 user + request 加载团队上下文。
 * 解析 activeTeamId（header > cookie > fallback 第一个团队），查角色，构建 AuthContext。
 * 无团队时自动创建个人团队。
 */
export async function loadTeamContext(user: { id: string }, request: Request): Promise<AuthContext | null> {
  try {
    let activeTeamId = extractActiveTeamId(request);
    if (!activeTeamId) {
      const teams = await listMyTeams(user.id);
      if (teams.length > 0) activeTeamId = teams[0].id;
    }
    if (activeTeamId) {
      const ctx = await getAuthContextByTeamId(user.id, activeTeamId);
      if (ctx) return ctx;
    }
    // fallback: ensure personal team
    await ensurePersonalTeam(user.id);
    const teams = await listMyTeams(user.id);
    if (teams.length > 0) {
      return await getAuthContextByTeamId(user.id, teams[0].id);
    }
  } catch (e: any) {
    console.error("[team-context] Failed to load:", e.message);
  }
  return null;
}
