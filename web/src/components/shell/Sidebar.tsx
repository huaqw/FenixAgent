import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Cpu,
  KeyRound,
  LogOut,
  MessageSquare,
  Monitor,
  Plug,
  Radio,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { signOut, useSession } from "../../lib/auth-client";
import { OrgSwitcher } from "../OrgSwitcher";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
}

interface NavGroup {
  label: string;
  items: NavEntry[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CONFIG_PAGES = [
  "models",
  "agents",
  "skills",
  "knowledge-bases",
  "mcp",
  "tasks",
  "channels",
  "workflow",
  "environments",
  "organizations",
  "apikeys",
  "login",
  "agent",
];

function getActiveNavId(pathname: string): string {
  const segment = pathname.replace(/^\//, "").split("/")[0];
  if (!segment) return "dashboard";
  if (CONFIG_PAGES.includes(segment)) return segment;
  return "session";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentPage = getActiveNavId(pathname);
  const { t } = useTranslation("sidebar");
  const { data: session } = useSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const userEmail = session?.user?.email ?? "";
  const avatarLetter = userEmail.charAt(0).toUpperCase() || "U";

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await signOut({ fetchOptions: { credentials: "include" } });
  };

  const navGroups: NavGroup[] = [
    {
      label: t("console"),
      items: [
        { id: "dashboard", label: t("overview"), icon: Monitor, to: "/" },
        { id: "workflow", label: t("workflow"), icon: Workflow, to: "/workflow" },
        { id: "environments", label: t("agents"), icon: Bot, to: "/environments" },
        { id: "models", label: t("models"), icon: Cpu, to: "/models" },
        { id: "session", label: t("sessions"), icon: MessageSquare },
      ],
    },
    {
      label: t("config"),
      items: [
        { id: "skills", label: t("skills"), icon: Settings, to: "/skills" },
        { id: "knowledge-bases", label: t("knowledge"), icon: BookOpen, to: "/knowledge-bases" },
        { id: "mcp", label: t("mcp"), icon: Plug, to: "/mcp" },
        { id: "tasks", label: t("tasks"), icon: Clock, to: "/tasks" },
        { id: "channels", label: t("channels"), icon: Radio, to: "/channels" },
        { id: "apikeys", label: t("apiKeys"), icon: KeyRound, to: "/apikeys" },
      ],
    },
  ];

  return (
    <aside
      className={[
        "flex flex-col h-full overflow-hidden",
        "border-r border-border-subtle bg-surface-0",
        "transition-[width,min-width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "z-20",
        collapsed
          ? "w-[var(--sidebar-collapsed)] min-w-[var(--sidebar-collapsed)]"
          : "w-[var(--sidebar-width)] min-w-[var(--sidebar-width)]",
      ].join(" ")}
    >
      {/* ---- Brand ---- */}
      <div
        className={[
          "flex items-center gap-2.5 px-4",
          "border-b border-border-subtle",
          "min-h-[var(--topbar-height)]",
          "bg-gradient-to-b from-surface-1 to-surface-0",
        ].join(" ")}
      >
        <div
          className={[
            "w-7 h-7 rounded-lg flex-shrink-0",
            "flex items-center justify-center",
            "bg-gradient-to-br from-brand to-brand-light",
            "text-white font-bold text-sm",
            "shadow-[0_2px_8px_rgba(99,102,241,0.25)]",
          ].join(" ")}
        >
          X
        </div>

        <span
          className={[
            "text-sm font-bold tracking-[0.02em] text-text-bright",
            "whitespace-nowrap overflow-hidden",
            "transition-opacity duration-200",
            collapsed ? "opacity-0" : "opacity-100",
          ].join(" ")}
        >
          XAgent
        </span>

        <button
          type="button"
          onClick={onToggle}
          className={[
            "ml-auto w-7 h-7 rounded-md flex-shrink-0",
            "flex items-center justify-center",
            "border border-border-subtle bg-transparent",
            "text-text-dim cursor-pointer",
            "transition-all duration-150",
            "hover:bg-surface-hover hover:text-text-primary",
          ].join(" ")}
          title={collapsed ? t("expand") : t("collapse")}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* ---- Navigation ---- */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div
              className={[
                "text-[11px] font-semibold uppercase tracking-[0.06em]",
                "text-text-dim whitespace-nowrap overflow-hidden",
                "px-5 pt-3 pb-1.5",
                "transition-all duration-200",
                collapsed && "text-center px-2 text-[0px] pt-3 pb-1.5",
              ].join(" ")}
            >
              {collapsed ? <span className="block w-4 h-px bg-border-default mx-auto mt-1" /> : group.label}
            </div>

            {group.items.map((item) => {
              const isActive = item.id === currentPage;
              const Icon = item.icon;

              const content = (
                <>
                  {isActive && (
                    <span
                      className={[
                        "absolute top-1 bottom-1 w-[3px] rounded-r-[3px]",
                        "bg-brand",
                        collapsed ? "left-0" : "-left-2",
                      ].join(" ")}
                    />
                  )}
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span
                    className={[
                      "overflow-hidden transition-opacity duration-200",
                      collapsed ? "opacity-0 w-0" : "opacity-100",
                    ].join(" ")}
                  >
                    {item.label}
                  </span>
                </>
              );

              const className = [
                "relative flex items-center w-full",
                "text-[13px] font-medium cursor-pointer",
                "transition-all duration-150",
                "whitespace-nowrap overflow-hidden select-none",
                "text-text-secondary",
                collapsed
                  ? "justify-center gap-0 px-0 py-2 mx-1.5 rounded-lg"
                  : "gap-2.5 px-3 py-2 mx-2 rounded-[var(--radius)]",
                isActive ? "bg-brand-subtle text-brand-light" : "hover:bg-surface-hover hover:text-text-primary",
              ].join(" ");

              return item.to ? (
                <Link key={item.id} to={item.to} className={className} title={collapsed ? item.label : undefined}>
                  {content}
                </Link>
              ) : (
                <button key={item.id} type="button" className={className} title={collapsed ? item.label : undefined}>
                  {content}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ---- Bottom: Team section ---- */}
      <div className={["border-t border-border-subtle", collapsed ? "px-0 py-2" : "px-2 py-2"].join(" ")}>
        {!collapsed && (
          <div className="px-1 mb-1.5">
            <OrgSwitcher />
          </div>
        )}

        <Link
          to="/organizations"
          title={collapsed ? t("organizations") : undefined}
          className={[
            "relative flex items-center w-full",
            "text-[13px] font-medium cursor-pointer",
            "transition-all duration-150",
            "whitespace-nowrap overflow-hidden select-none",
            collapsed ? "justify-center gap-0 px-0 py-2 mx-0 rounded-lg" : "gap-2.5 px-3 py-2 rounded-[var(--radius)]",
            currentPage === "organizations"
              ? "bg-brand-subtle text-brand-light"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          ].join(" ")}
        >
          {currentPage === "organizations" && (
            <span
              className={[
                "absolute top-1 bottom-1 w-[3px] rounded-r-[3px]",
                "bg-brand",
                collapsed ? "left-0" : "-left-2",
              ].join(" ")}
            />
          )}
          <Users className="w-[18px] h-[18px] flex-shrink-0" />
          <span
            className={[
              "overflow-hidden transition-opacity duration-200",
              collapsed ? "opacity-0 w-0" : "opacity-100",
            ].join(" ")}
          >
            {t("organizations")}
          </span>
        </Link>
      </div>

      {/* ---- Bottom: User avatar ---- */}
      <div className="relative border-t border-border-subtle">
        <button
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          className={[
            "flex items-center w-full",
            "cursor-pointer transition-colors duration-150",
            collapsed
              ? "justify-center py-2.5"
              : "gap-2.5 px-4 py-2.5",
          ].join(" ")}
          title={collapsed ? userEmail : undefined}
        >
          <div
            className={[
              "w-8 h-8 rounded-full flex-shrink-0",
              "flex items-center justify-center",
              "bg-gradient-to-br from-brand to-brand-light",
              "text-white text-[13px] font-semibold",
              "transition-shadow duration-150",
              "hover:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]",
            ].join(" ")}
          >
            {avatarLetter}
          </div>
          <span
            className={[
              "text-[12px] text-text-dim truncate",
              "transition-opacity duration-200",
              collapsed ? "opacity-0 w-0" : "opacity-100",
            ].join(" ")}
          >
            {userEmail}
          </span>
        </button>

        {userMenuOpen && (
          <div
            ref={userMenuRef}
            className={[
              "absolute left-2 right-2 bottom-full mb-1",
              "py-1.5",
              "rounded-[var(--radius-lg)]",
              "border border-border-default bg-surface-2",
              "shadow-lg shadow-black/10",
              "z-50",
            ].join(" ")}
          >
            <div className="px-3 py-2 border-b border-border-subtle">
              <p className="text-[13px] font-medium text-text-bright truncate">{userEmail}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={[
                "flex items-center gap-2 w-full px-3 py-2",
                "text-[13px] text-text-default",
                "hover:bg-surface-elevated rounded-[var(--radius)] mx-0.5",
                "transition-colors duration-100",
              ].join(" ")}
            >
              <LogOut className="w-3.5 h-3.5" />
              {t("logout")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
