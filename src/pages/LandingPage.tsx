import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import wayvoLogoLight from "@/assets/wayvo-logo-light.png";
import wayvoLogoDark from "@/assets/wayvo-logo-dark.png";
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
  Check,
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
   Brand tokens locais (não afetam o app autenticado)
   - Canvas: #F0FFF8 / #FFFFFF
   - Primary: #00C86A
   - Ink: #0A1810
   - Muted: #687A6E
   - Headings: Syne 700 (lowercase para marca)
   - Body: Figtree 400/500
   - Dados: DM Mono 400
============================================================ */

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

function WayvoMark({ size = 28, variant = "light" }: { size?: number; variant?: "light" | "dark" }) {
  // Logo oficial WAYVO — usa PNG do brandbook
  // Proporção original ~1120x320 → ratio 3.5
  const src = variant === "dark" ? wayvoLogoDark : wayvoLogoLight;
  const height = size;
  return (
    <img
      src={src}
      alt="wayvo"
      height={height}
      style={{ height, width: "auto", display: "block" }}
    />
  );
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
            <WayvoMark size={34} />
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
            <Link
              to="/signup"
              style={{ ...fontBody, backgroundColor: COLORS.ink, color: "#fff" }}
              className="text-sm font-semibold px-4 py-2 rounded-md hover:opacity-90 transition inline-flex items-center gap-1.5"
            >
              Criar conta <ArrowRight size={14} />
            </Link>
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
                <Link
                  to="/signup"
                  className="text-sm font-semibold px-4 py-2.5 rounded-md text-center"
                  style={{ backgroundColor: COLORS.ink, color: "#fff" }}
                >
                  Criar conta grátis
                </Link>
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
                Plataforma de gestão de frota de motos
              </div>
              <h1
                style={{ ...fontHead, color: COLORS.ink, fontSize: "clamp(2.4rem, 5.5vw, 4.2rem)", lineHeight: 1.02 }}
                className="mb-6"
              >
                O gestor que decide com dado{" "}
                <span style={{ color: COLORS.primary }}>chega mais longe.</span>
              </h1>
              <p
                style={{ ...fontBody, color: COLORS.muted, fontSize: "clamp(1.05rem, 1.6vw, 1.2rem)" }}
                className="max-w-xl leading-relaxed mb-8"
              >
                Controle sua frota, automatize cobranças, gerencie contratos e escale sua operação de locação
                com segurança e previsibilidade.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md font-semibold transition hover:opacity-90"
                  style={{ ...fontBody, backgroundColor: COLORS.primary, color: "#04200F", fontSize: 15 }}
                >
                  Começar agora <ArrowRight size={16} />
                </Link>
                <a
                  href="#produto"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md font-semibold transition hover:bg-black/5"
                  style={{ ...fontBody, color: COLORS.ink, border: `1px solid ${COLORS.borderStrong}`, fontSize: 15 }}
                >
                  Ver produto
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3" style={fontBody}>
                {[
                  ["Setup em 10 min", Activity],
                  ["LGPD compliant", Shield],
                  ["Suporte humano", Users],
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
            ["-42%", "inadimplência média"],
            ["+57%", "margem por ativo"],
            ["10min", "setup inicial"],
            ["24/7", "monitoramento de frota"],
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
              Quatro dores reais. Uma plataforma que entende a sua operação.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                icon: BarChart3,
                title: "Visão Geral / Faturamento",
                desc: "Monitoramento em tempo real do faturamento bruto, inadimplência e unit economics por veículo.",
                metric: "R$ 84.320,00",
                metricLabel: "faturamento do mês",
              },
              {
                icon: MapPin,
                title: "Localizações e Cobranças",
                desc: "Redução drástica da inadimplência com régua de cobrança automatizada via WhatsApp.",
                metric: "12 cobranças",
                metricLabel: "enviadas automaticamente hoje",
              },
              {
                icon: Wrench,
                title: "Operações de Frota",
                desc: "Controle rigoroso de vistorias, manutenções preventivas e rastreamento GPS em tempo real.",
                metric: "3 alertas",
                metricLabel: "troca de óleo 10w30 pendente",
              },
              {
                icon: FileSignature,
                title: "Clientes e Contratos",
                desc: "Cadastro blindado com OCR de CNH/CRLV e contratos digitais com validade jurídica.",
                metric: "127 contratos",
                metricLabel: "ativos com assinatura digital",
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
            <p style={{ ...fontMono, color: COLORS.primary, fontSize: 13 }} className="mb-3">// FUNCIONALIDADES</p>
            <h2 style={{ ...fontHead, color: COLORS.ink, fontSize: "clamp(2rem, 3.5vw, 2.8rem)", lineHeight: 1.05 }}>
              Dado, decisão, destino — em um só lugar.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-px" style={{ backgroundColor: COLORS.border }}>
            {[
              [Wallet, "Régua de cobrança automática", "Avisos de atraso e segunda via via WhatsApp sem você levantar o dedo."],
              [Activity, "Rastreamento GPS", "Localização em tempo real, cerca virtual e histórico de rotas por veículo."],
              [Wrench, "Manutenção preventiva", "Alertas de troca de óleo 10w30, pneus 90/90-18, pastilhas e correntes."],
              [FileSignature, "Contratos digitais", "Geração automática com assinatura eletrônica e validade jurídica."],
              [TrendingUp, "Unit economics", "Receita por ativo, margem líquida por veículo e ponto de equilíbrio."],
              [Bell, "Multas e antecedentes", "Consulta automática, notificação ao locatário e indicação de condutor."],
            ].map(([Ico, title, desc]: any) => (
              <div key={title} className="p-8" style={{ backgroundColor: COLORS.surface }}>
                <Ico size={22} style={{ color: COLORS.primary }} className="mb-4" />
                <h3 style={{ ...fontHead, color: COLORS.ink, fontSize: 17 }} className="mb-2">{title}</h3>
                <p style={{ ...fontBody, color: COLORS.muted, fontSize: 14 }} className="leading-relaxed">{desc}</p>
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
              Preço por unidade ativa. Você cresce, a gente acompanha.
            </h2>
            <p style={{ ...fontBody, color: COLORS.muted, fontSize: 16 }}>
              Sem fidelidade. Sem setup fee. Sem surpresa na fatura.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {/* START */}
            <PricingCard
              name="Start"
              tagline="Operação Inicial"
              description="Para quem está validando a primeira frota."
              price="R$ 97"
              suffix="/mês"
              unit="até 8 motos"
              features={[
                "Gestão de frota básica",
                "Alertas essenciais",
                "Emissão de contratos digitais",
                "Cadastro de clientes com OCR",
                "Suporte por e-mail",
              ]}
              cta="Começar grátis"
              ctaHref="/signup"
            />

            {/* PRO */}
            <PricingCard
              highlight
              name="Pro"
              tagline="Frota Escala"
              description="O mais vendido. Pague pelo que você opera."
              price="R$ 1,90"
              suffix="/moto/dia"
              unit="frota recomendada: 10 a 30 motos"
              features={[
                "Tudo do Start",
                "Cobrança recorrente automática (WhatsApp)",
                "Unit economics por veículo",
                "Manutenção preventiva (óleo, pneus, pastilhas)",
                "Rastreamento GPS em tempo real",
                "Multas e antecedentes",
                "Suporte prioritário",
              ]}
              cta="Assinar Pro"
              ctaHref="/signup"
            />

            {/* ENTERPRISE */}
            <PricingCard
              name="Enterprise"
              tagline="Multi-Tenant"
              description="Franqueadoras e frotas de elite."
              price="Sob consulta"
              suffix=""
              unit="frotas acima de 50 motos"
              features={[
                "Tudo do Pro",
                "Isolamento de dados por tenant",
                "Suporte premium 24/7",
                "Integrações via API sob demanda",
                "Customização de regras de negócio",
                "Onboarding dedicado",
              ]}
              cta="Falar com especialista"
              ctaHref="/signup"
            />
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
              ["Como funciona a cobrança automática?", "A régua de cobrança envia avisos via WhatsApp em D-1, D+0, D+3 e D+7. Tudo configurável. Sem ação manual."],
              ["Vocês emitem contrato com validade jurídica?", "Sim. Contratos digitais com assinatura eletrônica conforme MP 2.200-2 e LGPD. Aceitos por cartórios e tribunais."],
              ["Posso testar antes de pagar?", "Sim. O plano Start tem 14 dias grátis. Sem cartão de crédito."],
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
            <h2 style={{ ...fontHead, color: "#fff", fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.05 }} className="mb-4 max-w-2xl mx-auto">
              Pare de gerenciar sua frota no improviso.
            </h2>
            <p style={{ ...fontBody, color: "rgba(255,255,255,0.7)", fontSize: 16 }} className="mb-8 max-w-xl mx-auto">
              Comece grátis hoje. Sem cartão de crédito. Sem fidelidade.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md font-semibold hover:opacity-90 transition"
                style={{ ...fontBody, backgroundColor: COLORS.primary, color: "#04200F", fontSize: 15 }}
              >
                Criar conta grátis <ArrowRight size={16} />
              </Link>
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
            <WayvoMark size={40} />
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
            ["Frota total", "127", "motos"],
            ["Faturamento mês", "R$ 84.320", "+12,4%"],
            ["Inadimplência", "3,2%", "-1,8 pp"],
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

/* =========================================================
   PricingCard
========================================================= */
function PricingCard({
  name, tagline, description, price, suffix, unit, features, cta, ctaHref, highlight,
}: {
  name: string;
  tagline: string;
  description: string;
  price: string;
  suffix: string;
  unit: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="relative p-8 rounded-xl flex flex-col"
      style={{
        backgroundColor: highlight ? COLORS.ink : COLORS.surface,
        border: highlight ? `1px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
        boxShadow: highlight ? "0 20px 50px -20px rgba(0,200,106,0.35)" : "none",
      }}
    >
      {highlight && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full"
          style={{ ...fontMono, backgroundColor: COLORS.primary, color: "#04200F", fontSize: 11 }}
        >
          MAIS VENDIDO
        </div>
      )}
      <div className="mb-1" style={{ ...fontMono, color: highlight ? COLORS.primary : COLORS.muted, fontSize: 11 }}>
        {tagline.toUpperCase()}
      </div>
      <h3 style={{ ...fontHead, color: highlight ? "#fff" : COLORS.ink, fontSize: 26 }}>{name}</h3>
      <p style={{ ...fontBody, color: highlight ? "rgba(255,255,255,0.65)" : COLORS.muted, fontSize: 13.5 }} className="mt-1.5 mb-6">
        {description}
      </p>

      <div className="mb-1 flex items-baseline gap-1.5">
        <span style={{ ...fontMono, color: highlight ? "#fff" : COLORS.ink, fontSize: 34, lineHeight: 1 }}>{price}</span>
        {suffix && (
          <span style={{ ...fontBody, color: highlight ? "rgba(255,255,255,0.6)" : COLORS.muted, fontSize: 14 }}>{suffix}</span>
        )}
      </div>
      <div style={{ ...fontBody, color: highlight ? "rgba(255,255,255,0.5)" : COLORS.muted, fontSize: 12 }} className="mb-7">
        {unit}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2.5">
            <Check size={15} style={{ color: COLORS.primary, marginTop: 3, flexShrink: 0 }} />
            <span style={{ ...fontBody, color: highlight ? "rgba(255,255,255,0.85)" : COLORS.ink, fontSize: 14 }}>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        to={ctaHref}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md font-semibold transition hover:opacity-90"
        style={
          highlight
            ? { ...fontBody, backgroundColor: COLORS.primary, color: "#04200F", fontSize: 14 }
            : { ...fontBody, backgroundColor: COLORS.ink, color: "#fff", fontSize: 14 }
        }
      >
        {cta} <ArrowRight size={14} />
      </Link>
    </div>
  );
}
