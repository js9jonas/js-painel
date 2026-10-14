// IBO Player (id_app 8) e IBO Xplayer (id_app 34) no js-painel (13/10/2026). Adapter: src/lib/painel-adapters/iboplayer.ts.
// O IBO Xplayer usa a mesma revenda IBOSOL (outro app_id/módulo) e o site do cliente iboxxiptv.com.
//
// - Revenda IBOSOL (painel_servidores tipo 'iboplayer'): validade, último acesso, chave do aparelho,
//   ativação (1 crédito = 1 ano), comentário com o nome do cliente, troca de endereço em massa.
// - Site do cliente (MAC + aplicativos.chave + captcha lido pelo Claude): listas, só sob demanda.
// Listas em aplicativo_playlists com playlist_id_externo = últimos 12 hex do id (igual ao IBO Pro).
// id_dispositivo_painel fica NULL (id do aparelho é hex); tudo pelo MAC.
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { ID_APP_IBOXPLAYER, IBOSOL_POR_ID_APP } from "@/lib/apps-painel-ids";
import { idNumericoLista } from "@/lib/painel-adapters/ibopro";
import {
  apagarListaIboPlayer,
  ativarIbosol,
  comentarIbosol,
  consultarIbosol,
  entrarClienteIboPlayer,
  listarAtivadosIbosol,
  listasIboPlayer,
  loginIbosol,
  MacInvalidoIbosol,
  salvarListaIboPlayer,
  SessaoIbosolExpirada,
  type IbosolDispositivo,
  type ListaIboPlayer,
  type SessaoClienteIboPlayer,
} from "@/lib/painel-adapters/iboplayer";

export type PainelIboPlayer = { id: number; nome: string; email: string };

export async function painelIboPlayerAtivo(): Promise<PainelIboPlayer | null> {
  const { rows } = await pool.query<{ id: number; nome: string; usuario: string | null }>(
    `SELECT id, nome, usuario FROM public.painel_servidores WHERE tipo = 'iboplayer' AND ativo = true ORDER BY id DESC LIMIT 1`
  );
  return rows[0] ? { id: Number(rows[0].id), nome: rows[0].nome, email: rows[0].usuario ?? "" } : null;
}

