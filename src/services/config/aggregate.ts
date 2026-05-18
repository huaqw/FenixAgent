import { db } from "../../db";
import { agentConfig, provider, skill, mcpServer } from "../../db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { AuthContext } from "../../plugins/auth";

// ────────────────────────────────────────────
// 批量配置读取（spawn 时一次性获取 Agent 完整配置）
// ────────────────────────────────────────────

export interface AgentFullConfig {
  agentConfig: typeof agentConfig.$inferSelect | null;
  providers: (typeof provider.$inferSelect)[];
  skills: (typeof skill.$inferSelect)[];
  mcpServers: (typeof mcpServer.$inferSelect)[];
}

/** 获取团队全局 skills（environmentId=NULL, agentConfigId=NULL） */
function listGlobalSkills(teamId: string) {
  return db
    .select()
    .from(skill)
    .where(and(eq(skill.teamId, teamId), isNull(skill.environmentId), isNull(skill.agentConfigId)));
}

export async function getAgentFullConfig(ctx: AuthContext, agentConfigId: string | null): Promise<AgentFullConfig> {
  if (!agentConfigId) {
    const [providers, mcpServers, skills] = await Promise.all([
      db.select().from(provider).where(eq(provider.teamId, ctx.teamId)),
      db
        .select()
        .from(mcpServer)
        .where(and(eq(mcpServer.teamId, ctx.teamId), eq(mcpServer.enabled, true))),
      listGlobalSkills(ctx.teamId),
    ]);
    return { agentConfig: null, providers, skills, mcpServers };
  }

  // 并行拉取 providers、mcpServers、agentConfig、skills（4 路并行→1 轮完成）
  // skills 使用较宽的 filter（全局 + agent-scoped），若 agentConfig 不存在则在内存中过滤
  const [providers, mcpServers, acRows, allSkills] = await Promise.all([
    db.select().from(provider).where(eq(provider.teamId, ctx.teamId)),
    db
      .select()
      .from(mcpServer)
      .where(and(eq(mcpServer.teamId, ctx.teamId), eq(mcpServer.enabled, true))),
    db
      .select()
      .from(agentConfig)
      .where(and(eq(agentConfig.id, agentConfigId), eq(agentConfig.teamId, ctx.teamId)))
      .limit(1),
    db
      .select()
      .from(skill)
      .where(
        and(
          eq(skill.teamId, ctx.teamId),
          isNull(skill.environmentId),
          sql`(${skill.agentConfigId} IS NULL OR ${skill.agentConfigId} = ${agentConfigId})`,
        ),
      ),
  ]);

  const [ac] = acRows;
  // agentConfig 不存在时回退到全局 skills（过滤掉 agent-scoped 行）
  const skills = ac ? allSkills : allSkills.filter((s) => s.agentConfigId === null);

  return { agentConfig: ac ?? null, providers, skills, mcpServers };
}
