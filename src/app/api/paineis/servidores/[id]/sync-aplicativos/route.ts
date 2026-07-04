export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import type { ServidorCredenciais } from "@/lib/painel-adapters/types";
import { loginFunPlays, getDispositivos as getFunPlaysDevices, getPlaylistsDispositivo as getFunPlaysPlaylists } from "@/lib/painel-adapters/funplays";
import { loginLazerPlay, getDispositivos as getLazerPlayDevices, getPlaylistsDispositivo as getLazerPlayPlaylists } from "@/lib/painel-adapters/lazerplay";
import { loginCorePlayer, getDispositivos as getCorePlayerDevices, getPlaylistsDispositivo as getCorePlayerPlaylists } from "@/lib/painel-adapters/coreplayer";
import { loginSmartOne, getDispositivos as getSmartOneDevices, getPlaylistsDispositivo as getSmartOnePlaylists } from "@/lib/painel-adapters/smartone";
import { jwtValido as jwtValidoAppAcesso, type AppAcessoPlaylist } from "@/lib/painel-adapters/appacesso";

const ID_APP: Record<string, number> = {
  funplays:    3,  // "Fun Play"
  lazerplay:   2,  // "Lazer Play"
  coreplayer:  31, // "Core Player"
  smartone:    4,  // "Smartone"
};

// Quantos devices processar em paralelo — alto suficiente para não levar minutos
// com painéis de centenas de devices (FunPlays/LazerPlay), baixo suficiente para
// não esgotar o pool de conexões do Postgres (max padrão do `pg` é 10).
const CONCORRENCIA = 6;

type Stats = { inseridos: number; atualizados: number; playlists_sincronizadas: number; playlists_removidas: number; removidos: number };
type JobState =
  | { done: false }
  | { done: true; ok: true; total_devices: number; stats: Stats; aviso?: string }
  | { done: true; ok: false; erro: string };

// In-memory job store — ok para single instance (Easypanel não é serverless)
const jobs = new Map<string, JobState>();

// SmartOne usa cookie de sessão Blesta (não JWT) — validade controlada por session_expiry.
function sessaoValida(creds: { session_cookie: string | null; session_expiry: Date | string | null }): boolean {
  return (
    !!creds.session_cookie &&
    !!creds.session_expiry &&
    new Date(creds.session_expiry).getTime() - 60_000 > Date.now()
  );
}

function extrairUsernameUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("username");
  } catch {
    return null;
  }
}

