import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WayvoLogo } from "@/components/WayvoLogo";
import {
  ArrowRight,
  Menu,
  X,
  Shield,
  Wrench,
  Wallet,
  FileSignature,
  Activity,
  TrendingUp,
  MapPin,
  Bell,
  Users,
  BarChart3,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ============================================================
   Wayvo — Landing Page
   Brand tokens conforme Brandbook 2025
============================================================ */

const INSTAGRAM_URL = "https://www.instagram.com/joaojorge.midia";

const COLORS = {
  canvas: "#F0FFF8",
  surface: "#FFFFFF",
  primary: "#00C86A",
  primaryDark: "#00A658",
  ink: "#0A1810",
  muted: "#687A6E",
  border: "rgba(10, 24, 16, 0.08)",
  borderStrong: "rgba(10, 24, 16, 0.14)",
  alert: "#E5484D",
  amber: "#D97706",
};

const fontHead: React.CSSProperties = { fontFamily: "'Syne', sans-serif", fontWeight: 700, letterSpacing: "-0.02em" };
const fontBody: React.CSSProperties = { fontFamily: "'Figtree', sans-serif" };
const fontMono: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };

/** Alias local — usa o componente oficial */
function WayvoMark({ size = 28, variant = "light" }: { size?: number; variant?: "light" | "dark" }) {
  return <WayvoLogo size={size} variant={variant} />;
}



