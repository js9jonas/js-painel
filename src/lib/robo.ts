// Robô de navegador (15/10/2026): executa ações em sites que só abrem em navegador real (Cloudflare managed
// challenge). O robô roda no PC do Jonas — extensão em robo-navegador/extensao num Chrome comum numa tela
// virtual — e busca as tarefas em /api/interno/robo/proxima. Aqui fica o lado do js-painel: pôr a tarefa na
// fila e esperar o resultado. Tabelas: sql/023_robo_tarefas.sql.
import { pool } from "@/lib/db";

export const ALVOS_ROBO = ["popplayer", "duplecast", "central", "fast"] as const;
export type AlvoRobo = (typeof ALVOS_ROBO)[number];

/** Sem contato do robô há mais que isso = PC desligado (o robô pergunta a cada ~20 s). */
const ROBO_OFFLINE_MS = 90_000;
/** Tarefa não pega nesse tempo expira: a tela já desistiu e não deve ser feita depois. */
export const ESPERA_MAX_FILA_MS = 2 * 60_000;

export class RoboOffline extends Error {}

export async function roboOnline(alvo: AlvoRobo): Promise<boolean> {
  const { rows } = await pool.query<{ visto_em: Date }>(`SELECT visto_em FROM public.robo_status WHERE alvo = $1`, [alvo]);
  return !!rows[0] && Date.now() - new Date(rows[0].visto_em).getTime() < ROBO_OFFLINE_MS;
}

/**
 * Põe a ação na fila do robô e espera o resultado. Robô sem contato recente → RoboOffline na hora, sem
 * enfileirar. A tarefa que não foi pega a tempo é marcada 'expirada' (aqui ou pelo /proxima).
 */
export async function executarNoRobo<T = unknown>(
  alvo: AlvoRobo,
  acao: string,
  params: Record<string, unknown>,
  opts: { usuario?: string | null; timeoutMs?: number } = {}
): Promise<T> {
  if (!(await roboOnline(alvo))) {
    throw new RoboOffline("O robô do navegador está desligado (o PC de casa precisa estar ligado). Tente de novo quando ele voltar.");
  }
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO public.robo_tarefas (alvo, acao, params, usuario) VALUES ($1, $2, $3, $4) RETURNING id`,
    [alvo, acao, JSON.stringify(params), opts.usuario ?? null]
  );
  const id = Number(rows[0].id);
  const limite = Date.now() + (opts.timeoutMs ?? 3 * 60_000);

  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1000));
    const { rows: t } = await pool.query<{ status: string; resultado: T; erro: string | null }>(
      `SELECT status, resultado, erro FROM public.robo_tarefas WHERE id = $1`,
      [id]
    );
    const s = t[0]?.status;
    if (s === "ok") return t[0].resultado;
    if (s === "erro") throw new Error(t[0].erro ?? "O robô não conseguiu fazer a ação.");
    if (s === "expirada") throw new RoboOffline("O robô não pegou o pedido a tempo. Confira se o PC de casa está ligado e tente de novo.");
  }
  const { rowCount } = await pool.query(
    `UPDATE public.robo_tarefas SET status = 'expirada', concluido_em = NOW() WHERE id = $1 AND status = 'pendente'`,
    [id]
  );
  throw new Error(rowCount
    ? "O robô não pegou o pedido a tempo. Tente de novo."
    : "O robô começou, mas ainda não respondeu. Atualize o aparelho em alguns instantes para ver se a ação entrou.");
}
