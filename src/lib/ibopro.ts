// IBO Player Pro no js-painel (13/10/2026). Adapter: src/lib/painel-adapters/ibopro.ts.
//
// - Painel de revenda (painel_servidores tipo 'ibopro'): validade, nome do aparelho e ativação (1 crédito).
// - Site do cliente (MAC + aplicativos.chave): listas do aparelho, gravadas em aplicativo_playlists com
//   playlist_id_externo = últimos 12 hex do id da lista (a coluna é bigint; o id real é hexadecimal).
// O aparelho não tem id numérico: id_dispositivo_painel fica NULL e tudo é feito pelo MAC.
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { ID_APP_IBOPRO } from "@/lib/apps-painel-ids";
import {
  apagarListaIbo,
  ativarAparelhoIbo,
  buscarAparelhoIbo,
  entrarAparelhoIbo,
  iboPago,
  idNumericoLista,
  infoAparelhoIbo,
  listarAparelhosIbo,
  listasIbo,
  loginIboRevenda,
  renomearAparelhoIbo,
  salvarListaIbo,
  situacaoAparelhoIbo,
  tokenIboValido,
  validadeIbo,
  type IboDevice,
  type IboPlaylist,
  type SessaoAparelhoIbo,
} from "@/lib/painel-adapters/ibopro";

export type PainelIbo = { id: number; nome: string };

/** Painel IBO Pro ativo mais novo. */
export async function painelIboAtivo(): Promise<PainelIbo | null> {
  const { rows } = await pool.query<{ id: number; nome: string }>(
    `SELECT id, nome FROM public.painel_servidores WHERE tipo = 'ibopro' AND ativo = true ORDER BY id DESC LIMIT 1`
  );
  return rows[0] ? { id: Number(rows[0].id), nome: rows[0].nome } : null;
}