const NavLinks = ({ onClick }: { onClick?: () => void }) => (
  <>
    {[
      ["Produto", "#produto"],
      ["Funcionalidades", "#features"],
      ["Planos", "#planos"],
      ["Segurança", "#security"],
      ["Perguntas", "#faq"],
    ].map(([label, href]) => (
      <a
        key={href}
        href={href}
        onClick={onClick}
        style={{ ...fontBody, color: COLORS.ink }}
        className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
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
    const id = "wayvo-lp-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Figtree:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ ...fontBody, backgroundColor: COLORS.canvas, color: COLORS.ink }} className="min-h-screen w-full">
      {/* ============ HEADER ============ */}
      <header
        className="sticky top-0 z-50 w-full transition-all"
        style={{
          backgroundColor: scrolled ? "rgba(255,255,255,0.85)" : "rgba(240,255,248,0.7)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${scrolled ? COLORS.border : "transparent"}`,
        }}
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center">
            <WayvoMark size={32} />
          </a>
          <nav className="hidden md:flex items-center gap-8">
            <NavLinks />
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              style={{ ...fontBody, color: COLORS.ink }}
              className="text-sm font-medium px-4 py-2 hover:opacity-70 transition"
            >
              Entrar
            </Link>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...fontBody, backgroundColor: COLORS.ink, color: "#fff" }}
              className="text-sm font-semibold px-4 py-2 rounded-md hover:opacity-90 transition inline-flex items-center gap-1.5"
            >
              Solicitar acesso <ArrowRight size={14} />
            </a>
          </div>
          <button
            className="md:hidden p-2 rounded-md"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
            style={{ color: COLORS.ink }}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t" style={{ borderColor: COLORS.border, backgroundColor: COLORS.surface }}>
            <div className="px-5 py-5 flex flex-col gap-4">
              <NavLinks onClick={() => setOpen(false)} />
              <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: COLORS.border }}>
                <Link
                  to="/login"
                  className="text-sm font-medium px-4 py-2.5 rounded-md text-center"
                  style={{ border: `1px solid ${COLORS.borderStrong}`, color: COLORS.ink }}
                >
                  Entrar
                </Link>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold px-4 py-2.5 rounded-md text-center"
                  style={{ backgroundColor: COLORS.ink, color: "#fff" }}
                >
                  Solicitar acesso
                </a>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ============ HERO ============ */}
      <section id="top" className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(800px 400px at 80% -10%, rgba(0,200,106,0.12), transparent 60%), radial-gradient(600px 300px at 10% 10%, rgba(0,200,106,0.06), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
            <div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
                style={{
                  backgroundColor: "rgba(0,200,106,0.1)",
                  color: COLORS.primaryDark,
                  border: `1px solid rgba(0,200,106,0.25)`,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
                Gestão completa de locadora de motos
              </div>
              <h1
                style={{ ...fontHead, color: COLORS.ink, fontSize: "clamp(2.4rem, 5.5vw, 4.2rem)", lineHeight: 1.02 }}
                className="mb-6"
              >
                Você sabe quem te deve,{" "}
                <span style={{ color: COLORS.primary }}>quanto está entrando</span>{" "}
                <span style={{ color: COLORS.muted, fontWeight: 600 }}>e se sua locadora dá lucro?</span>
              </h1>
              <p
                style={{ ...fontBody, color: COLORS.muted, fontSize: "clamp(1.05rem, 1.6vw, 1.2rem)" }}
                className="max-w-xl leading-relaxed mb-8"
              >
                A Wayvo reúne cobranças em atraso, financeiro, contratos e frota em um só lugar.
                Sem planilha, sem achismo, sem ligação para saber quem pagou.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md font-semibold transition hover:opacity-90"
                  style={{ ...fontBody, backgroundColor: COLORS.primary, color: "#04200F", fontSize: 15 }}
                >
                  Testar grátis por 30 dias <ArrowRight size={16} />
                </a>
                <a
                  href="#produto"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md font-semibold transition hover:bg-black/5"
                  style={{ ...fontBody, color: COLORS.ink, border: `1px solid ${COLORS.borderStrong}`, fontSize: 15 }}
                >
                  Ver como funciona
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3" style={fontBody}>
                {[
                  ["Começa em 10 min", Activity],
                  ["30 dias grátis", Shield],
                  ["Cancele quando quiser", Users],
                ].map(([txt, Ico]: any) => (
                  <div key={txt} className="flex items-center gap-2 text-sm" style={{ color: COLORS.muted }}>
                    <Ico size={15} style={{ color: COLORS.primary }} />
                    {txt}
                  </div>
                ))}
              </div>
            </div>

            {/* HERO MOCKUP — tabela do produto */}
            <ProductMock />
          </div>
        </div>
      </section>

      {/* ============ KPI BAR ============ */}
      <section style={{ backgroundColor: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}` }}>
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            ["1 lugar", "para toda a operação"],
            ["30 dias", "grátis para testar"],
            ["10 min", "para começar"],
            ["R$ 0", "taxa de setup"],
          ].map(([n, l]) => (
            <div key={l} className="text-center md:text-left">
              <div style={{ ...fontMono, color: COLORS.ink, fontSize: 30 }}>{n}</div>
              <div style={{ ...fontBody, color: COLORS.muted, fontSize: 13 }} className="mt-1">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ PRODUTO — 4 dores ============ */}
      <section id="produto" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl mb-14">
            <p style={{ ...fontMono, color: COLORS.primary, fontSize: 13 }} className="mb-3">// O QUE A WAYVO RESOLVE</p>
            <h2 style={{ ...fontHead, color: COLORS.ink, fontSize: "clamp(2rem, 3.5vw, 2.8rem)", lineHeight: 1.05 }}>
              Quatro perguntas que todo dono de locadora precisa conseguir responder.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                icon: Bell,
                title: "Quem me deve e quanto?",
                desc: "Painel semanal com todos os clientes em atraso, valor pendente e dias de atraso. Você vê de um olhar, sem ligar para ninguém.",
                metric: "R$ 3.488,12",
                metricLabel: "exemplo de atraso mapeado em uma semana",
              },
              {
                icon: Wallet,
                title: "Minha locadora está dando lucro?",
                desc: "Financeiro completo com receitas, despesas, saldo real em caixa e projeção do mês. Integrado com múltiplas contas bancárias.",
                metric: "R$ 8.073,58",
                metricLabel: "receitas organizadas e categorizadas",
              },
              {
                icon: Activity,
                title: "Minha frota está em dia?",
                desc: "Locações ativas, contratos com vencimento próximo, manutenções pendentes e alertas de troca de óleo, tudo centralizado.",
                metric: "25 contratos",
                metricLabel: "ativos e finalizados com histórico completo",
              },
              {
                icon: FileSignature,
                title: "Meus clientes estão organizados?",
                desc: "Cadastro completo com OCR de CNH, histórico de locações e vistorias de entrada e saída registradas por foto.",
                metric: "176 lançamentos",
                metricLabel: "financeiros organizados automaticamente",
              },
            ].map(({ icon: Icon, title, desc, metric, metricLabel }) => (
              <div
                key={title}
                className="p-7 rounded-lg transition hover:-translate-y-0.5"
                style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
              >
                <div
                  className="w-10 h-10 rounded-md flex items-center justify-center mb-5"
                  style={{ backgroundColor: "rgba(0,200,106,0.12)", color: COLORS.primaryDark }}
                >
                  <Icon size={18} />
                </div>
                <h3 style={{ ...fontHead, color: COLORS.ink, fontSize: 20 }} className="mb-2">{title}</h3>
                <p style={{ ...fontBody, color: COLORS.muted, fontSize: 14.5 }} className="leading-relaxed mb-5">{desc}</p>
                <div className="pt-4 border-t flex items-baseline gap-3" style={{ borderColor: COLORS.border }}>
                  <span style={{ ...fontMono, color: COLORS.ink, fontSize: 18 }}>{metric}</span>
                  <span style={{ ...fontBody, color: COLORS.muted, fontSize: 12 }}>{metricLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES DETALHADAS ============ */}
      <section id="features" style={{ backgroundColor: COLORS.surface }} className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl mb-14">
            <p style={{ ...fontMono, color: COLORS.primary, fontSize: 13 }} className="mb-3">// O QUE ESTÁ INCLUSO</p>
            <h2 style={{ ...fontHead, color: COLORS.ink, fontSize: "clamp(2rem, 3.5vw, 2.8rem)", lineHeight: 1.05 }}>
              Tudo em um lugar. Sem módulo extra, sem custo escondido.
            </h2>
            <p style={{ ...fontBody, color: COLORS.muted, fontSize: 16 }} className="mt-4 leading-relaxed">
              Um sistema feito para quem opera de verdade. Do primeiro cadastro ao fechamento do mês.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-px" style={{ backgroundColor: COLORS.border }}>
            {[
              [Wallet, "Financeiro completo", "Receitas, despesas, categorias, conciliação e DRE mensal da locadora. Tudo em um painel."],
              [BarChart3, "Visão geral (Dashboard)", "KPIs em tempo real: faturamento, inadimplência, margem por moto e ocupação da frota."],
              [TrendingUp, "Pagamentos integrados", "Geração de boleto e PIX via Asaas com baixa automática e confirmação de pagamento."],
              [FileSignature, "Locações e contratos", "Contratos digitais com assinatura eletrônica, vencimento automático e renovação em 1 clique."],
              [Users, "Cadastro de clientes", "OCR da CNH com preenchimento automático, histórico de locações e score de inadimplência."],
              [Activity, "Gestão de motos", "Frota completa com patrimônio, status, margem por veículo e controle de veículos vendidos."],
              [Wrench, "Manutenções", "Ordens de serviço abertas, histórico de revisões e alertas de vencimento por km ou data."],
              [MapPin, "Rastreamento GPS", "Localização em tempo real, cerca virtual e histórico de rotas de toda a frota."],
              [Bell, "Multas e DETRAN", "Consulta automática de infrações, importação direta para o sistema e indicação de condutor."],
            ].map(([Ico, title, desc]: any) => (
              <div key={title} className="p-8" style={{ backgroundColor: COLORS.surface }}>
                <Ico size={22} style={{ color: COLORS.primary }} className="mb-4" />
                <h3 style={{ ...fontHead, color: COLORS.ink, fontSize: 17 }} className="mb-2">{title}</h3>
                <p style={{ ...fontBody, color: COLORS.muted, fontSize: 14 }} className="leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ["Troca de óleo", "Alertas de 10w30 por km e por data. Nunca perca uma revisão."],
              ["Vistorias", "Checklist fotográfico de entrada e saída com registro em nuvem."],
              ["Cobranças automáticas", "Régua de cobrança por atraso com controle de inadimplência e histórico de pendências."],
              ["Relatórios", "Relatórios consolidados de frota, financeiro e inadimplência exportáveis."],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="p-5 rounded-lg"
                style={{ backgroundColor: "rgba(0,200,106,0.04)", border: `1px solid rgba(0,200,106,0.15)` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
                  <h4 style={{ ...fontHead, color: COLORS.ink, fontSize: 14 }}>{title}</h4>
                </div>
                <p style={{ ...fontBody, color: COLORS.muted, fontSize: 13 }} className="leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="planos" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p style={{ ...fontMono, color: COLORS.primary, fontSize: 13 }} className="mb-3">// PLANOS</p>
            <h2 style={{ ...fontHead, color: COLORS.ink, fontSize: "clamp(2rem, 3.5vw, 2.8rem)", lineHeight: 1.05 }} className="mb-4">
              Simples assim.
            </h2>
            <p style={{ ...fontBody, color: COLORS.muted, fontSize: 16 }}>
              Um plano. Sem fidelidade, sem taxa de setup, sem surpresa na fatura.
            </p>
          </div>

          <div className="max-w-md mx-auto">

            {/* Plano Starter */}
            <div
              className="rounded-xl p-8 flex flex-col relative"
              style={{ backgroundColor: COLORS.ink, border: `2px solid ${COLORS.primary}` }}
            >
              <div
                className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: COLORS.primary, color: "#04200F", ...fontBody }}
              >
                Disponível agora
              </div>
              <div className="mb-6">
                <p style={{ ...fontMono, color: COLORS.primary, fontSize: 12 }} className="mb-2 uppercase tracking-widest">Starter</p>
                <div className="flex items-end gap-1 mb-1">
                  <span style={{ ...fontHead, color: "#fff", fontSize: 48, lineHeight: 1 }}>R$ 47,90</span>
                  <span style={{ ...fontBody, color: "rgba(255,255,255,0.6)", fontSize: 14 }} className="mb-1">/mês</span>
                </div>
                <p style={{ ...fontBody, color: "rgba(255,255,255,0.55)", fontSize: 13.5 }}>Para frotas de até 20 motos</p>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {[
                  "Gestão de frota (até 20 motos)",
                  "Locações e contratos digitais",
                  "Cadastro de clientes com OCR",
                  "Financeiro completo",
                  "Dashboard e visão geral",
                  "Manutenções e troca de óleo",
                  "Controle de cobranças e inadimplência",
                  "Relatórios consolidados",
                  "Suporte via e-mail",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span style={{ color: COLORS.primary, marginTop: 2 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    <span style={{ ...fontBody, color: "rgba(255,255,255,0.8)", fontSize: 14 }}>{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center px-5 py-3.5 rounded-md font-semibold text-sm transition hover:opacity-90"
                style={{ backgroundColor: COLORS.primary, color: "#04200F", ...fontBody, fontSize: 15 }}
              >
                Testar grátis por 30 dias
              </a>
            </div>

          </div>

          <div className="text-center mt-8 space-y-2">
            <p style={{ ...fontBody, color: COLORS.ink, fontSize: 14, fontWeight: 600 }}>
              30 dias grátis com cadastro de cartão
            </p>
            <p style={{ ...fontBody, color: COLORS.muted, fontSize: 13 }}>
              A cobrança começa apenas após o período de teste. Processamento seguro via Asaas. Cancele quando quiser.
            </p>
          </div>
        </div>
      </section>

      {/* ============ SECURITY ============ */}
      <section id="security" style={{ backgroundColor: COLORS.ink, color: "#fff" }} className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p style={{ ...fontMono, color: COLORS.primary, fontSize: 13 }} className="mb-3">// SEGURANÇA</p>
            <h2 style={{ ...fontHead, fontSize: "clamp(2rem, 3.5vw, 2.8rem)", lineHeight: 1.05 }} className="mb-6">
              Sua operação blindada. Seus dados, intocáveis.
            </h2>
            <p style={{ ...fontBody, color: "rgba(255,255,255,0.7)", fontSize: 16 }} className="leading-relaxed mb-8">
              Infraestrutura corporativa com isolamento por empresa, criptografia em trânsito e em repouso, e
              backups automáticos. Conformidade total com a LGPD.
            </p>
            <div className="grid grid-cols-2 gap-5">
              {[
                ["LGPD", "Conformidade total"],
                ["TLS 1.3", "Criptografia em trânsito"],
                ["AES-256", "Criptografia em repouso"],
                ["RLS", "Isolamento por empresa"],
              ].map(([k, v]) => (
                <div key={k} className="p-4 rounded-md" style={{ border: `1px solid rgba(255,255,255,0.12)` }}>
                  <div style={{ ...fontMono, fontSize: 15, color: COLORS.primary }}>{k}</div>
                  <div style={{ ...fontBody, color: "rgba(255,255,255,0.65)", fontSize: 13 }} className="mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-8 rounded-lg" style={{ border: `1px solid rgba(255,255,255,0.12)`, backgroundColor: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-center gap-3 mb-6">
              <Shield size={20} style={{ color: COLORS.primary }} />
              <div style={{ ...fontMono, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>SISTEMA DE PROTEÇÃO</div>
            </div>
            {[
              ["Auditoria de ações", "Ativa"],
              ["2FA obrigatório (admin)", "Ativa"],
              ["Backup diário", "Última: 03:00"],
              ["Monitoramento de acesso", "24/7"],
              ["Política de retenção", "7 anos"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
                <span style={{ ...fontBody, fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{k}</span>
                <span style={{ ...fontMono, fontSize: 12.5, color: COLORS.primary }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="text-center mb-12">
            <p style={{ ...fontMono, color: COLORS.primary, fontSize: 13 }} className="mb-3">// PERGUNTAS FREQUENTES</p>
            <h2 style={{ ...fontHead, color: COLORS.ink, fontSize: "clamp(2rem, 3.5vw, 2.6rem)", lineHeight: 1.05 }}>
              Tudo o que você precisa saber.
            </h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {[
              ["Em quanto tempo consigo colocar minha frota no ar?", "O setup leva em média 10 minutos. Você cadastra a empresa, importa suas motos (manual, planilha ou OCR do CRLV) e já começa a operar."],
              ["Como funciona o controle de cobranças?", "O sistema registra e organiza todas as cobranças em atraso, com histórico completo e painel de inadimplência por locatário."],
              ["Vocês emitem contrato com validade jurídica?", "Sim. Contratos digitais com assinatura eletrônica conforme MP 2.200-2 e LGPD. Aceitos por cartórios e tribunais."],
              ["Como funciona o período de teste?", "Todos os planos incluem 30 dias grátis. É necessário cadastrar um cartão de crédito para ativar o teste. A cobrança só começa no 31º dia. Você pode cancelar antes disso sem pagar nada."],
              ["Como funciona o pagamento?", "As cobranças são processadas via Asaas, plataforma de pagamentos líder no Brasil. Você recebe uma notificação antes de cada cobrança e pode gerenciar sua assinatura a qualquer momento."],
              ["E se eu tiver mais de uma empresa/franquia?", "O plano Enterprise oferece arquitetura multi-tenant com isolamento total de dados por sub-empresa."],
              ["Vocês integram com meu sistema atual?", "Sim, via API REST no plano Enterprise. Também aceitamos importação por planilha em todos os planos."],
            ].map(([q, a], i) => (
              <AccordionItem key={i} value={`q${i}`} style={{ borderColor: COLORS.border }}>
                <AccordionTrigger
                  style={{ ...fontBody, color: COLORS.ink, fontSize: 16, fontWeight: 600 }}
                  className="text-left hover:no-underline"
                >
                  {q}
                </AccordionTrigger>
                <AccordionContent style={{ ...fontBody, color: COLORS.muted, fontSize: 14.5 }} className="leading-relaxed">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="pb-20 sm:pb-28">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div
            className="relative overflow-hidden rounded-2xl p-10 sm:p-16 text-center"
            style={{
              backgroundColor: COLORS.ink,
              backgroundImage:
                "radial-gradient(500px 250px at 80% 0%, rgba(0,200,106,0.22), transparent 60%), radial-gradient(400px 200px at 0% 100%, rgba(0,200,106,0.12), transparent 60%)",
            }}
          >
            <p style={{ ...fontMono, color: COLORS.primary, fontSize: 12 }} className="mb-4 tracking-widest">
              CONTROLE · CLAREZA · RESULTADO
            </p>
            <h2 style={{ ...fontHead, color: "#fff", fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.05 }} className="mb-4 max-w-2xl mx-auto">
              Pare de operar no escuro.
            </h2>
            <p style={{ ...fontBody, color: "rgba(255,255,255,0.7)", fontSize: 16 }} className="mb-8 max-w-xl mx-auto">
              Experimente 30 dias grátis e veja exatamente quanto entra, quanto sai e quem te deve.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md font-semibold hover:opacity-90 transition"
                style={{ ...fontBody, backgroundColor: COLORS.primary, color: "#04200F", fontSize: 15 }}
              >
                Testar grátis por 30 dias <ArrowRight size={16} />
              </a>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md font-semibold transition"
                style={{
                  ...fontBody,
                  color: "#fff",
                  border: `1px solid rgba(255,255,255,0.25)`,
                  fontSize: 15,
                }}
              >
                Já sou cliente
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer style={{ backgroundColor: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}>
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-12 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <WayvoMark size={32} />
            <p style={{ ...fontBody, color: COLORS.muted, fontSize: 13 }} className="mt-4 leading-relaxed max-w-xs">
              A plataforma de gestão para locadoras de motos que decidem com dado.
            </p>
          </div>
          {[
            ["Produto", [["Funcionalidades", "#features"], ["Planos", "#planos"], ["Segurança", "#security"]]],
            ["Empresa", [["Sobre", "#"], ["Contato", "#"], ["Blog", "#"]]],
            ["Legal", [["Privacidade", "#"], ["Termos", "#"], ["LGPD", "#"]]],
          ].map(([title, items]: any) => (
            <div key={title}>
              <div style={{ ...fontHead, color: COLORS.ink, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em" }} className="mb-4">
                {title}
              </div>
              <ul className="space-y-2.5">
                {items.map(([label, href]: any) => (
                  <li key={label}>
                    <a href={href} style={{ ...fontBody, color: COLORS.muted, fontSize: 13.5 }} className="hover:opacity-70">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t" style={{ borderColor: COLORS.border }}>
          <div className="mx-auto max-w-7xl px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p style={{ ...fontBody, color: COLORS.muted, fontSize: 12.5 }}>
              © {new Date().getFullYear()} Wayvo. Todos os direitos reservados.
            </p>
            <p style={{ ...fontMono, color: COLORS.muted, fontSize: 11.5 }}>
              feito para quem opera de verdade.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================
   ProductMock — tabela visual do sistema
========================================================= */
function ProductMock() {
  const rows = [
    ["ABC-1D23", "Honda CG 160 Fan", "Alugada", "57,3%", COLORS.primary],
    ["DEF-4G56", "Yamaha Factor 150", "Alugada", "61,8%", COLORS.primary],
    ["GHI-7J89", "Honda Biz 125", "Vistoria", "—", COLORS.amber],
    ["JKL-0M12", "Yamaha YBR 150", "Alugada", "48,2%", COLORS.primary],
    ["MNO-3P45", "Honda CG 160 Start", "Inadimplente", "12,4%", COLORS.alert],
    ["PQR-6S78", "Honda Pop 110i", "Disponível", "—", COLORS.muted],
  ];
  return (
    <div className="relative">
      <div
        className="absolute -inset-4 rounded-2xl pointer-events-none"
        style={{ background: "radial-gradient(60% 60% at 50% 0%, rgba(0,200,106,0.18), transparent 70%)" }}
        aria-hidden
      />
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.borderStrong}`,
          boxShadow: "0 20px 60px -20px rgba(10,24,16,0.18)",
        }}
      >
        {/* Window bar */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#FF5F57" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#FEBC2E" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#28C840" }} />
          </div>
          <div style={{ ...fontMono, color: COLORS.muted, fontSize: 11 }}>app.wayvo.com.br / frota</div>
          <div className="w-12" />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-px" style={{ backgroundColor: COLORS.border }}>
          {[
            ["Frota ativa", "25", "contratos"],
            ["Recebido em junho", "R$ 8.073", "9 em atraso"],
            ["Em atraso", "R$ 3.488", "6 clientes"],
          ].map(([l, v, s]) => (
            <div key={l} className="p-4" style={{ backgroundColor: COLORS.surface }}>
              <div style={{ ...fontBody, color: COLORS.muted, fontSize: 11 }} className="uppercase tracking-wider">{l}</div>
              <div style={{ ...fontMono, color: COLORS.ink, fontSize: 20 }} className="mt-1">{v}</div>
              <div style={{ ...fontBody, color: COLORS.primary, fontSize: 11.5 }} className="mt-0.5">{s}</div>
            </div>
          ))}
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_1.6fr_1fr_0.8fr] gap-3 px-5 py-2.5" style={{ borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}`, backgroundColor: "#FAFCFB" }}>
          {["Placa", "Modelo", "Status", "Margem"].map(h => (
            <div key={h} style={{ ...fontBody, color: COLORS.muted, fontSize: 11 }} className="uppercase tracking-wider">{h}</div>
          ))}
        </div>

        {/* Rows */}
        {rows.map(([placa, modelo, status, margem, c], i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1.6fr_1fr_0.8fr] gap-3 px-5 py-3 items-center"
            style={{ borderBottom: i === rows.length - 1 ? "none" : `1px solid ${COLORS.border}` }}
          >
            <div style={{ ...fontMono, color: COLORS.ink, fontSize: 13 }}>{placa}</div>
            <div style={{ ...fontBody, color: COLORS.ink, fontSize: 13.5 }}>{modelo}</div>
            <div className="flex">
              <span
                style={{
                  ...fontBody,
                  fontSize: 11.5,
                  color: c as string,
                  backgroundColor: `${c}1A`,
                  border: `0.5px solid ${c}40`,
                }}
                className="px-2 py-0.5 rounded-full font-medium"
              >
                {status}
              </span>
            </div>
            <div style={{ ...fontMono, color: COLORS.ink, fontSize: 13 }}>{margem}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

