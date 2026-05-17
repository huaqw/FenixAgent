import { useState, useEffect, useCallback } from "react";
import { useTeam } from "../contexts/TeamContext";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Plus, Trash2, UserPlus, Shield, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TeamMember {
  id: string;
  userId: string;
  role: string;
  userName: string;
  userEmail: string;
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdBy: string;
}

/* ------------------------------------------------------------------ */
/*  API helper                                                         */
/* ------------------------------------------------------------------ */

async function teamApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/web/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "操作失败");
  return json.data as T;
}

/* ------------------------------------------------------------------ */
/*  Role helpers                                                       */
/* ------------------------------------------------------------------ */

const ROLE_LABELS: Record<string, string> = {
  owner: "拥有者",
  admin: "管理员",
  member: "成员",
};

function RoleBadge({ role }: { role: string }) {
  const variant = role === "owner" ? "default" : role === "admin" ? "secondary" : "outline";
  return <Badge variant={variant}>{ROLE_LABELS[role] || role}</Badge>;
}

function RoleIcon({ role }: { role: string }) {
  if (role === "owner") return <Shield className="w-3.5 h-3.5 text-yellow-500" />;
  if (role === "admin") return <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />;
  return <User className="w-3.5 h-3.5 text-text-dim" />;
}

/* ------------------------------------------------------------------ */
/*  Slug generator                                                     */
/* ------------------------------------------------------------------ */

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TeamsPage() {
  const { team: currentTeam, role: currentRole, refreshTeams } = useTeam();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("member");
  const [addMemberSaving, setAddMemberSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Edit team name/description
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Load my teams list
  const [myTeams, setMyTeams] = useState<{ id: string; name: string; slug: string; role: string }[]>([]);

  const loadMyTeams = useCallback(async () => {
    try {
      const list = await teamApi<{ id: string; name: string; slug: string; role: string }[]>({ action: "list" });
      setMyTeams(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadMyTeams();
  }, [loadMyTeams]);

  // Auto-select current team
  useEffect(() => {
    if (!selectedTeamId && currentTeam?.id) {
      setSelectedTeamId(currentTeam.id);
    }
  }, [selectedTeamId, currentTeam]);

  // Load team detail & members when selection changes
  useEffect(() => {
    if (!selectedTeamId) {
      setDetail(null);
      setMembers([]);
      return;
    }
    setLoading(true);
    Promise.all([
      teamApi<TeamDetail>({ action: "get", teamId: selectedTeamId }),
      teamApi<TeamMember[]>({ action: "list-members", teamId: selectedTeamId }),
    ])
      .then(([d, m]) => {
        setDetail(d);
        setMembers(m);
      })
      .catch((err) => {
        console.error(err);
        toast.error("加载团队详情失败");
      })
      .finally(() => setLoading(false));
  }, [selectedTeamId]);

  const canManage = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  // --- Create team ---
  const handleCreate = async () => {
    if (!formName.trim()) return;
    setFormSaving(true);
    try {
      const t = await teamApi<{ id: string }>({
        action: "create",
        name: formName.trim(),
        slug: formSlug || nameToSlug(formName),
        description: formDesc.trim() || undefined,
      });
      toast.success("团队创建成功");
      setCreateOpen(false);
      setFormName("");
      setFormSlug("");
      setFormDesc("");
      await loadMyTeams();
      await refreshTeams();
      setSelectedTeamId(t.id);
    } catch (err) {
      console.error(err);
      toast.error("创建团队失败");
    } finally {
      setFormSaving(false);
    }
  };

  // --- Update team info ---
  const handleSaveEdit = async () => {
    if (!selectedTeamId || !editName.trim()) return;
    setEditSaving(true);
    try {
      await teamApi({
        action: "update",
        teamId: selectedTeamId,
        name: editName.trim(),
        description: editDesc.trim(),
      });
      toast.success("团队信息已更新");
      setEditingName(false);
      setDetail((d) => (d ? { ...d, name: editName.trim(), description: editDesc.trim() } : d));
      await loadMyTeams();
      await refreshTeams();
    } catch (err) {
      console.error(err);
      toast.error("更新失败");
    } finally {
      setEditSaving(false);
    }
  };

  // --- Add member ---
  const handleAddMember = async () => {
    if (!selectedTeamId || !addMemberUserId.trim()) return;
    setAddMemberSaving(true);
    try {
      await teamApi({
        action: "add-member",
        teamId: selectedTeamId,
        userId: addMemberUserId.trim(),
        role: addMemberRole,
      });
      toast.success("成员已添加");
      setAddMemberOpen(false);
      setAddMemberUserId("");
      // Reload members
      const m = await teamApi<TeamMember[]>({ action: "list-members", teamId: selectedTeamId });
      setMembers(m);
    } catch (err) {
      console.error(err);
      toast.error("添加成员失败");
    } finally {
      setAddMemberSaving(false);
    }
  };

  // --- Remove member ---
  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeamId) return;
    try {
      await teamApi({ action: "remove-member", teamId: selectedTeamId, userId });
      toast.success("成员已移除");
      const m = await teamApi<TeamMember[]>({ action: "list-members", teamId: selectedTeamId });
      setMembers(m);
    } catch (err) {
      console.error(err);
      toast.error("移除成员失败");
    }
  };

  // --- Update role ---
  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!selectedTeamId) return;
    try {
      await teamApi({ action: "update-role", teamId: selectedTeamId, userId, role: newRole });
      toast.success("角色已更新");
      const m = await teamApi<TeamMember[]>({ action: "list-members", teamId: selectedTeamId });
      setMembers(m);
    } catch (err) {
      console.error(err);
      toast.error("更新角色失败");
    }
  };

  // --- Delete team ---
  const handleDeleteTeam = async () => {
    if (!selectedTeamId) return;
    setDeleteSaving(true);
    try {
      await teamApi({ action: "delete", teamId: selectedTeamId });
      toast.success("团队已删除");
      setDeleteOpen(false);
      setSelectedTeamId(null);
      setDetail(null);
      setMembers([]);
      await loadMyTeams();
      await refreshTeams();
    } catch (err) {
      console.error(err);
      toast.error("删除团队失败");
    } finally {
      setDeleteSaving(false);
    }
  };

  /* ---- Render ---- */

  return (
    <div className="flex h-full">
      {/* Left panel: team list */}
      <div className="w-[260px] border-r border-border-subtle flex flex-col bg-surface-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-bright">我的团队</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="h-7 w-7 p-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {myTeams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTeamId(t.id)}
              className={[
                "flex items-center gap-2 w-full px-4 py-2.5 text-left text-sm",
                "transition-colors duration-100",
                t.id === selectedTeamId
                  ? "bg-brand-subtle text-brand-light font-medium"
                  : "text-text-secondary hover:bg-surface-hover",
              ].join(" ")}
            >
              <RoleIcon role={t.role} />
              <span className="truncate">{t.name}</span>
              <span className="ml-auto text-[11px] text-text-dim">{ROLE_LABELS[t.role]}</span>
            </button>
          ))}
          {myTeams.length === 0 && (
            <p className="px-4 py-6 text-sm text-text-dim text-center">暂无团队</p>
          )}
        </div>
      </div>

      {/* Right panel: team detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && !detail && (
          <div className="flex flex-col items-center justify-center h-64 text-text-dim">
            <p className="text-sm">选择一个团队查看详情</p>
          </div>
        )}

        {!loading && detail && (
          <div className="max-w-[720px] mx-auto space-y-6">
            {/* Team info */}
            <div className="space-y-3">
              {editingName ? (
                <div className="space-y-3">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="团队名称"
                  />
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="描述（可选）"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} disabled={editSaving}>
                      {editSaving ? "保存中..." : "保存"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-text-bright">{detail.name}</h1>
                    <p className="text-sm text-text-dim mt-0.5">
                      {detail.slug}
                      {detail.description && ` · ${detail.description}`}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditName(detail.name);
                        setEditDesc(detail.description || "");
                        setEditingName(true);
                      }}
                    >
                      编辑
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Members section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">
                  成员 ({members.length})
                </h2>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddMemberOpen(true)}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    添加成员
                  </Button>
                )}
              </div>

              <div className="rounded-lg border border-border-subtle overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-1 text-text-dim">
                      <th className="text-left px-4 py-2.5 font-medium">用户</th>
                      <th className="text-left px-4 py-2.5 font-medium">角色</th>
                      <th className="text-right px-4 py-2.5 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr
                        key={m.id}
                        className="border-t border-border-subtle hover:bg-surface-hover"
                      >
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="font-medium text-text-primary">{m.userName || m.userId}</p>
                            <p className="text-xs text-text-dim">{m.userEmail}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <RoleBadge role={m.role} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isOwner && m.role !== "owner" && (
                              <select
                                value={m.role}
                                onChange={(e) => handleUpdateRole(m.userId, e.target.value)}
                                className="text-xs border border-border-subtle rounded px-1.5 py-0.5 bg-transparent text-text-secondary"
                              >
                                <option value="admin">管理员</option>
                                <option value="member">成员</option>
                              </select>
                            )}
                            {canManage && m.role !== "owner" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-text-dim hover:text-destructive"
                                onClick={() => handleRemoveMember(m.userId)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {members.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-text-dim">
                          暂无成员
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Danger zone */}
            {isOwner && (
              <div className="pt-4 border-t border-border-subtle">
                <h3 className="text-sm font-semibold text-destructive mb-2">危险区域</h3>
                <p className="text-sm text-text-dim mb-3">
                  删除团队将同时删除所有关联资源，此操作不可撤销。
                </p>
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  删除团队
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create team dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建团队</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-text-primary">名称</label>
              <Input
                className="mt-1"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (!formSlug || formSlug === nameToSlug(formName)) {
                    setFormSlug(nameToSlug(e.target.value));
                  }
                }}
                placeholder="团队名称"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary">Slug</label>
              <Input
                className="mt-1"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="url-identifier"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary">描述</label>
              <Input
                className="mt-1"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="可选"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={formSaving || !formName.trim()}>
              {formSaving ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加成员</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-text-primary">用户 ID / Email</label>
              <Input
                className="mt-1"
                value={addMemberUserId}
                onChange={(e) => setAddMemberUserId(e.target.value)}
                placeholder="输入用户 ID 或邮箱"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary">角色</label>
              <select
                value={addMemberRole}
                onChange={(e) => setAddMemberRole(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="admin">管理员</option>
                <option value="member">成员</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddMember} disabled={addMemberSaving || !addMemberUserId.trim()}>
              {addMemberSaving ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete team confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除团队</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除团队「{detail?.name}」，所有关联资源将被永久删除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              disabled={deleteSaving}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteSaving ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