/** Token do painel de revenda: reaproveita o salvo se ainda vale; senão login (sem captcha) e salva. */
export async function sessaoIbo(idPainel: number): Promise<string> {
  const { rows } = await pool.query<{ usuario: string | null; senha: string | null; session_cookie: string | null }>(
    `SELECT usuario, senha, session_cookie FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  const r = rows[0];
  if (!r) throw new Error("Painel IBO Pro não encontrado.");
  if (tokenIboValido(r.session_cookie)) return r.session_cookie!;
  if (!r.usuario || !r.senha) throw new Error("Painel IBO Pro sem usuário/senha. Preencha em Conexões → IBO Pro → Editar.");
  const { token, expiry } = await loginIboRevenda(r.usuario, r.senha);
  await pool.query(`UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`, [token, expiry, idPainel]);
  return token;
}

function usuarioDaUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("username");
  } catch {
    return null;
  }
}

/** Espelha as listas do aparelho em aplicativo_playlists (some o que não existe mais). */
export async function gravarListasIbo(idAppRegistro: number, listas: IboPlaylist[]): Promise<number> {
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
      // O IBO não marca lista "ativa": a primeira fica marcada só pra coluna Playlists ter destaque
      [idAppRegistro, idNumericoLista(pl.id), pl.name ?? null, pl.url ?? null, i === 0, rows[0]?.id_conta ?? null]
    );
  }
  const { rowCount } = await pool.query(
    `DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo != ALL($2::bigint[])`,
    [idAppRegistro, listas.map((l) => idNumericoLista(l.id))]
  );
  return rowCount ?? 0;
}

// ---------- Aplicativo do cliente ----------

type AppIbo = {
  id_app_registro: number; id_cliente: number | null; mac: string; chave: string | null;
  validade: string | null; id_painel_servidor: number | null; nome_cliente: string | null;
};

async function carregar(idAppRegistro: number): Promise<AppIbo> {
  const { rows } = await pool.query<AppIbo & { id_app: number }>(
    `SELECT ap.id_app_registro::int, ap.id_cliente::int, ap.mac, ap.chave, ap.validade::text, ap.id_painel_servidor::int,
            ap.id_app::int, cl.nome AS nome_cliente
     FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     WHERE ap.id_app_registro = $1 AND ap.removido_em IS NULL`,
    [idAppRegistro]
  );
  const a = rows[0];
  if (!a) throw new Error("Aplicativo não encontrado.");
  if (a.id_app !== ID_APP_IBOPRO) throw new Error("Esse aplicativo não é IBO Pro.");
  if (!a.mac) throw new Error("Aplicativo sem MAC cadastrado.");
  return a;
}

// Login no site do cliente: o IBO limita POR IP — ~10 logins e vem "Too many requests!" com
// retry-after de ~24 h (medido em 13/10/2026). O token do cliente vale 10 dias, então fica guardado em
// memória por MAC + chave; mexer de novo no mesmo aparelho não gasta login.
const tokensCliente = new Map<string, SessaoAparelhoIbo>();

export class LimiteLoginIbo extends Error {}

/** Sessão do site do cliente, reaproveitando o token guardado. `logou` = fez login de verdade agora. */
export async function sessaoCliente(mac: string, chave: string): Promise<{ s: SessaoAparelhoIbo; logou: boolean }> {
  const k = `${mac.trim().toLowerCase()}|${chave.trim()}`;
  const guardada = tokensCliente.get(k);
  if (guardada && tokenIboValido(guardada.token)) return { s: guardada, logou: false };
  try {
    const s = await entrarAparelhoIbo(mac, chave);
    tokensCliente.set(k, s);
    return { s, logou: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.replace(/^IBO Pro [^:]+: /, "") : "erro";
    if (/too many/i.test(msg)) throw new LimiteLoginIbo("O site do cliente do IBO Pro bloqueou os logins por excesso (limite diário por IP). Tente de novo amanhã.");
    throw new Error(`O site do IBO Pro não aceitou o MAC + chave (${msg}). Confira a chave que aparece na TV.`);
  }
}

async function entrarComoCliente(app: AppIbo): Promise<SessaoAparelhoIbo> {
  if (!app.chave) throw new Error("Falta a chave (Device Key) do aparelho no cadastro — é a senha do site do cliente do IBO Pro.");
  return (await sessaoCliente(app.mac, app.chave)).s;
}

/** Aparelho na revenda (ou, se ainda não for da revenda, pelo info do MAC). */
async function aparelhoNoPainel(token: string, mac: string): Promise<{ dev: IboDevice | null; daRevenda: boolean }> {
  const dev = await buscarAparelhoIbo(token, mac);
  if (dev) return { dev, daRevenda: true };
  return { dev: await infoAparelhoIbo(token, mac), daRevenda: false };
}

async function gravarValidade(app: AppIbo, validade: string | null, idPainel: number, descricao: string, status?: "ativa") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.aplicativos
       SET validade = $1::date, id_painel_servidor = $2, id_dispositivo_painel = NULL,
           status = COALESCE($4, status), removido_em = NULL, atualizado_em = NOW()
       WHERE id_app_registro = $3`,
      [validade, idPainel, app.id_app_registro, status ?? null]
    );
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: app.id_cliente,
      id_app_registro: app.id_app_registro,
      descricao,
      dados_antes: { validade: app.validade, id_painel_servidor: app.id_painel_servidor },
      dados_depois: { validade, id_painel_servidor: idPainel },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Botão "Atualizar": validade pelo painel de revenda + listas pelo site do cliente (se tiver chave). */
export async function atualizarAppIbo(idAppRegistro: number): Promise<{ validade: string | null; mudou: boolean; aviso?: string }> {
  const app = await carregar(idAppRegistro);
  const painel = await painelIboAtivo();
  if (!painel) throw new Error("Nenhum painel IBO Pro ativo cadastrado (Conexões).");

  // Validade: painel de revenda; se ele falhar (sem senha, fora do ar), o site do cliente também informa
  let validade: string | null;
  let origem = `painel ${painel.nome}`;
  let erroRevenda: unknown = null;
  try {
    const { dev } = await aparelhoNoPainel(await sessaoIbo(painel.id), app.mac);
    if (!dev) throw new Error("O IBO Pro não encontrou esse MAC. Confira se o aplicativo já foi aberto na TV.");
    validade = iboPago(dev) ? validadeIbo(dev.expire_date) : null;
  } catch (e: unknown) {
    if (!app.chave) throw e;
    erroRevenda = e;
    validade = null;
  }

  let aviso: string | undefined;
  if (app.chave) {
    try {
      const s = await entrarComoCliente(app);
      if (erroRevenda) {
        const sit = await situacaoAparelhoIbo(s);
        validade = sit.ativo ? sit.validade : null;
        origem = "site do cliente IBO Pro";
      }
      await gravarListasIbo(idAppRegistro, await listasIbo(s));
    } catch (e: unknown) {
      if (erroRevenda) throw erroRevenda;
      aviso = `Listas não lidas: ${e instanceof Error ? e.message : "erro"}`;
    }
  } else {
    aviso = "Sem a chave do aparelho: as listas não foram lidas.";
  }

  const mudou = validade !== app.validade || app.id_painel_servidor !== painel.id;
  if (mudou) await gravarValidade(app, validade, painel.id, `Validade atualizada pelo ${origem} (só este aparelho)`);
  return { validade, mudou, aviso };
}

const DIAS_JA_ATIVADO = 40;

/**
 * Ativa/renova 1 ano no painel (1 CRÉDITO). Proteção contra gasto em dobro: validade a mais de 40 dias
 * no painel = já ativado, só copia. Manda o nome do cliente junto (a ativação apaga o nome se for vazio).
 */
export async function ativarAppIbo(idAppRegistro: number): Promise<{ validade: string | null; jaAtivado: boolean }> {
  const app = await carregar(idAppRegistro);
  const painel = await painelIboAtivo();
  if (!painel) throw new Error("Nenhum painel IBO Pro ativo cadastrado (Conexões).");
  const token = await sessaoIbo(painel.id);
  const { dev } = await aparelhoNoPainel(token, app.mac);
  if (!dev) throw new Error("O IBO Pro não encontrou esse MAC. Confira se o aplicativo já foi aberto na TV.");

  const pago = iboPago(dev);
  const expira = dev.expire_date ? Date.parse(dev.expire_date.replace(" ", "T") + "Z") : 0;
  const jaAtivado = pago && expira > Date.now() + DIAS_JA_ATIVADO * 86_400_000;
  let validade = pago ? validadeIbo(dev.expire_date) : null;
  if (!jaAtivado) {
    const nome = (dev.name?.trim() || app.nome_cliente?.trim() || "").slice(0, 100);
    try {
      validade = (await ativarAparelhoIbo(token, app.mac, { expireDate: dev.expire_date, isPaid: true, nome, nota: dev.note ?? "" })).validade;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.replace(/^IBO Pro [^:]+: /, "") : "";
      throw new Error(/credit/i.test(msg) ? "Sem crédito no IBO Pro. Compre mais no painel antes de renovar." : `O IBO Pro recusou a ativação${msg ? ` (${msg})` : ""}.`);
    }
    const depois = await buscarAparelhoIbo(token, app.mac).catch(() => null);
    if (depois?.expire_date) validade = validadeIbo(depois.expire_date);
    // Garantia: se o nome se perdeu mesmo assim, grava de novo
    if (depois && !depois.name?.trim() && nome) await renomearAparelhoIbo(token, depois, nome).catch(() => {});
  }
  await gravarValidade(app, validade, painel.id, jaAtivado
    ? `Ativação no painel ${painel.nome} não feita: já estava ativado; validade copiada do painel`
    : `Ativado no painel ${painel.nome} (1 crédito, 1 ano)`, "ativa");
  return { validade, jaAtivado };
}

// ---------- Listas (coluna Playlists de /clientes/[id]) ----------

/**
 * Logo depois de salvar, o GET /playlistw do IBO ainda pode devolver a versão antiga (edição do Elton Alf
 * em 13/10/2026 voltou com a URL antiga): vale a lista que o próprio POST devolveu.
 */
function mesclar(todas: IboPlaylist[], salva: IboPlaylist | null | undefined): IboPlaylist[] {
  if (!salva?.id) return todas;
  return todas.some((l) => l.id === salva.id) ? todas.map((l) => (l.id === salva.id ? salva : l)) : [...todas, salva];
}

async function idRealDaLista(s: SessaoAparelhoIbo, idExterno: number): Promise<{ lista: IboPlaylist; todas: IboPlaylist[] }> {
  const todas = await listasIbo(s);
  const lista = todas.find((l) => idNumericoLista(l.id) === Number(idExterno));
  if (!lista) throw new Error("Essa lista não existe mais no aparelho. Use Atualizar pra recarregar.");
  return { lista, todas };
}

async function auditarLista(app: AppIbo, descricao: string, antes: Record<string, unknown>, depois: Record<string, unknown>) {
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

export async function criarListaAppIbo(idAppRegistro: number, nome: string, url: string): Promise<void> {
  const app = await carregar(idAppRegistro);
  const s = await entrarComoCliente(app);
  const nova = await salvarListaIbo(s, { nome, url });
  await gravarListasIbo(idAppRegistro, mesclar(await listasIbo(s), nova));
  await auditarLista(app, `Lista "${nome}" criada no IBO Pro`, {}, { nome });
}

export async function editarListaAppIbo(idAppRegistro: number, idExterno: number, dados: { nome?: string; url?: string }): Promise<void> {
  const app = await carregar(idAppRegistro);
  const s = await entrarComoCliente(app);
  const { lista } = await idRealDaLista(s, idExterno);
  const salva = await salvarListaIbo(s, { id: lista.id, nome: dados.nome ?? lista.name, url: dados.url ?? lista.url });
  await gravarListasIbo(idAppRegistro, mesclar(await listasIbo(s), salva));
  await auditarLista(app, `Lista "${dados.nome ?? lista.name}" editada no IBO Pro`, { nome: lista.name }, { nome: dados.nome ?? lista.name, url_trocada: dados.url != null && dados.url !== lista.url });
}

export async function apagarListaAppIbo(idAppRegistro: number, idExterno: number): Promise<void> {
  const app = await carregar(idAppRegistro);
  const s = await entrarComoCliente(app);
  const { lista } = await idRealDaLista(s, idExterno);
  await apagarListaIbo(s, lista.id);
  await gravarListasIbo(idAppRegistro, (await listasIbo(s)).filter((l) => l.id !== lista.id));
  await auditarLista(app, `Lista "${lista.name}" apagada no IBO Pro`, { nome: lista.name }, {});
}

// ---------- Sync do painel (Conexões) ----------

export type StatsSyncIbo = {
  inseridos: number; atualizados: number; removidos: number; erros: number;
  sem_chave: number; nomes_preenchidos: number;
};

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) await fn(itens[i++]);
  }));
}

