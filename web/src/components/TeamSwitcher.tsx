import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Users } from "lucide-react";
import { useTeam } from "../contexts/TeamContext";

/** Sidebar 顶部团队切换器 */
export function TeamSwitcher() {
  const { team, teams, switchTeam } = useTeam();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!team) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium",
          "text-text-primary hover:bg-surface-hover",
          "transition-colors duration-150",
        ].join(" ")}
      >
        <Users className="w-4 h-4 text-text-dim" />
        <span className="max-w-[120px] truncate">{team.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-text-dim" />
      </button>

      {open && (
        <div
          className={[
            "absolute top-full left-0 mt-1 min-w-[200px]",
            "bg-surface-1 border border-border-subtle rounded-lg shadow-lg",
            "py-1 z-50",
          ].join(" ")}
        >
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                switchTeam(t.id);
                setOpen(false);
              }}
              className={[
                "flex items-center gap-2 w-full px-3 py-2 text-sm text-left",
                "hover:bg-surface-hover transition-colors",
                t.id === team.id ? "text-brand font-medium" : "text-text-secondary",
              ].join(" ")}
            >
              {t.id === team.id && <Check className="w-3.5 h-3.5" />}
              <span className={t.id !== team.id ? "ml-[20px]" : ""}>{t.name}</span>
              <span className="ml-auto text-[11px] text-text-dim">{t.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
