export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import type { ServidorCredenciais } from "@/lib/painel-adapters/types";
import { loginFunPlays, getDispositivos as getFunPlaysDevices, getPlaylistsDispositivo as getFunPlaysPlaylists, editarComentario as editarComentarioFunPlays } from "@/lib/painel-adapters/funplays";
import { loginLazerPlay, getDispositivos as getLazerPlayDevices, getPlaylistsDispositivo as getLazerPlayPlaylists, editarComentario as editarComentarioLazerPlay } from "@/lib/painel-adapters/lazerplay";
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

type Stats = {
  inseridos: number; atualizados: number; playlists_sincronizadas: number; playlists_removidas: number; removidos: number; erros: number;
  /** Chave real recuperada do painel (antes estava o número interno, ver sql/014). */
  chaves_restauradas: number;
  /** Chave real diferente da que estava salva — a anterior vai pra chave_anterior. */
  chaves_mudaram: number;
  /** SmartOne (sem chave): número interno que estava em `chave` foi limpo. */
  chaves_limpas: number;
  /** FunPlay: comentário "N/A" preenchido com o nome do cliente. */
  comentarios_preenchidos: number;
};
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

type PainelSync = ServidorCredenciais & { tipo: string; id: number; nome: string };
type DeviceComum = {
  id: number; mac: string; model?: string | null; activation_expired: string | null; key?: string | number | null;
  device_note?: { comment: string | null } | null;
};

/** Comentário vazio pro FunPlay (o site mostra "N/A") — aparelho recém-migrado chega assim. */
function semComentario(dev: DeviceComum): boolean {
  const c = dev.device_note?.comment?.trim() ?? "";
  return c === "" || c.toUpperCase() === "N/A";
}

