// src/lib/datas-renovacao.ts — regras de data da renovação, usadas pelo botão Renovar
// (RenovarAssinatura.tsx, no navegador) e pela renovação automática do Pix (no servidor).
// Sem dependência de servidor: o mesmo arquivo roda nos dois lados. Datas em "AAAA-MM-DD";
// `hoje` vem de quem chama (navegador: data local; servidor: data de Brasília).

export type Periodo = "mensal" | "trimestral" | "semestral" | "anual";
export const MESES: Record<Periodo, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

export function periodoDosMeses(meses: number): Periodo | null {
  const p = (Object.keys(MESES) as Periodo[]).find((k) => MESES[k] === meses);
  return p ?? null;
}

export function addMeses(dataStr: string | null | undefined, meses: number, hoje: string): string {
  const base = new Date((dataStr ?? hoje) + "T00:00:00");
  base.setMonth(base.getMonth() + meses);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

export function calcVencContrato(vencAtual: string | null | undefined, periodo: Periodo, hoje: string): string {
  return addMeses(vencAtual ?? undefined, MESES[periodo], hoje);
}

// Pendente: o mês em aberto já foi somado ao vencimento quando a assinatura virou pendente,
// então um pagamento de N meses só acrescenta N-1 (trimestral +2, semestral +5, anual +11).
export function calcVencContratoPendente(vencAtual: string | null | undefined, periodo: Periodo, hoje: string): string {
  if (!vencAtual) return ""; // sem vencimento: não inventa data, operador preenche se quiser
  return addMeses(vencAtual.split("T")[0], MESES[periodo] - 1, hoje);
}

export function vencContasVencida(vencContasAtual: string | null | undefined, hoje: string): boolean {
  if (!vencContasAtual) return false;
  return vencContasAtual.split("T")[0] <= hoje;
}

/** Conta do painel que o botão renova junto (vencida até hoje e ligada a um painel nosso). */
export function contaPrecisaRenovarNoPainel(
  c: { vencimento_real_painel: string | null; id_painel_servidor: number | null },
  hoje: string
): boolean {
  if (!c.vencimento_real_painel || c.id_painel_servidor === null) return false;
  return c.vencimento_real_painel.split("T")[0] <= hoje;
}

/**
 * Datas que o botão Renovar manda quando o operador não mexe em nada (valores padrão do modal):
 * - normal: contrato = vencimento atual + período (ou hoje + período se o vencimento das contas já
 *   passou); contas = hoje + 1 mês se já venceu, senão ficam como estão;
 * - pendente: só manda o que muda (mensal = nada; trimestral +2 meses...).
 */
export function datasPadraoDoBotao(p: {
  vencContrato: string | null;
  vencContas: string | null;
  periodo: Periodo;
  pendente: boolean;
  hoje: string;
}): { dataManual: string | null; vencContasManual: string | null } {
  const contasVencida = vencContasVencida(p.vencContas, p.hoje);
  const vencContasAtual = p.vencContas?.split("T")[0] ?? "";
  const vencContas = contasVencida ? addMeses(undefined, 1, p.hoje) : vencContasAtual;

  if (p.pendente) {
    const vencContrato = calcVencContratoPendente(p.vencContrato, p.periodo, p.hoje);
    return {
      dataManual: vencContrato && vencContrato !== p.vencContrato?.split("T")[0] ? vencContrato : null,
      vencContasManual: vencContas && vencContas !== vencContasAtual ? vencContas : null,
    };
  }
  return {
    dataManual: calcVencContrato(contasVencida ? null : p.vencContrato, p.periodo, p.hoje),
    vencContasManual: vencContas || null,
  };
}
