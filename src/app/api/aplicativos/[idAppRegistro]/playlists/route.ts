export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { jwtValido } from "@/lib/painel-adapters/appacesso";
import { loginFunPlays, criarPlaylist as criarFunPlays, getPlaylistsDispositivo as getFunPlaysPlaylists } from "@/lib/painel-adapters/funplays";
import { loginLazerPlay, criarPlaylist as criarLazerPlay, getPlaylistsDispositivo as getLazerPlayPlaylists } from "@/lib/painel-adapters/lazerplay";
import { loginCorePlayer, criarPlaylist as criarCorePlayer, getPlaylistsDispositivo as getCorePlayerPlaylists } from "@/lib/painel-adapters/coreplayer";
import { loginSmartOne, criarPlaylist as criarSmartOne } from "@/lib/painel-adapters/smartone";

// Cria uma playlist nova num device existente. appacesso (FunPlays/LazerPlay/CorePlayer):
// adiciona em aplicativo_playlists do MESMO id_app_registro. SmartOne: cria um SMARTKEY
// novo (1 smartkey = 1 device lá) — gera uma linha NOVA em public.aplicativos, com o
// nome do cliente em "note" pra identificação no site do SmartOne.

type JobState = { done: false } | { done: true; ok: true } | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

type CorpoCriacao = {
  nome?: string;
  url?: string;
  host?: string;
  port?: string;
  usuario?: string;
  senha?: string;
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

async function executarCriacao(idAppRegistro: number, corpo: CorpoCriacao, jobId: string) {
  try {
    const { rows } = await pool.query<{
      mac: string | null;
      chave: string | null;
      id_painel_servidor: number | null;
      id_cliente: number;
    }>(
      `SELECT mac, chave, id_painel_servidor, id_cliente FROM public.aplicativos WHERE id_app_registro = $1`,
      [idAppRegistro]
    );
    if (!rows.length || !rows[0].id_painel_servidor || !rows[0].chave) {
      jobs.set(jobId, { done: true, ok: false, erro: "Aplicativo sem painel/device vinculado." });
      return;
    }
    const { mac, chave, id_painel_servidor: idPainel, id_cliente } = rows[0];
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

    if (tipo === "smartone") {
      if (!mac) {
        jobs.set(jobId, { done: true, ok: false, erro: "Device sem MAC cadastrado." });
        return;
      }
      const { rows: clienteRows } = await pool.query<{ nome: string }>(
        `SELECT nome FROM public.clientes WHERE id_cliente = $1`,
        [id_cliente]
      );
      const nomeCliente = clienteRows[0]?.nome ?? "";

      const novo = await criarSmartOne(token, {
        mac,
        nome: corpo.nome ?? "",
        host: corpo.host ?? "",
        port: corpo.port ?? "",
        usuario: corpo.usuario ?? "",
        senha: corpo.senha ?? "",
        nota: nomeCliente,
      });
      if (!novo) {
        jobs.set(jobId, { done: true, ok: false, erro: "Playlist criada no painel, mas não foi possível localizar o novo registro pra salvar aqui." });
        return;
      }

      // O novo smartkey fica como uma PLAYLIST do cadastro existente (não um aplicativo
      // novo) — mesmo critério visual do FunPlays/LazerPlay, ainda que no SmartOne cada
      // smartkey seja tecnicamente um device separado no painel.
      const url = `${corpo.host}:${corpo.port}/?username=${encodeURIComponent(corpo.usuario ?? "")}&password=${encodeURIComponent(corpo.senha ?? "")}`;
      await pool.query(
        `INSERT INTO public.aplicativo_playlists
           (id_app_registro, playlist_id_externo, nome, url, is_selected, expired_date, atualizado_em)
         VALUES ($1, $2, $3, $4, false, $5, NOW())
         ON CONFLICT (id_app_registro, playlist_id_externo) DO NOTHING`,
        [idAppRegistro, novo.id, corpo.nome ?? null, url, novo.activation_expired ?? null]
      );
    } else {
      const criarFn = tipo === "lazerplay" ? criarLazerPlay : tipo === "coreplayer" ? criarCorePlayer : criarFunPlays;
      const getPlaylistsFn = tipo === "lazerplay" ? getLazerPlayPlaylists : tipo === "coreplayer" ? getCorePlayerPlaylists : getFunPlaysPlaylists;

      await criarFn(token, { deviceId, name: corpo.nome ?? "", url: corpo.url ?? "" });

      const playlists = await getPlaylistsFn(token, deviceId);
      const nova = playlists.find((p) => p.url === corpo.url) ?? playlists[playlists.length - 1];
      if (nova) {
        await pool.query(
          `INSERT INTO public.aplicativo_playlists
             (id_app_registro, playlist_id_externo, nome, url, is_selected, expired_date, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id_app_registro, playlist_id_externo) DO NOTHING`,
          [idAppRegistro, nova.id, nova.name ?? null, nova.url ?? null, nova.is_selected ?? false, nova.expired_date ?? null]
        );
      }
    }

    jobs.set(jobId, { done: true, ok: true });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao criar playlist." });
  }

  setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
}

// POST — inicia o job em background e retorna imediatamente
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ idAppRegistro: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { idAppRegistro } = await params;
  const idApp = parseInt(idAppRegistro, 10);
  if (isNaN(idApp)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const corpo: CorpoCriacao = await req.json().catch(() => ({}));

  const jobId = `nova-playlist-${idApp}-${Date.now()}`;
  jobs.set(jobId, { done: false });

  executarCriacao(idApp, corpo, jobId).catch(() => {});

  return NextResponse.json({ jobId, status: "em_andamento" });
}

// GET ?jobId= — verifica o status do job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ idAppRegistro: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  await params;
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
