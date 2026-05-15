import type { FinancialEntry } from "@/lib/types";

export interface AccountBalanceSource {
  nome: string;
  saldoInicial: number;
}

export interface AccountBalance {
  atual: number;
  previsto: number;
}

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export function calculateAccountBalances(
  accounts: AccountBalanceSource[],
  entries: FinancialEntry[],
  forecastDays = 90,
): Record<string, AccountBalance> {
  const balances: Record<string, AccountBalance> = {};

  accounts.forEach((account) => {
    // IMPORTANT: contas são identificadas pelas transações apenas pelo NOME
    // (campo de texto). Se o usuário tem múltiplas contas com o mesmo nome
    // (duplicatas), todas as transações apontam para a mesma chave. Para
    // evitar que uma sobrescreva a outra (perdendo o saldo inicial real),
    // somamos os saldos iniciais de contas homônimas.
    const inicial = Number(account.saldoInicial) || 0;
    if (balances[account.nome]) {
      balances[account.nome].atual += inicial;
      balances[account.nome].previsto += inicial;
    } else {
      balances[account.nome] = { atual: inicial, previsto: inicial };
    }
  });

  const today = startOfToday();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + forecastDays);

  entries.forEach((entry) => {
    // Lançamentos ignorados são excluídos do P&L (relatórios/categorias),
    // mas continuam impactando o saldo da conta — afinal, o dinheiro
    // entrou ou saiu do banco de fato.
    const accountName = entry.conta || "";
    const balance = balances[accountName];
    if (!balance) return;

    const value = entry.tipo === "receita" ? entry.valor : -entry.valor;

    if (entry.pago) {
      balance.atual += value;
      balance.previsto += value;
      return;
    }

    const dueStr = entry.dataPrevista || entry.data;
    if (!dueStr) return;

    const due = new Date(dueStr);
    if (Number.isNaN(due.getTime())) return;

    if (due <= horizon) {
      balance.previsto += value;
    }
  });

  return balances;
}