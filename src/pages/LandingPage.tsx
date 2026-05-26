import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Menu,
  X,
  Shield,
  Building2,
  Wrench,
  Wallet,
  FileSignature,
  Lock,
  CloudUpload,
  Activity,
  Clock,
  TrendingUp,
  Layers,
  Check,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { WayvoLogo } from "@/components/WayvoLogo";

const NavLinks = ({ onClick }: { onClick?: () => void }) => (
  <>
    {[
      ["Funcionalidades", "#features"],
      ["Benefícios", "#benefits"],
      ["Segurança", "#security"],
      ["Planos", "#faq"],
    ].map(([label, href]) => (
      <a
        key={href}
        href={href}
        onClick={onClick}
        className="text-sm text-slate-300 hover:text-white transition-colors"
      >
        {label}
      </a>
    ))}
  </>
);

export default function LandingPage() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-slate-100 antialiased selection:bg-primary/30">
      {/* Background ornaments */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1100px] rounded-full bg-primary/20 blur-[140px] opacity-60" />
        <div className="absolute top-[40%] -right-40 h-[400px] w-[400px] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse at top, black 30%, transparent 75%)",
          }}
        />
      </div>

      {/* HEADER */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all ${
          scrolled
            ? "bg-[#0A0A0F]/80 backdrop-blur-xl border-b border-white/5"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <WayvoLogo variant="dark" />
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <NavLinks />
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-slate-300 hover:text-white transition-colors"
            >
              Entrar
            </Link>
            <Button
              asChild
              className="bg-white text-slate-900 hover:bg-slate-200 rounded-full px-5"
            >
              <Link to="/signup">
                Testar grátis <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <button
            className="md:hidden p-2 rounded-md hover:bg-white/5"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t border-white/5 bg-[#0A0A0F]/95 backdrop-blur-xl">
            <div className="px-6 py-6 flex flex-col gap-5">
              <NavLinks onClick={() => setOpen(false)} />
              <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
                <Button asChild variant="outline" className="bg-transparent border-white/10 text-white hover:bg-white/5">
                  <Link to="/login">Entrar</Link>
                </Button>
                <Button asChild className="bg-white text-slate-900 hover:bg-slate-200">
                  <Link to="/signup">Testar grátis</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative pt-40 pb-24 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-xs text-slate-300 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Nova versão 2026 — agora com cobrança automática
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05] max-w-4xl mx-auto">
            A plataforma definitiva para{" "}
            <span className="bg-gradient-to-r from-primary via-rose-400 to-orange-300 bg-clip-text text-transparent">
              gerenciar e escalar
            </span>{" "}
            sua locadora.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Controle sua frota, automatize cobranças, gerencie contratos e escale sua
            operação com segurança e previsibilidade. Tudo em um só lugar.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-white text-slate-900 hover:bg-slate-200 rounded-full px-7 h-12 text-base"
            >
              <Link to="/signup">
                Começar agora <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="bg-transparent border-white/15 text-white hover:bg-white/5 rounded-full px-7 h-12 text-base"
            >
              <a href="#features">Ver demonstração</a>
            </Button>
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span>4.9/5 · +2.000 veículos gerenciados</span>
          </div>

          {/* Product mockup */}
          <div className="mt-16 relative max-w-6xl mx-auto">
            <div className="absolute -inset-x-20 -top-10 -bottom-10 bg-gradient-to-b from-primary/20 to-transparent blur-3xl -z-10" />
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-2 shadow-2xl shadow-black/60">
              <div className="rounded-xl bg-[#0F0F18] overflow-hidden">
                <div className="flex items-center gap-2 px-4 h-9 border-b border-white/5">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                  </div>
                  <div className="text-xs text-slate-500 mx-auto">app.wayvo.com.br/dashboard</div>
                </div>
                <div className="grid grid-cols-12 gap-4 p-6">
                  <div className="col-span-3 space-y-3">
                    {["Dashboard", "Frota", "Locações", "Financeiro", "Cobranças", "Relatórios"].map((l, i) => (
                      <div
                        key={l}
                        className={`text-xs px-3 py-2 rounded-md ${
                          i === 0 ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5"
                        }`}
                      >
                        {l}
                      </div>
                    ))}
                  </div>
                  <div className="col-span-9 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        ["Receita mensal", "R$ 184.520", "+12%"],
                        ["Frota ativa", "127 motos", "+4"],
                        ["Inadimplência", "2,1%", "-0,6%"],
                      ].map(([l, v, d]) => (
                        <div key={l} className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-left">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div>
                          <div className="text-lg font-semibold text-white mt-1">{v}</div>
                          <div className="text-xs text-emerald-400 mt-1">{d}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 h-44 flex items-end gap-2">
                      {[40, 65, 50, 78, 60, 90, 72, 85, 95, 80, 88, 100].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary/20"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="py-16 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-500 mb-10">
            Marcas que confiam na Wayvo
          </p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 items-center opacity-60">
            {["Velomotors", "RentBike", "MotoFrota", "UrbanRide", "DeliveryMax", "FrotaPlus"].map((b) => (
              <div
                key={b}
                className="text-center text-xl font-bold tracking-tight text-slate-300"
              >
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-medium text-primary mb-3">Funcionalidades</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Tudo o que sua locadora precisa, em uma só plataforma.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: Building2,
                title: "Multi-tenant avançado",
                desc: "Separação de dados blindada para frotas parceiras, com isolamento total por empresa.",
              },
              {
                icon: Wrench,
                title: "Gestão de frota e manutenção",
                desc: "Histórico completo, alertas de troca de óleo, pneus, revisões e vistorias.",
              },
              {
                icon: Wallet,
                title: "Financeiro automatizado",
                desc: "Controle de inadimplência, recorrência e alertas automáticos via WhatsApp e e-mail.",
              },
              {
                icon: FileSignature,
                title: "Contratos digitais",
                desc: "Emissão e assinatura eletrônica com validade jurídica e armazenamento seguro.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/10 transition-all"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section id="security" className="py-28 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-sm font-medium text-primary mb-3">Segurança</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              Sua operação protegida 24/7.
            </h2>
            <p className="mt-6 text-lg text-slate-400 leading-relaxed">
              Infraestrutura empresarial com criptografia ponta a ponta, backups automáticos
              e conformidade total com a LGPD. Sua frota e seus clientes em mãos seguras.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                ["99.9%", "Uptime garantido"],
                ["LGPD", "100% conforme"],
                ["AES-256", "Criptografia"],
                ["Daily", "Backups na nuvem"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                  <div className="text-2xl font-bold text-white">{k}</div>
                  <div className="text-sm text-slate-400">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-10">
              <Shield className="h-16 w-16 text-primary mb-6" />
              <div className="space-y-4">
                {[
                  { icon: Lock, t: "Criptografia AES-256 em repouso e em trânsito" },
                  { icon: CloudUpload, t: "Backups automáticos diários na nuvem" },
                  { icon: Activity, t: "Monitoramento 24/7 com alertas em tempo real" },
                  { icon: Shield, t: "Conformidade LGPD e auditoria de acessos" },
                ].map(({ icon: Icon, t }) => (
                  <div key={t} className="flex items-start gap-3">
                    <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-slate-300">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section id="benefits" className="py-28 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-medium text-primary mb-3">Benefícios</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Menos planilhas. Mais lucro. Mais tempo livre.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Clock,
                t: "+ Tempo livre",
                d: "Automação que elimina trabalho manual, planilhas e processos repetitivos.",
              },
              {
                icon: TrendingUp,
                t: "+ Lucratividade",
                d: "Visão clara de unit economics: receita por veículo, custos e margem líquida.",
              },
              {
                icon: Layers,
                t: "Escalabilidade",
                d: "Pronto para suportar de 5 a centenas de veículos sem perder controle.",
              },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-8">
                <Icon className="h-8 w-8 text-primary mb-5" />
                <h3 className="text-xl font-bold text-white mb-2">{t}</h3>
                <p className="text-slate-400 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-28 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-medium text-primary mb-3">FAQ</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Perguntas frequentes
            </h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {[
              {
                q: "O sistema serve para qualquer tamanho de locadora?",
                a: "Sim. A Wayvo foi desenhada para escalar de 5 a centenas de veículos, com planos que acompanham o crescimento da sua operação.",
              },
              {
                q: "Meus dados e os dos meus clientes estão seguros?",
                a: "Totalmente. Usamos criptografia AES-256, backups automáticos diários, monitoramento 24/7 e estamos em conformidade com a LGPD.",
              },
              {
                q: "Como funciona a migração de dados das minhas planilhas antigas?",
                a: "Nossa equipe faz a importação dos seus dados gratuitamente no onboarding, em até 48h, com validação completa antes do go-live.",
              },
              {
                q: "Existe suporte técnico disponível?",
                a: "Sim. Atendimento humano via WhatsApp e e-mail em horário comercial, com SLA garantido e base de conhecimento completa.",
              },
            ].map(({ q, a }) => (
              <AccordionItem
                key={q}
                value={q}
                className="border border-white/5 bg-white/[0.02] rounded-xl px-6 border-b"
              >
                <AccordionTrigger className="text-left text-white hover:no-underline">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="text-slate-400 leading-relaxed">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto rounded-3xl border border-white/10 bg-gradient-to-br from-primary/20 via-rose-500/10 to-transparent p-12 md:p-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(225,29,72,0.3),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Pronto para escalar sua locadora?
            </h2>
            <p className="mt-5 text-lg text-slate-300 max-w-xl mx-auto">
              Comece grátis em menos de 2 minutos. Sem cartão de crédito.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="bg-white text-slate-900 hover:bg-slate-200 rounded-full px-7 h-12"
              >
                <Link to="/signup">
                  Começar grátis <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-transparent border-white/15 text-white hover:bg-white/5 rounded-full px-7 h-12"
              >
                <Link to="/login">Já tenho conta</Link>
              </Button>
            </div>
            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-400">
              {["14 dias grátis", "Sem cartão", "Suporte humano"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-400" /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-14 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-10">
          <div>
            <WayvoLogo variant="dark" />
            <p className="mt-4 text-sm text-slate-400 max-w-xs">
              A plataforma definitiva para gerenciar e escalar sua locadora de veículos.
            </p>
          </div>
          {[
            { title: "Produto", links: [["Funcionalidades", "#features"], ["Benefícios", "#benefits"], ["Segurança", "#security"]] },
            { title: "Empresa", links: [["Sobre", "#"], ["Contato", "#"], ["Blog", "#"]] },
            { title: "Legal", links: [["Privacidade", "#"], ["Termos", "#"], ["LGPD", "#"]] },
          ].map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold text-white mb-4">{col.title}</div>
              <ul className="space-y-2">
                {col.links.map(([l, h]) => (
                  <li key={l}>
                    <a href={h} className="text-sm text-slate-400 hover:text-white transition-colors">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div>© {new Date().getFullYear()} Wayvo. Todos os direitos reservados.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Instagram</a>
            <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-white transition-colors">YouTube</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
