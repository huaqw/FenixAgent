import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  logo?: string;
}

interface OrgWithRole extends OrgInfo {
  role: string;
}

interface OrgContextValue {
  org: OrgInfo | null;
  role: string | null;
  orgs: OrgWithRole[];
  loading: boolean;
  switchOrg: (orgId: string) => Promise<void>;
  refreshOrgs: () => Promise<void>;
}

const STORAGE_KEY = "active_org_id";

const OrgContext = createContext<OrgContextValue | null>(null);

/** 组织 API 调用辅助 — 自动附带 activeOrganizationId header */
async function orgApi<T>(body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const activeOrgId = localStorage.getItem(STORAGE_KEY);
  if (activeOrgId) headers["X-Active-Org-Id"] = activeOrgId;
  const res = await fetch("/web/organizations", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Organization API error: ${res.status}`);
  const json = await res.json();
  return (json as { success: boolean; data: T }).data;
}

/** 给全局 fetch 注入 X-Active-Org-Id header */
let fetchInterceptorInstalled = false;
function installFetchInterceptor() {
  if (fetchInterceptorInstalled) return;
  fetchInterceptorInstalled = true;
  const origFetch = window.fetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const activeOrgId = localStorage.getItem(STORAGE_KEY);
    if (activeOrgId) {
      const headers = new Headers(init?.headers);
      if (!headers.has("X-Active-Org-Id")) headers.set("X-Active-Org-Id", activeOrgId);
      init = { ...init, headers };
    }
    return origFetch(input, init);
  };
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshOrgs = useCallback(async () => {
    try {
      const list = await orgApi<OrgWithRole[]>({ action: "list" });
      setOrgs(list);
      // 取当前 active org 或第一个
      const activeOrgId = localStorage.getItem(STORAGE_KEY);
      const current = list.find((o) => o.id === activeOrgId) || list[0];
      if (current) {
        setOrg(current);
        setRole(current.role);
        localStorage.setItem(STORAGE_KEY, current.id);
      }
    } catch (err) {
      console.error("Failed to load org context:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    installFetchInterceptor();
    refreshOrgs();
  }, [refreshOrgs]);

  const switchOrg = useCallback(async (orgId: string) => {
    localStorage.setItem(STORAGE_KEY, orgId);
    await orgApi<void>({ action: "set-active", organizationId: orgId });
    window.location.reload();
  }, []);

  return (
    <OrgContext.Provider value={{ org, role, orgs, loading, switchOrg, refreshOrgs }}>{children}</OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
