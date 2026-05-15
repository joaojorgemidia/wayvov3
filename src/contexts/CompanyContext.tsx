import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from "react";
import { Company, AsaasConfig, loadCompanies, saveCompanies, getActiveCompanyId, setActiveCompanyId } from "@/lib/companies";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CompanyContextType {
  companies: Company[];
  activeCompany: Company;
  switchCompany: (id: string) => void;
  addCompany: (company: Company) => Promise<void>;
  updateCompany: (id: string, updates: { nome: string; cnpj: string }) => Promise<void>;
  updateAsaasConfig: (id: string, config: AsaasConfig) => Promise<void>;
  removeCompany: (id: string) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { allowedCompanies, user, isAdmin, refreshAccess } = useAuth();
  const [companies, setCompanies] = useState<Company[]>(loadCompanies);
  const [activeId, setActiveId] = useState<string>(getActiveCompanyId);

  const createFallbackCompany = useCallback((id: string): Company => {
    const metadata = user?.user_metadata ?? {};
    const userCompanyId = typeof metadata.company_id === "string" ? metadata.company_id : undefined;
    const userCompanyName = typeof metadata.company_name === "string" ? metadata.company_name : undefined;
    const userCompanyCnpj = typeof metadata.cnpj === "string" ? metadata.cnpj : "";

    if (id === userCompanyId) {
      return {
        id,
        nome: userCompanyName || id,
        cnpj: userCompanyCnpj,
      };
    }

    const nome = id
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    return { id, nome: nome || id, cnpj: "" };
  }, [user]);

  // Fetch shared companies from DB whenever user/access changes
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("companies").select("id, nome, cnpj, asaas_config");
      if (cancelled || error || !data) return;
      const dbCompanies: Company[] = data.map((c: any) => ({ id: c.id, nome: c.nome, cnpj: c.cnpj, asaasConfig: c.asaas_config ?? null }));

      // One-time seed: if admin has local companies that aren't in DB yet, upload them
      if (isAdmin) {
        const local = loadCompanies();
        const dbIds = new Set(dbCompanies.map(c => c.id));
        const missing = local.filter(c => !dbIds.has(c.id));
        if (missing.length > 0) {
          await supabase.from("companies").upsert(missing.map(c => ({
            id: c.id, nome: c.nome || c.id, cnpj: c.cnpj || "",
          })));
          dbCompanies.push(...missing);
        }
      }

      setCompanies(dbCompanies);
      saveCompanies(dbCompanies);
    })();
    return () => { cancelled = true; };
  }, [user, isAdmin, allowedCompanies]);

  useEffect(() => {
    if (!user || allowedCompanies.length === 0) return;

    const missing = allowedCompanies.filter((id) => !companies.some((company) => company.id === id));
    if (missing.length === 0) return;

    setCompanies((prev) => {
      const existingIds = new Set(prev.map((company) => company.id));
      const additions = missing
        .filter((id) => !existingIds.has(id))
        .map(createFallbackCompany);

      if (additions.length === 0) return prev;

      const next = [...prev, ...additions];
      saveCompanies(next);
      return next;
    });
  }, [user, allowedCompanies, companies, createFallbackCompany]);

  const resolvedCompanies = useMemo(() => {
    if (!user || allowedCompanies.length === 0) return companies;

    const existingIds = new Set(companies.map((company) => company.id));
    const fallbackCompanies = allowedCompanies
      .filter((id) => !existingIds.has(id))
      .map(createFallbackCompany);

    return fallbackCompanies.length > 0 ? [...companies, ...fallbackCompanies] : companies;
  }, [user, allowedCompanies, companies, createFallbackCompany]);

  // Filter companies based on user access (if authenticated and has restrictions)
  const visibleCompanies = user && allowedCompanies.length > 0
    ? resolvedCompanies.filter(c => allowedCompanies.includes(c.id))
    : resolvedCompanies;

  // Ensure activeId is within allowed companies
  useEffect(() => {
    if (user && allowedCompanies.length > 0 && !allowedCompanies.includes(activeId)) {
      const firstAllowed = allowedCompanies[0];
      setActiveId(firstAllowed);
      setActiveCompanyId(firstAllowed);
    }
  }, [user, allowedCompanies, activeId]);

  const activeCompany = visibleCompanies.find(c => c.id === activeId) || visibleCompanies[0] || resolvedCompanies[0];

  const switchCompany = useCallback((id: string) => {
    setActiveId(id);
    setActiveCompanyId(id);
  }, []);

  const addCompany = useCallback(async (company: Company) => {
    if (!user) {
      toast.error("Faça login para adicionar uma empresa");
      return;
    }
    // Persist company in shared table
    const { error: cErr } = await supabase
      .from("companies")
      .upsert({ id: company.id, nome: company.nome, cnpj: company.cnpj });
    if (cErr) {
      toast.error("Falha ao salvar locadora: " + cErr.message);
      return;
    }

    const updated = [...companies.filter(c => c.id !== company.id), company];
    setCompanies(updated);
    saveCompanies(updated);

    const { error } = await supabase
      .from("user_companies")
      .insert({ user_id: user.id, company_id: company.id });

    if (error) {
      console.error("Error linking company to user:", error);
      toast.error("Empresa salva, mas falhou ao vincular ao usuário: " + error.message);
      return;
    }

    await refreshAccess();
    toast.success("Empresa adicionada");
  }, [companies, user, refreshAccess]);

  const removeCompany = useCallback(async (id: string) => {
    if (!user) {
      toast.error("Faça login para excluir uma empresa");
      return;
    }
    if (visibleCompanies.length <= 1) {
      toast.error("Você precisa ter pelo menos uma empresa");
      return;
    }

    // Remove all user_companies rows for this company (cross-user) — admins only via RLS
    const { error } = await supabase
      .from("user_companies")
      .delete()
      .eq("company_id", id);

    if (error) {
      toast.error("Falha ao excluir empresa: " + error.message);
      return;
    }

    // Remove the shared company entry (admin only by RLS)
    await supabase.from("companies").delete().eq("id", id);

    const updated = companies.filter(c => c.id !== id);
    setCompanies(updated);
    saveCompanies(updated);
    if (activeId === id) {
      const next = updated.find(c => c.id !== id) || updated[0];
      if (next) switchCompany(next.id);
    }
    await refreshAccess();
    toast.success("Empresa excluída");
  }, [companies, visibleCompanies, activeId, switchCompany, user, refreshAccess]);

  const updateCompany = useCallback(async (id: string, updates: { nome: string; cnpj: string }) => {
    const payload = { nome: updates.nome.trim(), cnpj: updates.cnpj.trim() };
    const { error } = await supabase.from("companies").update(payload).eq("id", id);
    if (error) {
      toast.error("Falha ao atualizar locadora: " + error.message);
      return;
    }
    const next = (companies.some(c => c.id === id)
      ? companies
      : [...companies, ...resolvedCompanies.filter(c => c.id === id && !companies.some(x => x.id === c.id))]
    ).map(c => c.id === id ? { ...c, nome: updates.nome.trim() || c.nome, cnpj: updates.cnpj.trim() } : c);
    setCompanies(next);
    saveCompanies(next);
    toast.success("Locadora atualizada");
  }, [companies, resolvedCompanies]);

  const updateAsaasConfig = useCallback(async (id: string, config: AsaasConfig) => {
    const { error } = await supabase.from("companies").update({ asaas_config: config }).eq("id", id);
    if (error) {
      toast.error("Falha ao salvar configuração Asaas: " + error.message);
      return;
    }
    const next = companies.map(c => c.id === id ? { ...c, asaasConfig: config } : c);
    setCompanies(next);
    saveCompanies(next);
    toast.success("Configuração Asaas salva");
  }, [companies]);

  return (
    <CompanyContext.Provider value={{ companies: visibleCompanies, activeCompany, switchCompany, addCompany, updateCompany, updateAsaasConfig, removeCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
