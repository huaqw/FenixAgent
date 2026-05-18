import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import * as teamService from "../../services/team";
import { loadTeamContext } from "../../services/team-context";

const app = new Elysia({ name: "web-teams", prefix: "/web" }).use(authGuardPlugin);

app.post(
  "/teams",
  async ({ store, body, error, request }: any) => {
    const b = (body as any) ?? {};
    const user = store.user!;
    const authCtx = await loadTeamContext(user, request);

    switch (b.action) {
      case "list": {
        const teams = await teamService.listMyTeams(user.id);
        return { success: true, data: teams };
      }
      case "get": {
        if (!authCtx) return error(500, { success: false, error: { code: "NO_TEAM_CONTEXT" } });
        const detail = await teamService.getTeamDetail(b.teamId ?? authCtx.teamId);
        if (!detail) return error(404, { success: false, error: { code: "NOT_FOUND", message: "Team not found" } });
        const members = await teamService.getTeamMembers(b.teamId ?? authCtx.teamId);
        return { success: true, data: { ...detail, members } };
      }
      case "create": {
        if (!b.name || !b.slug)
          return error(400, { success: false, error: { code: "VALIDATION_ERROR", message: "name and slug required" } });
        try {
          const t = await teamService.createTeam(user.id, b.name, b.slug, b.description);
          return { success: true, data: t };
        } catch (err: any) {
          const msg = err.cause?.message || err.message || "";
          if (msg.includes("unique") || msg.includes("duplicate")) {
            return error(409, { success: false, error: { code: "ALREADY_EXISTS", message: "slug 已被使用" } });
          }
          throw err;
        }
      }
      case "update": {
        if (!authCtx) return error(500, { success: false, error: { code: "NO_TEAM_CONTEXT" } });
        if (!["owner", "admin"].includes(authCtx.role))
          return error(403, { success: false, error: { code: "FORBIDDEN", message: "owner or admin only" } });
        const t = await teamService.updateTeam(b.teamId ?? authCtx.teamId, b.data);
        return { success: true, data: t };
      }
      case "delete": {
        if (!authCtx) return error(500, { success: false, error: { code: "NO_TEAM_CONTEXT" } });
        if (authCtx.role !== "owner")
          return error(403, { success: false, error: { code: "FORBIDDEN", message: "owner only" } });
        const ok = await teamService.deleteTeam(authCtx.teamId);
        return { success: true, data: { deleted: ok } };
      }
      case "switch": {
        if (!b.teamId)
          return error(400, { success: false, error: { code: "VALIDATION_ERROR", message: "teamId required" } });
        const { getAuthContextByTeamId } = await import("../../services/team");
        const ctx = await getAuthContextByTeamId(user.id, b.teamId);
        if (!ctx)
          return error(403, { success: false, error: { code: "FORBIDDEN", message: "Not a member of this team" } });
        return { success: true, data: ctx };
      }
      case "list-members": {
        if (!authCtx) return error(500, { success: false, error: { code: "NO_TEAM_CONTEXT" } });
        const members = await teamService.getTeamMembers(b.teamId ?? authCtx.teamId);
        return { success: true, data: members };
      }
      case "add-member": {
        if (!authCtx) return error(500, { success: false, error: { code: "NO_TEAM_CONTEXT" } });
        if (!["owner", "admin"].includes(authCtx.role))
          return error(403, { success: false, error: { code: "FORBIDDEN", message: "owner or admin only" } });
        if (!b.userId)
          return error(400, { success: false, error: { code: "VALIDATION_ERROR", message: "userId required" } });
        const m = await teamService.addMember(authCtx.teamId, b.userId, b.role || "member");
        return { success: true, data: m };
      }
      case "remove-member": {
        if (!authCtx) return error(500, { success: false, error: { code: "NO_TEAM_CONTEXT" } });
        if (!["owner", "admin"].includes(authCtx.role))
          return error(403, { success: false, error: { code: "FORBIDDEN", message: "owner or admin only" } });
        if (!b.userId)
          return error(400, { success: false, error: { code: "VALIDATION_ERROR", message: "userId required" } });
        const ok = await teamService.removeMember(authCtx.teamId, b.userId);
        return { success: true, data: { removed: ok } };
      }
      case "update-role": {
        if (!authCtx) return error(500, { success: false, error: { code: "NO_TEAM_CONTEXT" } });
        if (authCtx.role !== "owner")
          return error(403, { success: false, error: { code: "FORBIDDEN", message: "owner only" } });
        if (!b.userId || !b.role)
          return error(400, {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "userId and role required" },
          });
        const ok = await teamService.updateRole(authCtx.teamId, b.userId, b.role);
        return { success: true, data: { updated: ok } };
      }
      case "get-current": {
        const detail = authCtx ? await teamService.getTeamDetail(authCtx.teamId) : null;
        return { success: true, data: { teamId: authCtx?.teamId, role: authCtx?.role, team: detail } };
      }
      default:
        return error(400, {
          success: false,
          error: { code: "UNKNOWN_ACTION", message: `Unknown action: ${b.action}` },
        });
    }
  },
  { sessionAuth: true },
);

export default app;