/**
 * Lê todos os aparelhos da revenda: grava validade/painel, cria os que faltam (sem cliente) e põe o nome do
 * cliente no aparelho sem nome. Aparelho que sumiu da revenda fica sem painel (não é apagado: a licença do
 * IBO é do aparelho, não da revenda).
 *
 * NÃO lê listas: o site do cliente bloqueia o IP por ~24 h depois de uns 10 logins (sync de 13/10/2026
 * bloqueou o IP de casa). Listas só sob demanda, por aparelho (Atualizar / editar), com token guardado.
 */
export async function sincronizarIbo(idPainel: number): Promise<{ total: number; stats: StatsSyncIbo }> {
  const token = await sessaoIbo(idPainel);
  const aparelhos = await listarAparelhosIbo(token);
  const stats: StatsSyncIbo = { inseridos: 0, atualizados: 0, removidos: 0, erros: 0, sem_chave: 0, nomes_preenchidos: 0 };

  await emParalelo(aparelhos, 4, async (dev) => {
    try {
      const validade = iboPago(dev) ? validadeIbo(dev.expire_date) : null;
      const { rows } = await pool.query<{ id_app_registro: number; chave: string | null; nome: string | null }>(
        `SELECT ap.id_app_registro::int, ap.chave, cl.nome
         FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
         WHERE lower(ap.mac) = lower($1) AND ap.id_app = $2
         ORDER BY (ap.removido_em IS NULL) DESC, ap.id_app_registro DESC LIMIT 1`,
        [dev.mac_address, ID_APP_IBOPRO]
      );
      let chave: string | null = null;
      if (rows[0]) {
        const id = rows[0].id_app_registro;
        chave = rows[0].chave;
        await pool.query(
          `UPDATE public.aplicativos SET validade = $1::date, id_painel_servidor = $2, id_dispositivo_painel = NULL,
                  modelo = COALESCE($3, modelo), removido_em = NULL, atualizado_em = NOW()
           WHERE id_app_registro = $4`,
          [validade, idPainel, dev.app_type ?? null, id]
        );
        stats.atualizados++;
        const nome = rows[0].nome?.trim();
        if (nome && !dev.name?.trim()) {
          await renomearAparelhoIbo(token, dev, nome.slice(0, 100)).then(() => stats.nomes_preenchidos++).catch(() => {});
        }
      } else {
        await pool.query(
          `INSERT INTO public.aplicativos (id_app, mac, validade, modelo, id_painel_servidor, status, data_cadastro, atualizado_em)
           VALUES ($1, $2, $3::date, $4, $5, 'ativa', NOW(), NOW())`,
          [ID_APP_IBOPRO, dev.mac_address, validade, dev.app_type ?? null, idPainel]
        );
        stats.inseridos++;
      }
      if (!chave) stats.sem_chave++;
    } catch (e: unknown) {
      stats.erros++;
      console.error(`[sync-ibopro] ${dev.mac_address}:`, e instanceof Error ? e.message : e);
    }
  });

  // Aparelho que era desta revenda e não está mais na lista: sai do painel (validade fica)
  if (aparelhos.length > 0) {
    const { rowCount } = await pool.query(
      `UPDATE public.aplicativos SET id_painel_servidor = NULL, atualizado_em = NOW()
       WHERE id_painel_servidor = $1 AND removido_em IS NULL AND lower(mac) != ALL($2::text[])
         AND atualizado_em < NOW() - INTERVAL '2 hours'`,
      [idPainel, aparelhos.map((d) => d.mac_address.toLowerCase())]
    );
    stats.removidos = rowCount ?? 0;
  }
  return { total: aparelhos.length, stats };
}
