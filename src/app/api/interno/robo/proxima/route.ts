export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ALVOS_ROBO, ESPERA_MAX_FILA_MS, type AlvoRobo } from "@/lib/robo";

// Chamada pelo robô de navegador (robo-navegador/extensao) — autorização pelo proxy (x-internal-token,
// prefixo /api/interno/). Long-poll: segura até ~20 s esperando tarefa, e a cada chamada marca o robô
// como vivo. Tarefa que ficou mais que ESPERA_MAX_FILA_MS sem ser pega vira 'expirada' (a tela já desistiu).
// Junto com a tarefa vão usuário e senha do painel do site (o robô faz o login sozinho quando a sessão cai).

const ESPERA_LONG_POLL_MS = 20_000;

export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as { alvos?: string[]; versao?: string };
  const alvos = (corpo.alvos ?? []).filter((a): a is AlvoRobo => (ALVOS_ROBO as readonly string[]).includes(a));
  if (!alvos.length) return NextResponse.json({ erro: "Informe os alvos." }, { status: 400 });

  const inicio = Date.now();
  while (true) {
    for (const alvo of alvos) {
      await pool.query(
        `INSERT INTO public.robo_status (alvo, visto_em, versao) VALUES ($1, NOW(), $2)
         ON CONFLICT (alvo) DO UPDATE SET visto_em = NOW(), versao = EXCLUDED.versao`,
        [alvo, corpo.versao ?? null]
      );
    }
    await pool.query(
      `UPDATE public.robo_tarefas SET status = 'expirada', concluido_em = NOW()
       WHERE status = 'pendente' AND criado_em < NOW() - make_interval(secs => $1)`,
      [ESPERA_MAX_FILA_MS / 1000]
    );
    const { rows } = await pool.query<{ id: string; alvo: string; acao: string; params: unknown }>(
      `UPDATE public.robo_tarefas SET status = 'executando', iniciado_em = NOW()
       WHERE id = (SELECT id FROM public.robo_tarefas WHERE status = 'pendente' AND alvo = ANY($1)
                   ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING id, alvo, acao, params`,
      [alvos]
    );
    const tarefa = rows[0];
    if (tarefa) {
      const { rows: cred } = await pool.query<{ usuario: string | null; senha: string | null }>(
        `SELECT usuario, senha FROM public.painel_servidores WHERE tipo = $1 AND ativo = true ORDER BY id DESC LIMIT 1`,
        [tarefa.alvo]
      );
      return NextResponse.json({
        tarefa: { ...tarefa, id: Number(tarefa.id) },
        credenciais: cred[0] ? { usuario: cred[0].usuario, senha: cred[0].senha } : null,
      });
    }
    if (Date.now() - inicio > ESPERA_LONG_POLL_MS) return NextResponse.json({ tarefa: null });
    await new Promise((r) => setTimeout(r, 1000));
  }
}
