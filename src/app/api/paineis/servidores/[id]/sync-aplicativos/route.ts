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


export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  // Buscar credenciais e tipo do painel
  const { rows: painelRows } = await pool.query<
    ServidorCredenciais & { tipo: string; id: number }
  >(
    `SELECT id, tipo, usuario AS painel_usuario, senha AS painel_senha,
            session_cookie, session_expiry
     FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );

  if (!painelRows.length) return NextResponse.json({ erro: "Painel não encontrado." }, { status: 404 });
  const creds = painelRows[0];

  const tipoSuportado = ["funplays", "lazerplay", "coreplayer", "smartone"];
  if (!tipoSuportado.includes(creds.tipo)) {
    return NextResponse.json({ erro: `Painel tipo "${creds.tipo}" não suporta sync de aplicativos.` }, { status: 400 });
  }

  const idApp = ID_APP[creds.tipo];

  // Obter sessão — reusar se ainda válida, senão relogar.
  // SmartOne usa cookie de sessão Blesta (validade via session_expiry); os demais usam JWT auto-descritivo.
  let jwt = creds.session_cookie ?? "";
  const precisaRelogar = creds.tipo === "smartone" ? !sessaoValida(creds) : !jwtValidoAppAcesso(jwt);
  if (precisaRelogar) {
    try {
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
    } catch (e: any) {
      return NextResponse.json({ erro: `Login ${creds.tipo} falhou: ${e.message}` }, { status: 502 });
    }
  }

  // Buscar todos os devices
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

  let devices;
  try {
    devices = await getDevicesFn(jwt);
  } catch (e: any) {
    return NextResponse.json({ erro: `Erro ao buscar devices: ${e.message}` }, { status: 502 });
  }

  const stats = { inseridos: 0, atualizados: 0, playlists_sincronizadas: 0 };

  for (const dev of devices) {
    // Busca por mac + id_app (não por painel): o mesmo device pode já existir
    // com id_painel_servidor NULL (cadastro manual anterior à automação).
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
         SET validade = $1, modelo = $2, chave = $3, id_painel_servidor = $4, atualizado_em = NOW()
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

    // Sincronizar playlists deste device (FunPlays / LazerPlay / CorePlayer)
    let playlists: AppAcessoPlaylist[];
    try {
      playlists = await getPlaylistsFn(jwt, dev.id);
    } catch {
      playlists = [];
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

    // CorePlayer/SmartOne: complementa o vínculo de cliente via MAC já vinculado em outro app/painel
    // (mesmo dispositivo físico, ex.: cliente trocou de player mas manteve o mesmo MAC).
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
  }

  return NextResponse.json({
    ok: true,
    total_devices: devices.length,
    ...stats,
  });
}
