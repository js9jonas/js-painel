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
  // sem_tarefa: o robô só quer as credenciais (ex.: Central na tela de login) — não pega pedido que ia se perder no login
  const corpo = (await req.json().catch(() => ({}))) as { alvos?: string[]; versao?: string; sem_tarefa?: boolean };
  const alvos = (corpo.alvos ?? []).filter((a): a is AlvoRobo => (ALVOS_ROBO as readonly string[]).includes(a));
  if (!alvos.length) return NextResponse.json({ erro: "Informe os alvos." }, { status: 400 });

  const inicio = Date.now();
  while (true) {
    for (const alvo of alvos) {
      // sem_sessao_desde: marca desde quando está preso no login/bloqueio (a tela recusa na hora, ver robo.ts)
      await pool.query(
        `INSERT INTO public.robo_status (alvo, visto_em, versao, sem_sessao_desde)
         VALUES ($1, NOW(), $2, CASE WHEN $3 THEN NOW() END)
         ON CONFLICT (alvo) DO UPDATE SET visto_em = NOW(), versao = EXCLUDED.versao,
           sem_sessao_desde = CASE WHEN $3 THEN COALESCE(robo_status.sem_sessao_desde, NOW()) END`,
        [alvo, corpo.versao ?? null, !!corpo.sem_tarefa]
      );
    }
    await pool.query(
      `UPDATE public.robo_tarefas SET status = 'expirada', concluido_em = NOW()
       WHERE status = 'pendente' AND criado_em < NOW() - make_interval(secs => $1)`,
      [ESPERA_MAX_FILA_MS / 1000]
    );
    // Pega e não respondeu em 5 min (página recarregou no meio, PC desligou): erro, pra não ficar pendurada
    await pool.query(
      `UPDATE public.robo_tarefas SET status = 'erro', erro = 'O robô pegou o pedido mas não respondeu (página recarregou ou o PC desligou no meio). Confira no site se a ação entrou.', concluido_em = NOW()
       WHERE status = 'executando' AND iniciado_em < NOW() - interval '5 minutes'`
    );
    if (corpo.sem_tarefa) {
      const { rows: cred } = await pool.query<{ usuario: string | null; senha: string | null }>(
        `SELECT usuario, senha FROM public.painel_servidores WHERE tipo = $1 AND ativo = true ORDER BY id DESC LIMIT 1`,
        [alvos[0]]
      );
      return NextResponse.json({ tarefa: null, credenciais: cred[0] ? { usuario: cred[0].usuario, senha: cred[0].senha } : null });
    }
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
    // Sem tarefa também vão as credenciais: a Central faz login pela tela (Turnstile), não dá pra esperar uma tarefa
    if (Date.now() - inicio > ESPERA_LONG_POLL_MS) {
      const { rows: cred } = await pool.query<{ usuario: string | null; senha: string | null }>(
        `SELECT usuario, senha FROM public.painel_servidores WHERE tipo = $1 AND ativo = true ORDER BY id DESC LIMIT 1`,
        [alvos[0]]
      );
      return NextResponse.json({ tarefa: null, credenciais: cred[0] ? { usuario: cred[0].usuario, senha: cred[0].senha } : null });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
