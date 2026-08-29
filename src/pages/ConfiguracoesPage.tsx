import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Settings, CreditCard, CheckCircle2, XCircle, ShieldCheck, Car, Receipt, FileSignature, Eye, EyeOff, Landmark, MessageCircle, Droplets, Search, Wrench } from "lucide-react";
import AsaasConfigDialog from "@/components/AsaasConfigDialog";
import DetranConfigDialog from "@/components/DetranConfigDialog";
import SicoobConfigDialog from "@/components/SicoobConfigDialog";
import { AsaasConfig, DetranConfig, CobrancaConfig, SicoobConfig, WhatsappConfig, DEFAULT_COBRANCA_CONFIG, DEFAULT_WHATSAPP_CONFIG } from "@/lib/companies";
import { useBankAccounts } from "@/hooks/useSupabaseData";
import { seedDefaultCategorizationRules } from "@/lib/categorization-rules-seed";
import { toast } from "sonner";
import { CollectionRulesSection } from "@/components/settings/CollectionRulesSection";
import { OilConfigSection } from "@/components/settings/OilConfigSection";
import { VistoriaConfigSection } from "@/components/settings/VistoriaConfigSection";
import { ManutencoesConfigSection } from "@/components/settings/ManutencoesConfigSection";

const TAB_VALUES = ["geral", "regua", "oleo", "vistoria", "manutencoes"] as const;
type TabValue = typeof TAB_VALUES[number];

