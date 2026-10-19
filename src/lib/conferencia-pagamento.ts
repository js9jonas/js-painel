// src/lib/conferencia-pagamento.ts — rótulos da conferência dos pagamentos (sql/027).
// Sem dependência de servidor: usado nas telas de pagamentos, ficha do cliente e /chat.

export const CONFERENCIA_ROTULO: Record<string, { texto: string; icone: string; classe: string; cor: string }> = {
  conferido:  { texto: "Conferido",  icone: "✓", classe: "bg-emerald-50 text-emerald-700 ring-emerald-200", cor: "#16a34a" },
  analisar:   { texto: "Analisar",   icone: "?", classe: "bg-amber-50 text-amber-700 ring-amber-200",       cor: "#d97706" },
  conclusivo: { texto: "Conclusivo", icone: "◎", classe: "bg-sky-50 text-sky-700 ring-sky-200",             cor: "#0284c7" },
  automatico: { texto: "Automático", icone: "⚡", classe: "bg-violet-50 text-violet-700 ring-violet-200",    cor: "#7c3aed" },
};

/**
 * O que mostrar na coluna Detalhes: o pagador, quando conhecido; senão o texto livre — sem o 'OK'
 * antigo (que era a marca de conferência) nem o "N dias desde o último pagamento" (não gravado mais).
 */
export function detalhesVisiveis(p: { pagador: string | null; detalhes: string | null }): string | null {
  if (p.pagador) return p.pagador;
  const d = p.detalhes?.trim();
  if (!d || d.toUpperCase() === "OK" || /^\d+ dias desde o último pagamento$/.test(d)) return null;
  return d;
}
