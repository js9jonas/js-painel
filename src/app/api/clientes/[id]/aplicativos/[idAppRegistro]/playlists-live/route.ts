export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { jwtValido, type AppAcessoPlaylist } from "@/lib/painel-adapters/appacesso";
import { getPlaylistsDispositivo as getFunPlaysPlaylists } from "@/lib/painel-adapters/funplays";
import { getPlaylistsDispositivo as getLazerPlayPlaylists } from "@/lib/painel-adapters/lazerplay";
import { getPlaylistsDispositivo as getCorePlayerPlaylists } from "@/lib/painel-adapters/coreplayer";
import { getPlaylistsDispositivo as getSmartOnePlaylists } from "@/lib/painel-adapters/smartone";

// Busca a playlist ao vivo de UM device específico — usa só a sessão já em cache
// do painel (nunca força relogin síncrono: se a sessão caducou, isso poderia disparar
// resolução de captcha e travar a página do cliente por até ~2min). Ver
// feedback_avaliacao_playlist_live na memória do projeto.

const PLAYLIST_FN: Record<string, (token: string, deviceId: number) => Promise<AppAcessoPlaylist[]>> = {
  funplays: getFunPlaysPlaylists,
  lazerplay: getLazerPlayPlaylists,
  coreplayer: getCorePlayerPlaylists,
  smartone: getSmartOnePlaylists,
};

function sessaoCacheValida(tipo: string, sessionCookie: string | null, sessionExpiry: Date | string | null): boolean {
  if (!sessionCookie) return false;
  // SmartOne usa cookie Blesta (não JWT) — validade só pelo session_expiry salvo
  if (tipo === "smartone") {
    return !!sessionExpiry && new Date(sessionExpiry).getTime() - 60_000 > Date.now();
  }
  return jwtValido(sessionCookie);
}

function extrairUsernameUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("username");
  } catch {
    return null;
  }
}

function comTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms)),
  ]);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; idAppRegistro: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, motivo: "nao_autorizado" }, { status: 401 });

  const { id, idAppRegistro } = await params;
  const idApp = parseInt(idAppRegistro, 10);
  if (isNaN(idApp)) return NextResponse.json({ ok: false, motivo: "id_invalido" });

  const { rows } = await pool.query<{
    chave: string | null;
    id_painel_servidor: number | null;
    tipo: string | null;
    session_cookie: string | null;
    session_expiry: Date | null;
  }>(
    `SELECT ap.chave, ap.id_painel_servidor, ps.tipo, ps.session_cookie, ps.session_expiry
     FROM public.aplicativos ap
     LEFT JOIN public.painel_servidores ps ON ps.id = ap.id_painel_servidor
     WHERE ap.id_app_registro = $1 AND ap.id_cliente = $2::int`,
    [idApp, id]
  );

  if (!rows.length) return NextResponse.json({ ok: false, motivo: "nao_encontrado" });
  const row = rows[0];

  if (!row.id_painel_servidor || !row.chave || !row.tipo) {
    return NextResponse.json({ ok: false, motivo: "sem_device" });
  }

  const playlistFn = PLAYLIST_FN[row.tipo];
  if (!playlistFn) return NextResponse.json({ ok: false, motivo: "tipo_nao_suportado" });

  if (!sessaoCacheValida(row.tipo, row.session_cookie, row.session_expiry)) {
    return NextResponse.json({ ok: false, motivo: "sem_sessao" });
  }

  const deviceId = parseInt(row.chave, 10);
  if (isNaN(deviceId)) return NextResponse.json({ ok: false, motivo: "device_invalido" });

  let playlists: AppAcessoPlaylist[];
  try {
    playlists = await comTimeout(playlistFn(row.session_cookie!, deviceId), 8000);
  } catch {
    return NextResponse.json({ ok: false, motivo: "erro_api" });
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
      [idApp, pl.id, pl.name ?? null, pl.url ?? null, pl.is_selected ?? false, pl.expired_date ?? null, idConta]
    );
  }

  const { rows: playlistRows } = await pool.query(
    `SELECT pl.id, pl.playlist_id_externo, pl.nome, pl.url, pl.is_selected, pl.expired_date::text,
            pl.id_conta, c.usuario AS usuario_conta,
            to_char(c.vencimento_real_painel, 'YYYY-MM-DD') AS venc_real_conta,
            c.status_conta
     FROM public.aplicativo_playlists pl
     LEFT JOIN public.contas c ON c.id_conta = pl.id_conta
     WHERE pl.id_app_registro = $1
     ORDER BY pl.is_selected DESC, pl.id ASC`,
    [idApp]
  );

  return NextResponse.json({ ok: true, playlists: playlistRows });
}