export default function ConfiguracoesPage() {
  const { activeCompany, updateAsaasConfig, updateDetranConfig, updateCobrancaConfig, updateAutentiqueConfig, updateSicoobConfig, updateWhatsappConfig } = useCompany();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const defaultTab: TabValue = (TAB_VALUES as readonly string[]).includes(requestedTab || "") ? (requestedTab as TabValue) : "geral";
  // Controlado (não só defaultValue): navegar pelo menu lateral pra cá de novo só muda a
  // query string, não remonta a página — sem isso o clique em "Manutenções › Gerenciar"
  // não trocaria de aba se Configurações já estivesse aberta (mesmo padrão de MotosPage).
  const [activeTab, setActiveTab] = useState<TabValue>(defaultTab);
  useEffect(() => { setActiveTab(defaultTab); }, [requestedTab]);
  const { data: bankAccounts, save: saveBankAccount } = useBankAccounts();
  const [asaasOpen, setAsaasOpen] = useState(false);
  const [detranOpen, setDetranOpen] = useState(false);
  const [sicoobOpen, setSicoobOpen] = useState(false);
  const [showAutToken, setShowAutToken] = useState(false);
  const [autToken, setAutToken] = useState(activeCompany?.autentiqueConfig?.token || "");

  const asaasCfg = activeCompany?.asaasConfig;
  const detranCfg = activeCompany?.detranConfig;
  const sicoobCfg = activeCompany?.sicoobConfig;
  const cobrancaCfg = activeCompany?.cobrancaConfig ?? DEFAULT_COBRANCA_CONFIG;
  const [multaValue, setMultaValue] = useState(String(cobrancaCfg.multaAtraso));
  const [jurosValue, setJurosValue] = useState(String(cobrancaCfg.jurosDiario));
  const [jurosMesValue, setJurosMesValue] = useState(String(cobrancaCfg.jurosMes ?? 0));

  const whatsappCfg = activeCompany?.whatsappConfig ?? DEFAULT_WHATSAPP_CONFIG;
  const [waEnabled, setWaEnabled] = useState(whatsappCfg.enabled);
  const [waInstanceId, setWaInstanceId] = useState(whatsappCfg.instanceId || "");
  const [waToken, setWaToken] = useState(whatsappCfg.token || "");
  const [waClientToken, setWaClientToken] = useState(whatsappCfg.clientToken || "");
  const [showWaToken, setShowWaToken] = useState(false);
  const [waMaxPerWeek, setWaMaxPerWeek] = useState(String(whatsappCfg.maxMessagesPerClientPerWeek));
  const [waHourStart, setWaHourStart] = useState(String(whatsappCfg.businessHoursStart));
  const [waHourEnd, setWaHourEnd] = useState(String(whatsappCfg.businessHoursEnd));

  const handleSaveAsaas = async (config: AsaasConfig) => {
    await updateAsaasConfig(activeCompany.id, config);
    // Cria a conta "Asaas" automaticamente ao associar a API, se ainda não existir —
    // sem ela, o dinheiro recebido via Asaas não tem onde ser lançado em Contas.
    const jaTemContaAsaas = bankAccounts.some(a => a.nome === "Asaas" || a.banco === "Asaas");
    if (config.enabled && config.apiKey && !jaTemContaAsaas) {
      await saveBankAccount({
        id: crypto.randomUUID(),
        nome: "Asaas",
        banco: "Asaas",
        saldoInicial: 0,
        tipo: "banco",
        diaFechamento: null,
        diaVencimento: null,
        limite: 0,
      });
      toast.success("Conta \"Asaas\" criada automaticamente em Contas.");
    }
  };

  const handleSaveSicoob = async (config: SicoobConfig) => {
    let finalConfig = config;
    // Cria a conta "Sicoob" automaticamente se o usuário ativou sem escolher uma conta —
    // sem ela, não há onde lançar os créditos/débitos importados do extrato.
    if (config.enabled && !config.bankAccountId) {
      const jaTemContaSicoob = bankAccounts.some(a => a.nome === "Sicoob" || a.banco === "Sicoob");
      if (!jaTemContaSicoob) {
        const newAccountId = crypto.randomUUID();
        await saveBankAccount({
          id: newAccountId,
          nome: "Sicoob",
          banco: "Sicoob",
          saldoInicial: 0,
          tipo: "banco",
          diaFechamento: null,
          diaVencimento: null,
          limite: 0,
        });
        finalConfig = { ...config, bankAccountId: newAccountId, bankAccountNome: "Sicoob" };
        toast.success("Conta \"Sicoob\" criada automaticamente em Contas.");
      }
    }
    await updateSicoobConfig(activeCompany.id, finalConfig);
    if (finalConfig.enabled) await seedDefaultCategorizationRules(activeCompany.id);
  };

  const handleSaveDetran = async (config: DetranConfig | null) => {
    await updateDetranConfig(activeCompany.id, config);
    if (config) toast.success("DETRAN-GO conectado com sucesso.");
    else toast.success("Integração DETRAN removida.");
  };

  const handleSaveCobranca = async () => {
    const multa = parseFloat(multaValue.replace(',', '.'));
    const juros = parseFloat(jurosValue.replace(',', '.'));
    const jurosMes = parseFloat(jurosMesValue.replace(',', '.'));
    if (Number.isNaN(multa) || Number.isNaN(juros) || Number.isNaN(jurosMes) || multa < 0 || juros < 0 || jurosMes < 0) {
      toast.error("Valores inválidos. Insira números positivos.");
      return;
    }
    if (jurosMes > 10) {
      toast.warning("Atenção: juros acima de 10% ao mês pode ser considerado abusivo.");
    }
    await updateCobrancaConfig(activeCompany.id, { multaAtraso: multa, jurosDiario: juros, jurosMes });
  };

  const handleSaveWhatsapp = async () => {
    const maxPerWeek = parseInt(waMaxPerWeek, 10);
    const hourStart = parseInt(waHourStart, 10);
    const hourEnd = parseInt(waHourEnd, 10);
    if (Number.isNaN(maxPerWeek) || maxPerWeek < 1) {
      toast.error("Limite semanal inválido");
      return;
    }
    if (Number.isNaN(hourStart) || Number.isNaN(hourEnd) || hourStart < 0 || hourStart > 23 || hourEnd < 1 || hourEnd > 24 || hourStart >= hourEnd) {
      toast.error("Horário comercial inválido");
      return;
    }
    if (waEnabled && (!waInstanceId.trim() || !waToken.trim())) {
      toast.error("Informe pelo menos o Instance ID e o Token da Z-API para ativar");
      return;
    }
    const config: WhatsappConfig = {
      enabled: waEnabled,
      provider: "zapi",
      instanceId: waInstanceId.trim() || undefined,
      token: waToken.trim() || undefined,
      clientToken: waClientToken.trim() || undefined,
      maxMessagesPerClientPerWeek: maxPerWeek,
      businessHoursStart: hourStart,
      businessHoursEnd: hourEnd,
    };
    await updateWhatsappConfig(activeCompany.id, config);
  };

  // Mascara o login para exibição: joao@email.com → j***@email.com
  const maskLogin = (login: string) => {
    const [user, domain] = login.split("@");
    if (domain) return `${user[0]}***@${domain}`;
    if (login.length >= 4) return `${login.slice(0, 3)}${"•".repeat(login.length - 3)}`;
    return login;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Configurações</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="regua">Régua de Cobrança</TabsTrigger>
          <TabsTrigger value="oleo" className="gap-1.5"><Droplets className="h-3.5 w-3.5" />Troca de Óleo</TabsTrigger>
          <TabsTrigger value="vistoria" className="gap-1.5"><Search className="h-3.5 w-3.5" />Vistoria</TabsTrigger>
          <TabsTrigger value="manutencoes" className="gap-1.5"><Wrench className="h-3.5 w-3.5" />Manutenções</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="max-w-2xl space-y-6">
      {/* ── Asaas / Cobranças ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Cobranças Automáticas (Asaas)</CardTitle>
            </div>
            {asaasCfg?.enabled
              ? <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Ativo</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Inativo</Badge>
            }
          </div>
          <CardDescription>
            Configure multa, juros, desconto e frequência de notificações enviadas via Asaas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {asaasCfg?.enabled && (
            <div className="text-sm space-y-1 text-muted-foreground">
              {asaasCfg.multaAtraso > 0 && (
                <p>Multa de atraso: <span className="text-foreground font-medium">R$ {asaasCfg.multaAtraso.toFixed(2)}</span></p>
              )}
              {asaasCfg.jurosAtrasoMes > 0 && (
                <p>Juros: <span className="text-foreground font-medium">{asaasCfg.jurosAtrasoMes}% ao mês</span></p>
              )}
              {asaasCfg.descontoEnabled && asaasCfg.descontoValor > 0 && (
                <p>Desconto antecipado: <span className="text-foreground font-medium">{asaasCfg.descontoValor}% até {asaasCfg.descontoDias}d antes</span></p>
              )}
              {asaasCfg.gerarBoletoXDiasAntes > 0 && (
                <p>Gerar boleto: <span className="text-foreground font-medium">{asaasCfg.gerarBoletoXDiasAntes} dia(s) antes do vencimento</span></p>
              )}
              {asaasCfg.notifyDaysBefore > 0 && (
                <p>Lembrete e-mail/SMS: <span className="text-foreground font-medium">{asaasCfg.notifyDaysBefore} dia(s) antes do vencimento</span></p>
              )}
              {asaasCfg.notifyOnDueDate && (
                <p>Lembrete e-mail/SMS: <span className="text-foreground font-medium">no dia do vencimento</span></p>
              )}
              {asaasCfg.notifyDaysAfterDelay > 0 && (
                <p>Lembrete e-mail/SMS: <span className="text-foreground font-medium">a cada {asaasCfg.notifyDaysAfterDelay} dia(s) de atraso</span></p>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setAsaasOpen(true)}>
            {asaasCfg ? "Editar configuração" : "Configurar"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Regras de Juros e Multa ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Regras de Juros e Multa</CardTitle>
            </div>
          </div>
          <CardDescription>
            Configure os valores de multa fixa e juros diário aplicados nas cobranças de atraso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="multa-atraso" className="text-xs">Multa por atraso (R$)</Label>
              <Input
                id="multa-atraso"
                type="text"
                inputMode="decimal"
                value={multaValue}
                onChange={(e) => setMultaValue(e.target.value)}
                placeholder="15,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="juros-diario" className="text-xs">Juros por dia de atraso (R$)</Label>
              <Input
                id="juros-diario"
                type="text"
                inputMode="decimal"
                value={jurosValue}
                onChange={(e) => setJurosValue(e.target.value)}
                placeholder="7,00"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="juros-mes" className="text-xs">
                Juros ao mês (%) <span className="text-muted-foreground font-normal">— recomendado no máximo 10%</span>
              </Label>
              <Input
                id="juros-mes"
                type="text"
                inputMode="decimal"
                value={jurosMesValue}
                onChange={(e) => setJurosMesValue(e.target.value)}
                placeholder="0,00"
              />
              <p className="text-[11px] text-muted-foreground">
                Aplicado proporcionalmente por dia de atraso. Usado quando a locação não tem juros próprio configurado.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSaveCobranca}>
            Salvar regras
          </Button>
        </CardContent>
      </Card>

      {/* ── Cobrança automática via WhatsApp (IA) ─────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Cobrança Automática via WhatsApp (IA)</CardTitle>
            </div>
            {waEnabled
              ? <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Ativo</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Inativo</Badge>
            }
          </div>
          <CardDescription>
            Conecta o WhatsApp de atendimento via Z-API. Diariamente, a IA analisa pendências de troca
            de óleo e pagamento junto com a conversa recente do cliente e sugere cobranças — que ficam
            aguardando sua aprovação na aba "Cobrança IA" de Cobranças antes de serem enviadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="wa-enabled" className="text-sm font-medium">Ativar automação</Label>
              <p className="text-xs text-muted-foreground">Liga a rotina diária de sugestão de cobranças</p>
            </div>
            <Switch id="wa-enabled" checked={waEnabled} onCheckedChange={setWaEnabled} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="wa-instance" className="text-xs">Z-API Instance ID</Label>
              <Input id="wa-instance" value={waInstanceId} onChange={(e) => setWaInstanceId(e.target.value)} placeholder="3C..." />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="wa-token" className="text-xs">Z-API Token</Label>
              <div className="relative">
                <Input
                  id="wa-token"
                  type={showWaToken ? "text" : "password"}
                  value={waToken}
                  onChange={(e) => setWaToken(e.target.value)}
                  className="pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowWaToken((v) => !v)}
                >
                  {showWaToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="wa-client-token" className="text-xs">Z-API Client-Token (conta)</Label>
              <Input id="wa-client-token" type={showWaToken ? "text" : "password"} value={waClientToken} onChange={(e) => setWaClientToken(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-max-week" className="text-xs">Limite de msgs/cliente por semana</Label>
              <Input id="wa-max-week" type="text" inputMode="numeric" value={waMaxPerWeek} onChange={(e) => setWaMaxPerWeek(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário comercial</Label>
              <div className="flex items-center gap-2">
                <Input type="text" inputMode="numeric" value={waHourStart} onChange={(e) => setWaHourStart(e.target.value)} className="w-16" />
                <span className="text-muted-foreground text-sm">às</span>
                <Input type="text" inputMode="numeric" value={waHourEnd} onChange={(e) => setWaHourEnd(e.target.value)} className="w-16" />
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSaveWhatsapp}>
            Salvar configuração
          </Button>
        </CardContent>
      </Card>

      {/* ── Sicoob ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Extrato Bancário (Sicoob)</CardTitle>
            </div>
            {sicoobCfg?.enabled
              ? <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Ativo</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Inativo</Badge>
            }
          </div>
          <CardDescription>
            Importe automaticamente os lançamentos do extrato Sicoob, conciliando com cobranças
            existentes e categorizando o restante por regra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sicoobCfg?.enabled && (
            <div className="text-sm space-y-1 text-muted-foreground">
              {sicoobCfg.bankAccountNome && (
                <p>Conta vinculada: <span className="text-foreground font-medium">{sicoobCfg.bankAccountNome}</span></p>
              )}
              <p>Sincronização automática: <span className="text-foreground font-medium">
                {sicoobCfg.clientId ? "aguardando certificado digital" : "não configurada — use a importação manual de CSV"}
              </span></p>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setSicoobOpen(true)}>
            {sicoobCfg ? "Editar configuração" : "Configurar"}
          </Button>
        </CardContent>
      </Card>

      {/* ── DETRAN-GO ──────────────────────────────────────────────────── */}
      <Card className={detranCfg ? "border-blue-200 dark:border-blue-900/40" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Consulta de Débitos — DETRAN-GO</CardTitle>
            </div>
            {detranCfg
              ? <Badge className="gap-1 text-xs bg-blue-600 hover:bg-blue-600"><ShieldCheck className="h-3 w-3" />Conectado</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Não configurado</Badge>
            }
          </div>
          <CardDescription>
            Consulte multas e IPVA dos seus veículos diretamente no portal do DETRAN-GO, com atribuição automática ao locatário do período.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {detranCfg ? (
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Conta conectada
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-mono">
                    {maskLogin(detranCfg.login)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Suas credenciais estão criptografadas e são usadas apenas para consultas dos veículos desta locadora.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Configure o acesso ao portal DETRAN-GO para habilitar a consulta automática de multas e IPVA na página de Multas.
            </p>
          )}
          <Button
            variant={detranCfg ? "outline" : "default"}
            size="sm"
            onClick={() => setDetranOpen(true)}
          >
            {detranCfg ? "Editar credenciais" : "Conectar ao DETRAN-GO"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Autentique ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Assinatura Digital (Autentique)</CardTitle>
            </div>
            {activeCompany?.autentiqueConfig?.token
              ? <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Configurado</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Não configurado</Badge>
            }
          </div>
          <CardDescription>
            Token da API do Autentique para envio de contratos para assinatura digital.
            Encontrado em <strong>app.autentique.com.br → Perfil → API</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Token da API</Label>
            <div className="relative">
              <Input
                type={showAutToken ? "text" : "password"}
                value={autToken}
                onChange={e => setAutToken(e.target.value.trim())}
                placeholder="Cole aqui o Bearer token do Autentique"
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowAutToken(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showAutToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateAutentiqueConfig(activeCompany.id, autToken.trim() ? { token: autToken.trim() } : null)}
            >
              Salvar
            </Button>
            {activeCompany?.autentiqueConfig?.token && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => { setAutToken(""); updateAutentiqueConfig(activeCompany.id, null); }}
              >
                Remover
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="regua">
          <CollectionRulesSection />
        </TabsContent>

        <TabsContent value="oleo" className="max-w-3xl">
          <OilConfigSection />
        </TabsContent>

        <TabsContent value="vistoria">
          <VistoriaConfigSection />
        </TabsContent>

        <TabsContent value="manutencoes">
          <ManutencoesConfigSection />
        </TabsContent>
      </Tabs>

      <AsaasConfigDialog
        open={asaasOpen}
        onClose={() => setAsaasOpen(false)}
        onSave={handleSaveAsaas}
        initial={asaasCfg}
        companyName={activeCompany?.nome}
      />

      <DetranConfigDialog
        open={detranOpen}
        onClose={() => setDetranOpen(false)}
        onSave={handleSaveDetran}
        current={detranCfg}
        companyName={activeCompany?.nome}
      />

      <SicoobConfigDialog
        open={sicoobOpen}
        onClose={() => setSicoobOpen(false)}
        onSave={handleSaveSicoob}
        initial={sicoobCfg}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}
