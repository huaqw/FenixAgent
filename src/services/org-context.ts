import type { AuthContext } from "../plugins/auth";

// ────────────────────────────────────────────
// 测试注入：路由级测试通过 setTestOrgContext 绕过 DB 查询
// ────────────────────────────────────────────

let _testOrgContext: AuthContext | null = null;

export function setTestOrgContext(ctx: AuthContext | null) {
  _testOrgContext = ctx;
}

/** 从请求中解析 activeOrganizationId（header > query param > cookie） */
function extractActiveOrgId(request: Request): string | null {
  const header = request.headers.get("x-active-org-id");
  if (header) return header;
  const url = new URL(request.url);
  const query = url.searchParams.get("activeOrganizationId");
  if (query) return query;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)active_org_id=([^;]+)/)?.[1];
  if (cookie) return cookie;
  return null;
}

/**
 * 从 user + request 加载组织上下文。
 * 解析 activeOrganizationId，通过 better-auth organization API 查角色，构建 AuthContext。
 */
export async function loadOrgContext(user: { id: string }, request: Request): Promise<AuthContext | null> {
  if (_testOrgContext) return _testOrgContext;
  try {
    const { auth } = await import("../auth/better-auth");
    const api = auth.api as any;

    const activeOrgId = extractActiveOrgId(request);
    if (activeOrgId) {
      const memberRes = await api.listMembers({
        query: { organizationId: activeOrgId },
        headers: request.headers,
      });
      const memberList: any[] = Array.isArray(memberRes) ? memberRes : (memberRes?.members ?? []);
      const me = memberList.find((m: any) => m.userId === user.id);
      if (me) {
        return {
          organizationId: activeOrgId,
          userId: user.id,
          role: me.role as "owner" | "admin" | "member",
        };
      }
    }

    // fallback: 列出用户的组织，取第一个
    const orgs = await api.listOrganizations({ headers: request.headers });
    const orgList: any[] = Array.isArray(orgs) ? orgs : [];
    if (orgList.length > 0) {
      const org = orgList[0];
      const memberRes = await api.listMembers({
        query: { organizationId: org.id },
        headers: request.headers,
      });
      const memberList: any[] = Array.isArray(memberRes) ? memberRes : (memberRes?.members ?? []);
      const me = memberList.find((m: any) => m.userId === user.id);
      if (me) {
        return {
          organizationId: org.id,
          userId: user.id,
          role: me.role as "owner" | "admin" | "member",
        };
      }
    }

    // 无组织 → 返回 null（由上层处理首次组织创建）
  } catch (e: any) {
    console.error("[org-context] Failed to load:", e.message);
  }
  return null;
}
