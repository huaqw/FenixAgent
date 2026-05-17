import { db } from "../db";
import { team, teamMember, session, user } from "../db/schema";
import { eq, and } from "drizzle-orm";
import type { AuthContext } from "../plugins/auth";

/** 查询用户加入的所有团队（含角色） */
export async function listMyTeams(userId: string) {
  const rows = await db
    .select({
      id: team.id,
      name: team.name,
      slug: team.slug,
      description: team.description,
      role: teamMember.role,
    })
    .from(teamMember)
    .innerJoin(team, eq(teamMember.teamId, team.id))
    .where(eq(teamMember.userId, userId));
  return rows;
}

/** 获取团队详情 */
export async function getTeamDetail(teamId: string) {
  const [row] = await db.select().from(team).where(eq(team.id, teamId)).limit(1);
  return row ?? null;
}

/** 创建团队（创建者为 owner） */
export async function createTeam(userId: string, name: string, slug: string, description?: string) {
  const [newTeam] = await db.insert(team).values({
    name,
    slug,
    description: description ?? null,
    createdBy: userId,
  }).returning();
  // 创建者为 owner
  await db.insert(teamMember).values({
    teamId: newTeam.id,
    userId,
    role: "owner",
  });
  return newTeam;
}

/** 自动创建个人团队（幂等，slug = 'personal-' + userId） */
export async function ensurePersonalTeam(userId: string) {
  const slug = `personal-${userId}`;
  // 幂等：先查是否已存在
  const [existing] = await db.select().from(team).where(eq(team.slug, slug)).limit(1);
  if (existing) {
    // 确保成员关系存在
    const [membership] = await db.select().from(teamMember)
      .where(and(eq(teamMember.teamId, existing.id), eq(teamMember.userId, userId))).limit(1);
    if (!membership) {
      await db.insert(teamMember).values({ teamId: existing.id, userId, role: "owner" });
    }
    return existing;
  }
  return createTeam(userId, `${userId} 的团队`, slug);
}

/** 切换活跃团队（更新 session.activeTeamId） */
export async function switchTeam(userId: string, sessionId: string, newTeamId: string): Promise<AuthContext | null> {
  // 验证用户是该团队成员
  const [membership] = await db.select().from(teamMember)
    .where(and(eq(teamMember.teamId, newTeamId), eq(teamMember.userId, userId))).limit(1);
  if (!membership) return null;
  // 更新 session
  await db.update(session).set({ activeTeamId: newTeamId } as any).where(eq(session.id, sessionId));
  return { teamId: newTeamId, userId, role: membership.role as "owner" | "admin" | "member" };
}

/** 添加成员 */
export async function addMember(teamId: string, targetUserId: string, role: "owner" | "admin" | "member" = "member") {
  const [row] = await db.insert(teamMember).values({ teamId, userId: targetUserId, role }).returning();
  return row;
}

/** 移除成员（不能移除最后一个 owner） */
export async function removeMember(teamId: string, targetUserId: string): Promise<boolean> {
  // 检查是否是 owner
  const [membership] = await db.select().from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, targetUserId))).limit(1);
  if (membership?.role === "owner") {
    // 计算剩余 owner 数量
    const owners = await db.select().from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.role, "owner")));
    if (owners.length <= 1) return false; // 不能移除最后一个 owner
  }
  const result = await db.delete(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, targetUserId))).returning();
  return result.length > 0;
}

/** 修改角色（保留至少一个 owner） */
export async function updateRole(teamId: string, targetUserId: string, newRole: string): Promise<boolean> {
  // 如果从 owner 降级，检查是否是最后一个
  const [membership] = await db.select().from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, targetUserId))).limit(1);
  if (membership?.role === "owner" && newRole !== "owner") {
    const owners = await db.select().from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.role, "owner")));
    if (owners.length <= 1) return false;
  }
  const result = await db.update(teamMember).set({ role: newRole })
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, targetUserId))).returning();
  return result.length > 0;
}

/** 从 userId + teamId 查角色，构建 AuthContext */
export async function getAuthContextByTeamId(userId: string, teamId: string): Promise<AuthContext | null> {
  const [membership] = await db.select({ role: teamMember.role }).from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId))).limit(1);
  if (!membership) return null;
  return {
    teamId,
    userId,
    role: membership.role as "owner" | "admin" | "member",
  };
}

/** 从 session 读取 activeTeamId + 查角色，构建 AuthContext（兼容旧逻辑） */
export async function getAuthContext(userId: string, sessionId: string): Promise<AuthContext | null> {
  // 查 session 的 activeTeamId
  const [sess] = await db.select({
    activeTeamId: session.activeTeamId,
  }).from(session).where(eq(session.id, sessionId)).limit(1);
  if (!sess?.activeTeamId) return null;
  // 查角色
  const [membership] = await db.select({ role: teamMember.role }).from(teamMember)
    .where(and(eq(teamMember.teamId, sess.activeTeamId), eq(teamMember.userId, userId))).limit(1);
  if (!membership) return null;
  return {
    teamId: sess.activeTeamId,
    userId,
    role: membership.role as "owner" | "admin" | "member",
  };
}

/** 列出团队成员（含���户信息） */
export async function getTeamMembers(teamId: string) {
  const rows = await db.select({
    id: teamMember.id,
    userId: teamMember.userId,
    role: teamMember.role,
    joinedAt: teamMember.joinedAt,
    userName: user.name,
    userEmail: user.email,
  }).from(teamMember)
    .innerJoin(user, eq(teamMember.userId, user.id))
    .where(eq(teamMember.teamId, teamId));
  return rows;
}

/** 更新团队信息 */
export async function updateTeam(teamId: string, data: { name?: string; description?: string }) {
  const [row] = await db.update(team).set({ ...data, updatedAt: new Date() } as any)
    .where(eq(team.id, teamId)).returning();
  return row ?? null;
}

/** 删除团队 */
export async function deleteTeam(teamId: string): Promise<boolean> {
  const result = await db.delete(team).where(eq(team.id, teamId)).returning();
  return result.length > 0;
}