/** Login (reaproveita sessão válida) + lista de aparelhos de UM painel. */
async function listarPainel(p: PainelSync): Promise<{ jwt: string; devices: DeviceComum[] }> {
  let jwt = p.session_cookie ?? "";
  const precisaRelogar = p.tipo === "smartone" ? !sessaoValida(p) : !jwtValidoAppAcesso(jwt);
  if (precisaRelogar) {
    const loginFn =
      p.tipo === "lazerplay" ? loginLazerPlay :
      p.tipo === "coreplayer" ? loginCorePlayer :
      p.tipo === "smartone" ? loginSmartOne :
      loginFunPlays;
    const { token, expiry } = await loginFn(p.painel_usuario, p.painel_senha);
    jwt = token;
    await pool.query(
      `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
      [token, expiry, p.id]
    );
  }
  const getDevicesFn =
    p.tipo === "lazerplay"   ? getLazerPlayDevices :
    p.tipo === "coreplayer"  ? getCorePlayerDevices :
    p.tipo === "smartone"    ? getSmartOneDevices :
    getFunPlaysDevices;
  return { jwt, devices: (await getDevicesFn(jwt)) as DeviceComum[] };
}

/**
 * Chave real que o painel informa pro aparelho. FunPlay/LazerPlay/CorePlayer mandam `key`;
 * o SmartOne não tem chave (ativa só pelo MAC) → null.
 */
function chaveReal(dev: DeviceComum): string | null {
  const k = dev.key;
  if (k === null || k === undefined) return null;
  const t = String(k).trim();
  return t || null;
}

/**
 * Sincroniza TODOS os painéis do mesmo tipo juntos (ex.: FunPlay antigo + novo, 08/10/2026).
 *
 * Por quê: o aparelho é identificado pelo MAC (1 linha por MAC+app). Quando ele migra de painel,
 * sai do antigo e entra no novo. Sincronizando um painel por vez, o antigo podia rodar ANTES do
 * novo e marcar o aparelho como removido (apagando validade e playlists) até o próximo sync do
 * novo. Lendo as listas de todos primeiro, o dono de cada MAC é o painel que o lista (se aparecer
 * em dois, o de validade maior) e só é removido o que não está em NENHUM deles.
 */
async function executarSync(idPainel: number, jobId: string) {
  try {
    const { rows: pedido } = await pool.query<{ tipo: string }>(
      `SELECT tipo FROM public.painel_servidores WHERE id = $1`,
      [idPainel]
    );
    if (!pedido.length) {
      jobs.set(jobId, { done: true, ok: false, erro: "Painel não encontrado." });
      return;
    }
    const tipo = pedido[0].tipo;
    const tipoSuportado = ["funplays", "lazerplay", "coreplayer", "smartone"];
    if (!tipoSuportado.includes(tipo)) {
      jobs.set(jobId, { done: true, ok: false, erro: `Painel tipo "${tipo}" não suporta sync de aplicativos.` });
      return;
    }
    const idApp = ID_APP[tipo];

    // Todos os painéis ATIVOS desse tipo (+ o pedido, mesmo se inativo). Mais novo primeiro.
    const { rows: paineis } = await pool.query<PainelSync>(
      `SELECT id, tipo, nome, usuario AS painel_usuario, senha AS painel_senha, session_cookie, session_expiry
       FROM public.painel_servidores
       WHERE tipo = $1 AND (ativo = true OR id = $2)
       ORDER BY id DESC`,
      [tipo, idPainel]
    );

    // 1) Listas de todos. Se UM falhar, nada é gravado (sem a lista de todos não dá pra saber o
    //    dono de cada MAC nem o que foi removido de verdade).
    const listas: { painel: PainelSync; jwt: string; devices: DeviceComum[] }[] = [];
    for (const p of paineis) {
      try {
        const { jwt, devices } = await listarPainel(p);
        listas.push({ painel: p, jwt, devices });
      } catch (e: unknown) {
        throw new Error(`${p.nome}: ${e instanceof Error ? e.message : "falha ao listar aparelhos"}`);
      }
    }

    // 2) Dono de cada MAC: o painel que o lista; em dois, o de validade maior.
    type Item = { painel: PainelSync; jwt: string; dev: DeviceComum };
    const donos = new Map<string, Item>();
    let emDoisPaineis = 0;
    for (const l of listas) {
      for (const dev of l.devices) {
        const mac = dev.mac.toUpperCase();
        const atual = donos.get(mac);
        if (atual) {
          emDoisPaineis++;
          const va = atual.dev.activation_expired ? Date.parse(atual.dev.activation_expired) : 0;
          const vn = dev.activation_expired ? Date.parse(dev.activation_expired) : 0;
          if (vn <= va) continue;
        }
        donos.set(mac, { painel: l.painel, jwt: l.jwt, dev });
      }
    }
    const itens = [...donos.values()];

    const stats: Stats = {
      inseridos: 0, atualizados: 0, playlists_sincronizadas: 0, playlists_removidas: 0, removidos: 0, erros: 0,
      chaves_restauradas: 0, chaves_mudaram: 0, chaves_limpas: 0, comentarios_preenchidos: 0,
    };

    await mapConcorrente(itens, CONCORRENCIA, async ({ painel, jwt, dev }) => {
      const idPainelDono = painel.id;
      try {
        const { rows: existentes } = await pool.query<{ id_app_registro: number; id_cliente: number | null; chave: string | null }>(
          `SELECT id_app_registro, id_cliente, chave
           FROM public.aplicativos
           WHERE UPPER(mac) = UPPER($1) AND id_app = $2
           ORDER BY (removido_em IS NULL) DESC, id_app_registro DESC
           LIMIT 1`,
          [dev.mac, idApp]
        );

        const validade = dev.activation_expired
          ? new Date(dev.activation_expired).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
          : null;
        const idInterno = String(dev.id);
        const nova = chaveReal(dev);

        // Chave: a do painel é a verdade. O número interno que o sync antigo gravou em `chave`
        // não conta como "chave anterior" (nunca foi chave) — só uma chave real diferente conta.
        const decidirChave = (atual: string | null): { chave: string | null; anterior: string | null } => {
          if (nova) {
            if (atual === nova) return { chave: nova, anterior: null };
            if (atual && atual !== idInterno) {
              stats.chaves_mudaram++;
              return { chave: nova, anterior: atual };
            }
            stats.chaves_restauradas++;
            return { chave: nova, anterior: null };
          }
          if (atual === idInterno) {
            stats.chaves_limpas++;
            return { chave: null, anterior: null };
          }
          return { chave: atual, anterior: null };
        };

        const atualizar = async (idAppRegistro: number, chaveAtual: string | null) => {
          const { chave, anterior } = decidirChave(chaveAtual);
          await pool.query(
            `UPDATE public.aplicativos
             SET validade = $1, modelo = $2, chave = $3, id_dispositivo_painel = $4, id_painel_servidor = $5,
                 chave_anterior = COALESCE($6, chave_anterior),
                 chave_mudou_em = CASE WHEN $6::varchar IS NOT NULL THEN NOW() ELSE chave_mudou_em END,
                 atualizado_em = NOW(), removido_em = NULL
             WHERE id_app_registro = $7`,
            [validade, dev.model ?? null, chave, dev.id, idPainelDono, anterior, idAppRegistro]
          );
        };

        let idAppRegistro: number;

        if (existentes.length > 0) {
          idAppRegistro = existentes[0].id_app_registro;
          await atualizar(idAppRegistro, existentes[0].chave);
          stats.atualizados++;
        } else {
          try {
            const { rows: ins } = await pool.query<{ id_app_registro: number }>(
              `INSERT INTO public.aplicativos
                 (id_app, mac, chave, id_dispositivo_painel, validade, modelo, id_painel_servidor,
                  status, data_cadastro, atualizado_em)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'ativa', NOW(), NOW())
               RETURNING id_app_registro`,
              [idApp, dev.mac, nova, dev.id, validade, dev.model ?? null, idPainelDono]
            );
            idAppRegistro = ins[0].id_app_registro;
            stats.inseridos++;
          } catch (e: unknown) {
            // Corrida entre workers (mesmo MAC 2x / duas execuções) — ver incidente 11/07 e
            // reference_unique_telefone_mac: a linha que ganhou já existe, trata como UPDATE.
            const codigo = (e as { code?: string } | null)?.code;
            if (codigo !== "23505") throw e;
            const { rows: retry } = await pool.query<{ id_app_registro: number; chave: string | null }>(
              `SELECT id_app_registro, chave FROM public.aplicativos WHERE UPPER(mac) = UPPER($1) AND id_app = $2 LIMIT 1`,
              [dev.mac, idApp]
            );
            if (!retry.length) throw e;
            idAppRegistro = retry[0].id_app_registro;
            await atualizar(idAppRegistro, retry[0].chave);
            stats.atualizados++;
          }
        }

        const getPlaylistsFn =
          painel.tipo === "lazerplay"   ? getLazerPlayPlaylists :
          painel.tipo === "coreplayer"  ? getCorePlayerPlaylists :
          painel.tipo === "smartone"    ? getSmartOnePlaylists :
          getFunPlaysPlaylists;
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

        // Remove localmente as playlists que sumiram do device no painel remoto — só quando a
        // busca deu certo, pra uma falha transitória da API não apagar playlists de verdade.
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

        // FunPlay/LazerPlay: aparelho sem comentário ("N/A" — ex.: recém-migrado pro painel novo) e com
        // cliente vinculado recebe o nome do cliente no painel, pra facilitar a busca lá (pedido do Jonas
        // 08/10; endpoint confirmado nos dois). Acessório: falha aqui não conta como erro do aparelho.
        const editarComentario =
          painel.tipo === "funplays" ? editarComentarioFunPlays :
          painel.tipo === "lazerplay" ? editarComentarioLazerPlay : null;
        if (editarComentario && semComentario(dev)) {
          const { rows: cli } = await pool.query<{ nome: string | null }>(
            `SELECT cl.nome FROM public.aplicativos ap JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
             WHERE ap.id_app_registro = $1`,
            [idAppRegistro]
          );
          const nome = cli[0]?.nome?.trim();
          if (nome) {
            try {
              await editarComentario(jwt, dev.id, nome.slice(0, 100));
              stats.comentarios_preenchidos++;
            } catch (e: unknown) {
              console.error(`[sync-aplicativos] comentário não gravado (${dev.mac}):`, e instanceof Error ? e.message : e);
            }
          }
        }

        // CorePlayer/SmartOne: complementa o vínculo de cliente via MAC já vinculado em outro app/painel
        if ((painel.tipo === "coreplayer" || painel.tipo === "smartone") && !existentes[0]?.id_cliente) {
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
      } catch (e: unknown) {
        // Isola falha de UM device — nunca deixa um problema pontual abortar o job inteiro.
        stats.erros++;
        console.error(`[sync-aplicativos] falha no device ${dev.mac} (painel ${idPainelDono}):`, e instanceof Error ? e.message : e);
      }
    });

    // 3) Remoção: aparelho ligado a QUALQUER painel deste tipo que não aparece em NENHUMA lista.
    //    Guarda de segurança (falha parcial da API): só remove se o total listado for ≥ 50% do que
    //    o banco tem ativo nesses painéis.
    const idsPaineis = listas.map(l => l.painel.id);
    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM public.aplicativos WHERE id_painel_servidor = ANY($1::bigint[]) AND removido_em IS NULL`,
      [idsPaineis]
    );
    const totalAtivos = Number(countRows[0]?.total ?? 0);
    const syncConfiavel = itens.length > 0 && (totalAtivos === 0 || itens.length >= totalAtivos * 0.5);

    if (syncConfiavel) {
      const macsAtuais = [...donos.keys()];
      const { rows: removidosRows } = await pool.query<{ id_app_registro: number }>(
        `UPDATE public.aplicativos
         SET removido_em = NOW()
         WHERE id_painel_servidor = ANY($1::bigint[])
           AND UPPER(mac) != ALL($2::text[])
           AND removido_em IS NULL
         RETURNING id_app_registro`,
        [idsPaineis, macsAtuais]
      );
      stats.removidos = removidosRows.length;

      // Device sumiu de todos os painéis = licença reaproveitada em outro device (regra confirmada
      // 31/08/2026). Playlist e validade ficam sem sentido — limpa junto, só desta execução.
      if (removidosRows.length > 0) {
        const idsRemovidos = removidosRows.map(r => r.id_app_registro);
        const { rowCount: playlistsOrfas } = await pool.query(
          `DELETE FROM public.aplicativo_playlists WHERE id_app_registro = ANY($1::bigint[])`,
          [idsRemovidos]
        );
        stats.playlists_removidas += playlistsOrfas ?? 0;
        await pool.query(
          `UPDATE public.aplicativos SET validade = NULL WHERE id_app_registro = ANY($1::bigint[])`,
          [idsRemovidos]
        );
      }
    }

    const porPainel = listas.length > 1
      ? `Painéis lidos juntos: ${listas.map(l => `${l.painel.nome} (${l.devices.length})`).join(" · ")}.`
      : null;
    const avisos = [
      porPainel,
      emDoisPaineis > 0 ? `${emDoisPaineis} aparelho(s) apareceram em dois painéis — ficou o de validade maior.` : null,
      stats.chaves_mudaram > 0 ? `${stats.chaves_mudaram} chave(s) mudaram no painel (a anterior ficou guardada).` : null,
      stats.comentarios_preenchidos > 0 ? `${stats.comentarios_preenchidos} comentário(s) "N/A" preenchidos com o nome do cliente no painel.` : null,
      !syncConfiavel ? "Sync com retorno insuficiente — remoções ignoradas por segurança." : null,
      stats.erros > 0 ? `${stats.erros} device(s) falharam individualmente e foram pulados — ver logs do servidor.` : null,
    ].filter(Boolean);

    jobs.set(jobId, {
      done: true,
      ok: true,
      total_devices: itens.length,
      stats,
      aviso: avisos.length > 0 ? avisos.join(" ") : undefined,
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