/** Token da revenda: reaproveita o salvo enquanto vale; senão login (Turnstile via CapSolver) e salva. */
export async function sessaoIbosol(idPainel: number, forcar = false): Promise<string> {
  const { rows } = await pool.query<{ usuario: string | null; senha: string | null; session_cookie: string | null; session_expiry: Date | null }>(
    `SELECT usuario, senha, session_cookie, session_expiry FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  const r = rows[0];
  if (!r) throw new Error("Painel IBO Player não encontrado.");
  if (!forcar && r.session_cookie && r.session_expiry && new Date(r.session_expiry).getTime() - 60_000 > Date.now()) return r.session_cookie;
  if (!r.usuario || !r.senha) throw new Error("Painel IBO Player sem usuário/senha. Preencha em Conexões → IBO Player → Editar.");
  const { token, expiry } = await loginIbosol(r.usuario, r.senha);
  await pool.query(`UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`, [token, expiry, idPainel]);
  return token;
}

/** Roda com a sessão da revenda; se o token caiu antes da hora (401), reloga uma vez. */
export async function comIbosol<T>(idPainel: number, fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await sessaoIbosol(idPainel));
  } catch (e) {
    if (!(e instanceof SessaoIbosolExpirada)) throw e;
    return fn(await sessaoIbosol(idPainel, true));
  }
}

function usuarioDaUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("username");
  } catch {
    return null;
  }
}

/** Espelha as listas do aparelho em aplicativo_playlists (some o que não existe mais). */
export async function gravarListasIboPlayer(idAppRegistro: number, listas: ListaIboPlayer[]): Promise<number> {
  for (const [i, pl] of listas.entries()) {
    const usuario = pl.url ? usuarioDaUrl(pl.url) : null;
    const { rows } = usuario
      ? await pool.query<{ id_conta: number }>(`SELECT id_conta FROM public.contas WHERE usuario = $1 AND removido_em IS NULL LIMIT 1`, [usuario])
      : { rows: [] as { id_conta: number }[] };
    await pool.query(
      `INSERT INTO public.aplicativo_playlists (id_app_registro, playlist_id_externo, nome, url, is_selected, id_conta, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id_app_registro, playlist_id_externo)
       DO UPDATE SET nome = EXCLUDED.nome, url = EXCLUDED.url, is_selected = EXCLUDED.is_selected, id_conta = EXCLUDED.id_conta, atualizado_em = NOW()`,
      [idAppRegistro, idNumericoLista(pl.id), pl.nome ?? null, pl.url ?? null, i === 0, rows[0]?.id_conta ?? null]
    );
  }
  const { rowCount } = await pool.query(
    `DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo != ALL($2::bigint[])`,
    [idAppRegistro, listas.map((l) => idNumericoLista(l.id))]
  );
  return rowCount ?? 0;
}

// ---------- Aplicativo do cliente ----------

type AppIboPlayer = {
  id_app_registro: number; id_app: number; id_cliente: number | null; mac: string; chave: string | null;
  validade: string | null; id_painel_servidor: number | null; nome_cliente: string | null;
};

async function carregar(idAppRegistro: number): Promise<AppIboPlayer> {
  const { rows } = await pool.query<AppIboPlayer>(
    `SELECT ap.id_app_registro::int, ap.id_cliente::int, ap.mac, ap.chave, ap.validade::text, ap.id_painel_servidor::int,
            ap.id_app::int, cl.nome AS nome_cliente
     FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     WHERE ap.id_app_registro = $1 AND ap.removido_em IS NULL`,
    [idAppRegistro]
  );
  const a = rows[0];
  if (!a) throw new Error("Aplicativo não encontrado.");
  if (!IBOSOL_POR_ID_APP[a.id_app]) throw new Error("Esse aplicativo não é da revenda IBOSOL.");
  if (!a.mac) throw new Error("Aplicativo sem MAC cadastrado.");
  return a;
}

// Token do site do cliente vale 1 dia: guardado em memória por MAC + chave (cada login gasta 1 leitura
// de captcha e conta no limite de 20 tentativas por janela do site).
const tokensCliente = new Map<string, SessaoClienteIboPlayer>();

/** Chave mascarada ("******", como a revenda mostra) não é chave. */
export const chaveMascarada = (c: string | null | undefined) => !!c && /^\*+$/.test(c.trim());

async function entrarComoCliente(app: AppIboPlayer): Promise<SessaoClienteIboPlayer> {
  if (!app.chave || chaveMascarada(app.chave)) {
    throw new Error("Falta a chave (Device Key) real do aparelho no cadastro (a revenda só mostra ******). Peça a chave que aparece na TV e preencha em Editar.");
  }
  const site = app.id_app === ID_APP_IBOXPLAYER ? "iboxplayer" : "iboplayer";
  const k = `${site}|${app.mac.trim().toLowerCase()}|${app.chave.trim()}`;
  const guardada = tokensCliente.get(k);
  if (guardada && guardada.expira - 5 * 60_000 > Date.now()) return guardada;
  const s = await entrarClienteIboPlayer(app.mac, app.chave, site);
  tokensCliente.set(k, s);
  return s;
}

/** Grava validade/painel/último acesso e, se o cadastro não tinha a chave (ou ela mudou), a da revenda. */
async function gravarDaRevenda(app: AppIboPlayer, dev: IbosolDispositivo, idPainel: number, descricao: string, status?: "ativa") {
  const chaveNova = dev.chave && !chaveMascarada(dev.chave) && dev.chave !== app.chave ? dev.chave : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.aplicativos
       SET validade = $1::date, id_painel_servidor = $2, id_dispositivo_painel = NULL,
           lista_acessada_em = COALESCE($3::date, lista_acessada_em),
           chave_anterior = CASE WHEN $4::varchar IS NOT NULL AND chave IS NOT NULL AND chave <> '' THEN chave ELSE chave_anterior END,
           chave = COALESCE($4, chave),
           status = COALESCE($6, status), removido_em = NULL, atualizado_em = NOW()
       WHERE id_app_registro = $5`,
      [dev.validade, idPainel, dev.ultimoAcesso, chaveNova, app.id_app_registro, status ?? null]
    );
    if (dev.validade !== app.validade || chaveNova || status) {
      await registrarAudit(client, {
        tipo: "alteracao_app",
        id_cliente: app.id_cliente,
        id_app_registro: app.id_app_registro,
        descricao,
        dados_antes: { validade: app.validade, id_painel_servidor: app.id_painel_servidor },
        dados_depois: { validade: dev.validade, id_painel_servidor: idPainel, chave_atualizada: !!chaveNova },
      });
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  if (chaveNova) app.chave = chaveNova;
}

/** Botão "Atualizar": validade/último acesso/chave pela revenda + listas pelo site do cliente. */
export async function atualizarAppIboPlayer(idAppRegistro: number): Promise<{ validade: string | null; mudou: boolean; aviso?: string }> {
  const app = await carregar(idAppRegistro);
  const painel = await painelIboPlayerAtivo();
  if (!painel) throw new Error("Nenhum painel IBO Player ativo cadastrado (Conexões).");
  const cfg = IBOSOL_POR_ID_APP[app.id_app];
  const dev = await comIbosol(painel.id, (t) => consultarIbosol(t, app.mac, cfg.appId));
  if (!dev) throw new Error(`O ${cfg.nome} não encontrou esse MAC na IBOSOL. Confira se o aplicativo já foi aberto na TV e se o app do cadastro está certo.`);
  const mudou = dev.validade !== app.validade || app.id_painel_servidor !== painel.id;
  await gravarDaRevenda(app, dev, painel.id, `Validade atualizada pelo painel ${painel.nome} (só este aparelho)`);

  let aviso: string | undefined;
  try {
    await gravarListasIboPlayer(idAppRegistro, await listasIboPlayer(await entrarComoCliente(app)));
  } catch (e: unknown) {
    aviso = `Listas não lidas: ${e instanceof Error ? e.message : "erro"}`;
  }
  return { validade: dev.validade, mudou, aviso };
}

const DIAS_JA_ATIVADO = 40;

/** Renova 1 ano (1 CRÉDITO). Validade a mais de 40 dias = já ativado, só copia. Grava o nome no comentário. */
export async function ativarAppIboPlayer(idAppRegistro: number): Promise<{ validade: string | null; jaAtivado: boolean }> {
  const app = await carregar(idAppRegistro);
  const painel = await painelIboPlayerAtivo();
  if (!painel) throw new Error("Nenhum painel IBO Player ativo cadastrado (Conexões).");
  const cfg = IBOSOL_POR_ID_APP[app.id_app];
  return comIbosol(painel.id, async (token) => {
    const antes = await consultarIbosol(token, app.mac, cfg.appId);
    if (!antes) throw new Error(`O ${cfg.nome} não encontrou esse MAC na IBOSOL. Confira se o aplicativo já foi aberto na TV e se o app do cadastro está certo.`);
    const expira = antes.validade ? Date.parse(`${antes.validade}T23:59:59-03:00`) : 0;
    const jaAtivado = antes.status === "active" && expira > Date.now() + DIAS_JA_ATIVADO * 86_400_000;
    let depois = antes;
    if (!jaAtivado) {
      try {
        await ativarIbosol(token, app.mac, painel.email, cfg.modulo, cfg.appId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        throw new Error(/credit/i.test(msg) ? "Sem crédito no IBOSOL. Compre mais antes de renovar." : `O IBOSOL recusou a ativação${msg ? ` (${msg})` : ""}.`);
      }
      depois = (await consultarIbosol(token, app.mac, cfg.appId)) ?? antes;
      // Nome do cliente no registro de ativação (acessório)
      if (app.nome_cliente) {
        const reg = (await listarAtivadosIbosol(token, app.mac, [cfg.modulo]).catch(() => [])).find((x) => x.mac.toLowerCase() === app.mac.toLowerCase());
        if (reg && !reg.comentario) await comentarIbosol(token, reg.id, app.nome_cliente.slice(0, 100)).catch(() => {});
      }
    }
    await gravarDaRevenda(app, depois, painel.id, jaAtivado
      ? `Ativação no painel ${painel.nome} não feita: já estava ativado; validade copiada do painel`
      : `Ativado no painel ${painel.nome} (1 crédito, 1 ano)`, "ativa");
    return { validade: depois.validade, jaAtivado };
  });
}

// ---------- Listas (coluna Playlists de /clientes/[id]) ----------

/** Logo depois de salvar, vale a lista que o próprio POST devolveu (mesmo cuidado do IBO Pro). */
function mesclar(todas: ListaIboPlayer[], salva: ListaIboPlayer | null): ListaIboPlayer[] {
  if (!salva?.id) return todas;
  return todas.some((l) => l.id === salva.id) ? todas.map((l) => (l.id === salva.id ? salva : l)) : [...todas, salva];
}

async function idRealDaLista(s: SessaoClienteIboPlayer, idExterno: number): Promise<ListaIboPlayer> {
  const lista = (await listasIboPlayer(s)).find((l) => idNumericoLista(l.id) === Number(idExterno));
  if (!lista) throw new Error("Essa lista não existe mais no aparelho. Use Atualizar pra recarregar.");
  return lista;
}

async function auditarLista(app: AppIboPlayer, descricao: string, antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await registrarAudit(client, { tipo: "alteracao_app", id_cliente: app.id_cliente, id_app_registro: app.id_app_registro, descricao, dados_antes: antes, dados_depois: depois });
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

export async function criarListaAppIboPlayer(idAppRegistro: number, nome: string, url: string): Promise<void> {
  const app = await carregar(idAppRegistro);
  const s = await entrarComoCliente(app);
  const nova = await salvarListaIboPlayer(s, { nome, url });
  await gravarListasIboPlayer(idAppRegistro, mesclar(await listasIboPlayer(s), nova));
  await auditarLista(app, `Lista "${nome}" criada no ${IBOSOL_POR_ID_APP[app.id_app].nome}`, {}, { nome });
}

export async function editarListaAppIboPlayer(idAppRegistro: number, idExterno: number, dados: { nome?: string; url?: string }): Promise<void> {
  const app = await carregar(idAppRegistro);
  const s = await entrarComoCliente(app);
  const lista = await idRealDaLista(s, idExterno);
  const salva = await salvarListaIboPlayer(s, { id: lista.id, nome: dados.nome ?? lista.nome, url: dados.url ?? lista.url });
  await gravarListasIboPlayer(idAppRegistro, mesclar(await listasIboPlayer(s), salva));
  await auditarLista(app, `Lista "${dados.nome ?? lista.nome}" editada no ${IBOSOL_POR_ID_APP[app.id_app].nome}`, { nome: lista.nome }, { nome: dados.nome ?? lista.nome, url_trocada: dados.url != null && dados.url !== lista.url });
}

export async function apagarListaAppIboPlayer(idAppRegistro: number, idExterno: number): Promise<void> {
  const app = await carregar(idAppRegistro);
  const s = await entrarComoCliente(app);
  const lista = await idRealDaLista(s, idExterno);
  await apagarListaIboPlayer(s, lista.id);
  await gravarListasIboPlayer(idAppRegistro, (await listasIboPlayer(s)).filter((l) => l.id !== lista.id));
  await auditarLista(app, `Lista "${lista.nome}" apagada no ${IBOSOL_POR_ID_APP[app.id_app].nome}`, { nome: lista.nome }, {});
}

// ---------- Sync do painel (Conexões) ----------

export type StatsSyncIboPlayer = {
  inseridos: number; atualizados: number; erros: number; sem_chave: number; nomes_preenchidos: number;
  nao_encontrados: number; mac_invalido: number; por_app: Record<string, number>;
};

/**
 * Lê os aparelhos ativados pela revenda e consulta, um por um, os IBO Player cadastrados aqui (ativos):
 * validade, último acesso e chave. Cria (sem cliente) os ativados pela revenda que faltam aqui e grava o
 * nome do cliente no comentário vazio. NÃO lê listas (cada login do site do cliente gasta captcha).
 */
export async function sincronizarIboPlayer(idPainel: number): Promise<{ total: number; stats: StatsSyncIboPlayer }> {
  const stats: StatsSyncIboPlayer = { inseridos: 0, atualizados: 0, erros: 0, sem_chave: 0, nomes_preenchidos: 0, nao_encontrados: 0, mac_invalido: 0, por_app: {} };
  const idsApp = Object.keys(IBOSOL_POR_ID_APP).map(Number);
  const idAppDoModulo = new Map(idsApp.map((id) => [IBOSOL_POR_ID_APP[id].modulo, id]));
  return comIbosol(idPainel, async (token) => {
    const ativados = await listarAtivadosIbosol(token, "", [...idAppDoModulo.keys()]);
    const chaveDe = (idApp: number, mac: string) => `${idApp}|${mac.toLowerCase()}`;
    const { rows: apps } = await pool.query<{ id_app_registro: number; id_app: number; mac: string; chave: string | null; nome: string | null }>(
      `SELECT ap.id_app_registro::int, ap.id_app::int, ap.mac, ap.chave, cl.nome
       FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
       WHERE ap.id_app = ANY($1::bigint[]) AND ap.removido_em IS NULL AND ap.mac IS NOT NULL
         AND (lower(btrim(ap.status)) = 'ativa' OR (ap.id_app::text || '|' || lower(ap.mac)) = ANY($2::text[]))`,
      [idsApp, ativados.map((a) => chaveDe(idAppDoModulo.get(a.modulo)!, a.mac))]
    );
    const porChave = new Map(apps.map((a) => [chaveDe(a.id_app, a.mac), a]));

    // Ativados pela revenda que não existem aqui: entram sem cliente, no app certo
    for (const a of ativados) {
      const idApp = idAppDoModulo.get(a.modulo)!;
      if (porChave.has(chaveDe(idApp, a.mac))) continue;
      const { rows } = await pool.query<{ id_app_registro: number }>(
        `INSERT INTO public.aplicativos (id_app, mac, validade, modelo, id_painel_servidor, status, data_cadastro, atualizado_em)
         VALUES ($1, $2, $3::date, $4, $5, 'ativa', NOW(), NOW()) RETURNING id_app_registro::int`,
        [idApp, a.mac, a.validade, a.appType, idPainel]
      );
      stats.inseridos++;
      porChave.set(chaveDe(idApp, a.mac), { id_app_registro: rows[0].id_app_registro, id_app: idApp, mac: a.mac, chave: null, nome: null });
    }

    for (const app of porChave.values()) {
      const cfg = IBOSOL_POR_ID_APP[app.id_app];
      try {
        const dev = await consultarIbosol(token, app.mac, cfg.appId);
        if (!dev) { stats.nao_encontrados++; continue; }
        await pool.query(
          `UPDATE public.aplicativos
           SET validade = $1::date, id_painel_servidor = $2, id_dispositivo_painel = NULL, modelo = COALESCE($3, modelo),
               lista_acessada_em = COALESCE($4::date, lista_acessada_em),
               chave = CASE WHEN chave IS NULL OR chave = '' THEN COALESCE($5, chave) ELSE chave END,
               removido_em = NULL, atualizado_em = NOW()
           WHERE id_app_registro = $6`,
          [dev.validade, idPainel, dev.appType, dev.ultimoAcesso, dev.chave, app.id_app_registro]
        );
        stats.atualizados++;
        stats.por_app[cfg.nome] = (stats.por_app[cfg.nome] ?? 0) + 1;
        if ((!app.chave || chaveMascarada(app.chave)) && !dev.chave) stats.sem_chave++;
      } catch (e: unknown) {
        if (e instanceof SessaoIbosolExpirada) throw e;
        if (e instanceof MacInvalidoIbosol) { stats.mac_invalido++; continue; }
        stats.erros++;
        console.error(`[sync-ibosol] ${cfg.nome} ${app.mac}:`, e instanceof Error ? e.message : e);
      }
    }

    // Nome do cliente no comentário vazio do registro de ativação
    for (const a of ativados) {
      const nome = porChave.get(chaveDe(idAppDoModulo.get(a.modulo)!, a.mac))?.nome?.trim();
      if (nome && !a.comentario) await comentarIbosol(token, a.id, nome.slice(0, 100)).then(() => stats.nomes_preenchidos++).catch(() => {});
    }
    return { total: porChave.size, stats };
  });
}
