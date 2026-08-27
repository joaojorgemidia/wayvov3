// O campo `plano` de uma locação (Rental) nem sempre é o valor interno padrão
// ("aluguel" / "moto_no_final") — quando a empresa tem contratos customizados
// cadastrados em Contratos, o assistente de nova locação (RentalWizard.tsx) usa o
// NOME do contrato customizado como plano (ex: "COM MOTO NO FINAL", em vez de
// "moto_no_final"). Qualquer comparação exata (`rental.plano === "moto_no_final"`)
// falha silenciosamente nesses casos — o que é especialmente grave na geração
// automática de cobrança, que usa esse valor pra saber quando PARAR de gerar
// cobrança de aluguel pra planos "Moto no Final" (que têm fim natural pelo nº de
// parcelas, ao contrário de "Só Aluguel", que é em aberto).
//
// Use classifyPlano() em vez de comparar `rental.plano` direto sempre que o
// comportamento depender de ser "Só Aluguel" vs "Moto no Final".
export type PlanoCategoria = "aluguel" | "moto_no_final" | "outro";

export function classifyPlano(plano: string | null | undefined): PlanoCategoria {
  const n = (plano || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
  if (n.includes("moto") && n.includes("final")) return "moto_no_final";
  if (n.includes("aluguel")) return "aluguel";
  return "outro";
}