async function mapConcorrente<T>(items: T[], limite: number, fn: (item: T) => Promise<void>): Promise<void> {
  let indice = 0;
  async function worker() {
    while (indice < items.length) {
      const item = items[indice++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
}

async function executarSync(idPainel: number, jobId: string) {
  try {
    const { rows: painelRows } = await pool.query<ServidorCredenciais & { tipo: string; id: number }>(
      `SELECT id, tipo, usuario AS painel_usuario, senha AS painel_senha,
              session_cookie, session_expiry
       FROM public.painel_servidores WHERE id = $1`,
      [idPainel]
    );

    if (!painelRows.length) {
      jobs.set(jobId, { done: true, ok: false, erro: "Painel não encontrado." });
      return;
    }
    const creds = painelRows[0];

    const tipoSuportado = ["funplays", "lazerplay", "coreplayer", "smartone"];
    if (!tipoSuportado.includes(creds.tipo)) {
      jobs.set(jobId, { done: true, ok: false, erro: `Painel tipo "${creds.tipo}" não suporta sync de aplicativos.` });
      return;
    }

    const idApp = ID_APP[creds.tipo];

    // Obter sessão — reusar se ainda válida, senão relogar.
    let jwt = creds.session_cookie ?? "";
    const precisaRelogar = creds.tipo === "smartone" ? !sessaoValida(creds) : !jwtValidoAppAcesso(jwt);
    if (precisaRelogar) {
      const loginFn =
        creds.tipo === "lazerplay" ? loginLazerPlay :
        creds.tipo === "coreplayer" ? loginCorePlayer :
        creds.tipo === "smartone" ? loginSmartOne :
        loginFunPlays;
      const { token, expiry } = await loginFn(creds.painel_usuario, creds.painel_senha);
      jwt = token;
      await pool.query(
        `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
        [token, expiry, idPainel]
      );
    }

    const getDevicesFn =
      creds.tipo === "lazerplay"   ? getLazerPlayDevices :
      creds.tipo === "coreplayer"  ? getCorePlayerDevices :
      creds.tipo === "smartone"    ? getSmartOneDevices :
      getFunPlaysDevices;
    const getPlaylistsFn =
      creds.tipo === "lazerplay"   ? getLazerPlayPlaylists :
      creds.tipo === "coreplayer"  ? getCorePlayerPlaylists :
      creds.tipo === "smartone"    ? getSmartOnePlaylists :
      getFunPlaysPlaylists;

    const devices = await getDevicesFn(jwt);
    const stats: Stats = { inseridos: 0, atualizados: 0, playlists_sincronizadas: 0, playlists_removidas: 0, removidos: 0 };

    await mapConcorrente(devices, CONCORRENCIA, async (dev) => {
      const { rows: existentes } = await pool.query<{ id_app_registro: number; id_cliente: number | null }>(
        `SELECT id_app_registro, id_cliente
         FROM public.aplicativos
         WHERE UPPER(mac) = UPPER($1) AND id_app = $2
         LIMIT 1`,
        [dev.mac, idApp]
      );

      const validade = dev.activation_expired
        ? new Date(dev.activation_expired).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        : null;

      let idAppRegistro: number;

      if (existentes.length > 0) {
        idAppRegistro = existentes[0].id_app_registro;
        await pool.query(
          `UPDATE public.aplicativos
           SET validade = $1, modelo = $2, chave = $3, id_painel_servidor = $4, atualizado_em = NOW(), removido_em = NULL
           WHERE id_app_registro = $5`,
          [validade, dev.model ?? null, String(dev.id), idPainel, idAppRegistro]
        );
        stats.atualizados++;
      } else {
        const { rows: ins } = await pool.query<{ id_app_registro: number }>(
          `INSERT INTO public.aplicativos
             (id_app, mac, chave, validade, modelo, id_painel_servidor,
              status, data_cadastro, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, 'ativa', NOW(), NOW())
           RETURNING id_app_registro`,
          [idApp, dev.mac, String(dev.id), validade, dev.model ?? null, idPainel]
        );
        idAppRegistro = ins[0].id_app_registro;
        stats.inseridos++;
      }

      let playlists: AppAcessoPlaylist[] = [];
      let playlistsOk = true;
      try {
        playlists = await getPlaylistsFn(jwt, dev.id);
      } catch {
        playlistsOk = false; // falha na busca — não mexe nas playlists já salvas deste device
      }

      for (const pl of playlists) {
        let idConta: number | null = null;
        const username = pl.url ? extrairUsernameUrl(pl.url) : null;
        if (username) {
          const { rows: contaRows } = await pool.query<{ id_conta: number }>(
            `SELECT id_conta FROM public.contas WHERE usuario = $1 AND removido_em IS NULL LIMIT 1`,
            [username]
          );
          idConta = contaRows[0]?.id_conta ?? null;
        }

        await pool.query(
          `INSERT INTO public.aplicativo_playlists
             (id_app_registro, playlist_id_externo, nome, url, is_selected, expired_date, id_conta, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id_app_registro, playlist_id_externo)
           DO UPDATE SET
             nome         = EXCLUDED.nome,
             url          = EXCLUDED.url,
             is_selected  = EXCLUDED.is_selected,
             expired_date = EXCLUDED.expired_date,
             id_conta     = EXCLUDED.id_conta,
             atualizado_em = NOW()`,
          [idAppRegistro, pl.id, pl.name ?? null, pl.url ?? null, pl.is_selected ?? false, pl.expired_date ?? null, idConta]
        );
        stats.playlists_sincronizadas++;
      }

      // Remove localmente as playlists que sumiram do device no painel remoto —
      // só quando a busca deu certo (playlistsOk), pra uma falha transitória da API
      // não apagar playlists que continuam existindo de verdade.
      if (playlistsOk) {
        const idsAtuais = playlists.map(p => p.id);
        const { rowCount } = await pool.query(
          `DELETE FROM public.aplicativo_playlists
           WHERE id_app_registro = $1
             AND playlist_id_externo != ALL($2::bigint[])`,
          [idAppRegistro, idsAtuais]
        );
        stats.playlists_removidas += rowCount ?? 0;
      }

      // CorePlayer/SmartOne: complementa o vínculo de cliente via MAC já vinculado em outro app/painel
      if ((creds.tipo === "coreplayer" || creds.tipo === "smartone") && !existentes[0]?.id_cliente) {
        const { rows: vinculoRows } = await pool.query<{ id_cliente: number }>(
          `SELECT id_cliente FROM public.aplicativos
           WHERE UPPER(mac) = UPPER($1) AND id_cliente IS NOT NULL AND id_app_registro != $2
           LIMIT 1`,
          [dev.mac, idAppRegistro]
        );
        if (vinculoRows.length === 1) {
          await pool.query(
            `UPDATE public.aplicativos SET id_cliente = $1 WHERE id_app_registro = $2`,
            [vinculoRows[0].id_cliente, idAppRegistro]
          );
        }
      }
    });

    // Detecção de exclusão remota: devices que sumiram da resposta da API são
    // marcados como removidos localmente, com a mesma guarda de segurança usada
    // no sync de contas (aborta se a API devolver menos de 50% do volume ativo
    // esperado, pra não apagar tudo numa falha parcial).
    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM public.aplicativos WHERE id_painel_servidor = $1 AND removido_em IS NULL`,
      [idPainel]
    );
    const totalAtivos = Number(countRows[0]?.total ?? 0);
    const syncConfiavel = devices.length > 0 && (totalAtivos === 0 || devices.length >= totalAtivos * 0.5);

    if (syncConfiavel) {
      const macsAtuais = devices.map(d => d.mac.toUpperCase());
      const { rowCount } = await pool.query(
        `UPDATE public.aplicativos
         SET removido_em = NOW()
         WHERE id_painel_servidor = $1
           AND UPPER(mac) != ALL($2::text[])
           AND removido_em IS NULL`,
        [idPainel, macsAtuais]
      );
      stats.removidos = rowCount ?? 0;
    }

    jobs.set(jobId, {
      done: true,
      ok: true,
      total_devices: devices.length,
      stats,
      aviso: syncConfiavel ? undefined : "Sync com retorno insuficiente — remoções ignoradas por segurança.",
    });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao sincronizar." });
  }

  // Limpa o job após 15 minutos
  setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
}

// POST — inicia o job em background e retorna imediatamente
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const jobId = `apps-${idPainel}-${Date.now()}`;
  jobs.set(jobId, { done: false });

  // Fire and forget — não bloqueia a resposta HTTP
  executarSync(idPainel, jobId).catch(() => {});

  return NextResponse.json({ jobId, status: "em_andamento" });
}

// GET — verifica o status do job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  await params;
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
