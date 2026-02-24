/**
 * Retorna uma string legível com o tempo decorrido desde uma data.
 * Ex: "2 anos, 3 meses e 15 dias" ou "5 meses e 2 dias" ou "18 dias"
 */
export function tempoDesde(data: Date | string | null | undefined): string {
  if (!data) return "";

  const inicio = new Date(data);
  const hoje = new Date();

  let anos = hoje.getFullYear() - inicio.getFullYear();
  let meses = hoje.getMonth() - inicio.getMonth();
  let dias = hoje.getDate() - inicio.getDate();

  if (dias < 0) {
    meses -= 1;
    const ultimoDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();
    dias += ultimoDiaMesAnterior;
  }

  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }

  const partes: string[] = [];

  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? "dia" : "dias"}`);

  if (partes.length === 0) return "hoje";
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1];
}