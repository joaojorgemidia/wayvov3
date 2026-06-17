import {
  Bike, LayoutDashboard, Users, FileText, DollarSign, Wrench,
  AlertTriangle, BarChart3, Droplets, Search,
  Package, MapPin, UserSearch, ChevronDown, MoreHorizontal, Landmark, ShieldCheck, History, BellRing, Settings, Building2, FileSignature
} from "lucide-react";
import { WayvoLogo } from "@/components/WayvoLogo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; url: string; icon?: React.ComponentType<{ className?: string }> }[];
}

const items: MenuItem[] = [
  // — Dia a dia —
  { title: "Visão Geral", url: "/dashboard", icon: LayoutDashboard },
  { title: "Pagamentos", url: "/cobrancas/semana", icon: BellRing },
  { title: "Locações", url: "/locacoes", icon: FileText },
  { title: "Contratos", url: "/contratos", icon: FileSignature },
  { title: "Clientes", url: "/clientes", icon: Users },
  // — Frota —
  {
    title: "Motos", url: "/motos", icon: Bike,
    children: [
      { title: "Frota", url: "/motos?tab=frota" },
      { title: "Controle Patrimonial", url: "/motos?tab=patrimonio" },
    ],
  },
  {
    title: "Manutenções", url: "/manutencoes", icon: Wrench,
    children: [
      { title: "Ordens de Serviço", url: "/manutencoes" },
      { title: "Gerenciar", url: "/manutencoes/config" },
    ],
  },
  { title: "Troca de Óleo", url: "/troca-oleo", icon: Droplets },
  { title: "Vistoria", url: "/vistoria", icon: Search },
  { title: "Rastreamento", url: "/rastreamento", icon: MapPin },
  // — Financeiro & Análise —
  { title: "Finanças", url: "/financeiro", icon: DollarSign },
  { title: "Multas de trânsito", url: "/multas", icon: AlertTriangle },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
];

// Apenas os mais relevantes em breve — demais ficam em "Mais"
const comingSoonItems: MenuItem[] = [];

const moreItems: MenuItem[] = [
  { title: "Contas", url: "/contas", icon: Landmark },
  { title: "Histórico", url: "/historico", icon: History },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

const moreComingSoonItems: MenuItem[] = [
  { title: "Estoque", url: "/estoque", icon: Package },
  { title: "Antecedentes", url: "/antecedentes", icon: UserSearch },
];

const adminItems: MenuItem[] = [
  { title: "Usuários", url: "/usuarios", icon: ShieldCheck },
];

const superAdminItems: MenuItem[] = [
  { title: "Empresas", url: "/empresas", icon: Building2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isAdmin } = useAuth();
  const { canManageEmpresas } = usePermissions();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo — fora do SidebarGroupLabel para não ser cortado */}
        <div className={`flex items-center border-b border-sidebar-border ${collapsed ? "justify-center px-2 py-3" : "px-4 py-4"}`}>
          <WayvoLogo variant="light" collapsed={collapsed} />
        </div>

        {/* Navegação principal */}
        <SidebarGroup className="pt-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                if (item.children && !collapsed) {
                  const isActive = item.children.some(
                    (c) => location.pathname + location.search === c.url
                      || location.pathname === c.url.split("?")[0],
                  );
                  return (
                    <SidebarMenuItem key={item.title}>
                      <Collapsible defaultOpen={isActive}>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className={`w-full justify-between hover:bg-sidebar-accent/50 ${isActive ? "sidebar-nav-active" : ""}`}>
                            <span className="flex items-center">
                              <item.icon className="mr-2 h-4 w-4" />
                              <span>{item.title}</span>
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-6 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                            {item.children.map((child) => {
                              const childActive = location.pathname + location.search === child.url;
                              return (
                                <SidebarMenuButton key={child.title} asChild>
                                  <NavLink
                                    to={child.url}
                                    className={`text-xs py-1.5 hover:bg-sidebar-accent/50 ${childActive ? "text-primary font-medium" : "text-muted-foreground"}`}
                                    activeClassName=""
                                  >
                                    {child.title}
                                  </NavLink>
                                </SidebarMenuButton>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard"}
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="sidebar-nav-active"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Em breve */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest px-2">Em breve</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {comingSoonItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    disabled
                    className="opacity-40 cursor-not-allowed hover:bg-transparent"
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Mais */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton className="w-full justify-between hover:bg-sidebar-accent/50">
                      <span className="flex items-center">
                        <MoreHorizontal className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Mais</span>}
                      </span>
                      {!collapsed && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  {!collapsed && (
                    <CollapsibleContent>
                      <div className="ml-6 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                        {[...moreItems, ...(isAdmin ? adminItems : []), ...(canManageEmpresas ? superAdminItems : [])].map((item) => {
                          const isActive = location.pathname === item.url;
                          return (
                            <SidebarMenuButton key={item.title} asChild>
                              <NavLink
                                to={item.url}
                                className={`text-xs py-1.5 hover:bg-sidebar-accent/50 ${isActive ? "sidebar-nav-active" : "text-muted-foreground"}`}
                                activeClassName=""
                              >
                                <item.icon className="mr-2 h-3.5 w-3.5" />
                                {item.title}
                              </NavLink>
                            </SidebarMenuButton>
                          );
                        })}
                        {moreComingSoonItems.map((item) => (
                          <SidebarMenuButton key={item.title} disabled className="opacity-40 cursor-not-allowed hover:bg-transparent text-xs py-1.5">
                            <item.icon className="mr-2 h-3.5 w-3.5" />
                            {item.title}
                          </SidebarMenuButton>
                        ))}
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
