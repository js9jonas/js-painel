export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { jwtValido } from "@/lib/painel-adapters/appacesso";
import { loginFunPlays, editarPlaylist as editarFunPlays, excluirPlaylist as excluirFunPlays } from "@/lib/painel-adapters/funplays";
import { loginLazerPlay, editarPlaylist as editarLazerPlay, excluirPlaylist as excluirLazerPlay } from "@/lib/painel-adapters/lazerplay";
import { loginCorePlayer, editarPlaylist as editarCorePlayer, excluirPlaylist as excluirCorePlayer } from "@/lib/painel-adapters/coreplayer";
import { loginSmartOne, editarPlaylist as editarSmartOne, excluirPlaylist as excluirSmartOne } from "@/lib/painel-adapters/smartone";

// Editar/excluir uma playlist específica de um device de app (FunPlays/LazerPlay/
// CorePlayer/SmartOne). Endpoints descobertos via monitoramento de rede em 16/06/2026
// (nenhum estava documentado/usado antes): appacesso.com usa PUT/DELETE em
// /reseller/playlist; SmartOne usa POST em edit_playlist/{id}/ (form) e GET em
// delete_smartkey/{id}/active/.
//
// Roda em background (mesmo padrão job+polling do sync-aplicativos/verificar conta)
// porque o relogin pode ser lento em painéis com captcha (FunPlays/LazerPlay reCAPTCHA,
// SmartOne Turnstile) — uma chamada síncrona arriscaria timeout de proxy.

type JobState = { done: false } | { done: true; ok: true } | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

type Acao = "editar" | "excluir";
type CorpoEdicao = {
  nome?: string;
  url?: string;
  host?: string;
  port?: string;
  usuario?: string;
  senha?: string;
  nota?: string;
};

async function obterSessao(tipo: string, idPainel: number, usuario: string, senha: string): Promise<string> {
  const { rows } = await pool.query<{ session_cookie: string | null; session_expiry: Date | null }>(
    `SELECT session_cookie, session_expiry FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  const r = rows[0];
  const sessaoValida =
    tipo === "smartone"
      ? !!r?.session_cookie && !!r.session_expiry && new Date(r.session_expiry).getTime() - 60_000 > Date.now()
      : !!r?.session_cookie && jwtValido(r.session_cookie);

  if (sessaoValida) return r!.session_cookie!;

  const loginFn =
    tipo === "lazerplay" ? loginLazerPlay :
    tipo === "coreplayer" ? loginCorePlayer :
    tipo === "smartone" ? loginSmartOne :
    loginFunPlays;
  const { token, expiry } = await loginFn(usuario, senha);
  await pool.query(
    `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
    [token, expiry, idPainel]
  );
  return token;
}

async function executar(idAppRegistro: number, idPlaylist: number, acao: Acao, corpo: CorpoEdicao, jobId: string) {
  try {
    const { rows } = await pool.query<{ mac: string | null; chave: string | null; id_painel_servidor: number | null }>(
      `SELECT mac, chave, id_painel_servidor FROM public.aplicativos WHERE id_app_registro = $1`,
      [idAppRegistro]
    );
    if (!rows.length || !rows[0].id_painel_servidor || !rows[0].chave) {
      jobs.set(jobId, { done: true, ok: false, erro: "Aplicativo sem painel/device vinculado." });
      return;
    }
    const { mac, chave, id_painel_servidor: idPainel } = rows[0];
    const deviceId = parseInt(chave!, 10);

    const { rows: painelRows } = await pool.query<{ tipo: string; usuario: string; senha: string }>(
      `SELECT tipo, usuario, senha FROM public.painel_servidores WHERE id = $1`,
      [idPainel]
    );
    if (!painelRows.length) {
      jobs.set(jobId, { done: true, ok: false, erro: "Painel não encontrado." });
      return;
    }
    const { tipo, usuario, senha } = painelRows[0];
    const token = await obterSessao(tipo, idPainel!, usuario, senha);

    if (acao === "excluir") {
      if (tipo === "smartone") {
        await excluirSmartOne(token, idPlaylist);
      } else {
        const fn = tipo === "lazerplay" ? excluirLazerPlay : tipo === "coreplayer" ? excluirCorePlayer : excluirFunPlays;
        await fn(token, { id: idPlaylist, deviceId });
      }
      await pool.query(
        `DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo = $2`,
        [idAppRegistro, idPlaylist]
      );
    } else {
      if (tipo === "smartone") {
        await editarSmartOne(token, {
          id: idPlaylist,
          mac: mac ?? "",
          nome: corpo.nome ?? "",
          host: corpo.host ?? "",
          port: corpo.port ?? "",
          usuario: corpo.usuario ?? "",
          senha: corpo.senha ?? "",
          nota: corpo.nota,
        });
        const url = `${corpo.host}:${corpo.port}/?username=${encodeURIComponent(corpo.usuario ?? "")}&password=${encodeURIComponent(corpo.senha ?? "")}`;
        await pool.query(
          `UPDATE public.aplicativo_playlists SET nome = $1, url = $2, atualizado_em = NOW()
           WHERE id_app_registro = $3 AND playlist_id_externo = $4`,
          [corpo.nome, url, idAppRegistro, idPlaylist]
        );
      } else {
        const fn = tipo === "lazerplay" ? editarLazerPlay : tipo === "coreplayer" ? editarCorePlayer : editarFunPlays;
        await fn(token, { id: idPlaylist, deviceId, name: corpo.nome ?? "", url: corpo.url ?? "" });
        await pool.query(
          `UPDATE public.aplicativo_playlists SET nome = $1, url = $2, atualizado_em = NOW()
           WHERE id_app_registro = $3 AND playlist_id_externo = $4`,
          [corpo.nome, corpo.url, idAppRegistro, idPlaylist]
        );
      }
    }

    jobs.set(jobId, { done: true, ok: true });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao processar." });
  }

  setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
}

// POST ?acao=editar|excluir — inicia o job em background e retorna imediatamente
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ idAppRegistro: string; idPlaylist: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { idAppRegistro, idPlaylist } = await params;
  const idApp = parseInt(idAppRegistro, 10);
  const idPl = parseInt(idPlaylist, 10);
  if (isNaN(idApp) || isNaN(idPl)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const acao = new URL(req.url).searchParams.get("acao") as Acao | null;
  if (acao !== "editar" && acao !== "excluir") {
    return NextResponse.json({ erro: "Ação inválida. Use ?acao=editar ou ?acao=excluir." }, { status: 400 });
  }

  const corpo: CorpoEdicao = acao === "editar" ? await req.json().catch(() => ({})) : {};

  const jobId = `playlist-${idPl}-${Date.now()}`;
  jobs.set(jobId, { done: false });

  executar(idApp, idPl, acao, corpo, jobId).catch(() => {});

  return NextResponse.json({ jobId, status: "em_andamento" });
}

// GET ?jobId= — verifica o status do job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ idAppRegistro: string; idPlaylist: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  await params;
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
