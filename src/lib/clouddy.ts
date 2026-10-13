// Ações do Clouddy sobre um aplicativo do js-painel (conta do cliente: e-mail em aplicativos.mac, senha
// em aplicativos.chave). Cada login gasta 1 captcha, então a sessão de cada conta fica guardada em
// memória e é reaproveitada até expirar (some ao reiniciar o sistema — aí faz login de novo).
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { ID_APP_CLOUDDY } from "@/lib/apps-painel-ids";
import { montarLinkM3u } from "@/lib/dados-acesso-iptv-formato";
import {
  loginClouddy,
  lerResumo,
  lerUltimaAtividade,
  salvarLista,
  lerLista,
  linkM3uPadrao,
  credenciaisDaLista,
  trocarSenha,
  trocarPin,
  SessaoClouddyExpirada,
} from "@/lib/painel-adapters/clouddy";

/** Sessão guardada por no máximo 6 h (o site pode derrubar antes; aí refaz o login). */
const VALIDADE_SESSAO = 6 * 60 * 60 * 1000;
const sessoes = new Map<string, { cookie: string; em: number }>();

async function comSessao<T>(email: string, senha: string, fn: (cookie: string) => Promise<T>): Promise<T> {
  const chave = email.trim().toLowerCase();
  const guardada = sessoes.get(chave);
  if (guardada && Date.now() - guardada.em < VALIDADE_SESSAO) {
    try {
      return await fn(guardada.cookie);
    } catch (e) {
      if (!(e instanceof SessaoClouddyExpirada)) throw e;
      sessoes.delete(chave);
    }
  }
  const cookie = await loginClouddy(email.trim(), senha);
  sessoes.set(chave, { cookie, em: Date.now() });
  return fn(cookie);
}

type AppClouddy = { id_app_registro: number; id_cliente: number | null; email: string; senha: string; validade: string | null };

async function carregar(idAppRegistro: number): Promise<AppClouddy> {
  const { rows } = await pool.query<{ id_app_registro: number; id_app: number; id_cliente: number | null; mac: string | null; chave: string | null; validade: string | null }>(
    `SELECT id_app_registro, id_app::int, id_cliente::int, mac, chave, validade::text
     FROM public.aplicativos WHERE id_app_registro = $1 AND removido_em IS NULL`,
    [idAppRegistro]
  );
  const a = rows[0];
  if (!a) throw new Error("Aplicativo não encontrado.");
  if (a.id_app !== ID_APP_CLOUDDY) throw new Error("Esse aplicativo não é Clouddy.");
  if (!a.mac?.includes("@") || !a.chave) throw new Error("Falta o e-mail (campo MAC) ou a senha (campo chave) da conta Clouddy no aplicativo.");
  return { id_app_registro: a.id_app_registro, id_cliente: a.id_cliente, email: a.mac, senha: a.chave, validade: a.validade };
}

// ---------- Listas no js-painel (coluna Playlists de /clientes/[id]) ----------
// O Clouddy tem DUAS listas (TV e VOD); viram 2 linhas em aplicativo_playlists com playlist_id_externo
// fixo (1 = TV, 2 = VOD), já no formato m3u padrão e ligadas à conta pelo usuário — igual ao sync dos painéis.

const ID_EXTERNO = { tv: 1, vod: 2 } as const;

async function gravarListasLocais(idAppRegistro: number, listas: { tv: string | null; vod: string | null }) {
  for (const tipo of ["tv", "vod"] as const) {
    const url = listas[tipo] ? linkM3uPadrao(listas[tipo]!) : null;
    if (!url) {
      await pool.query(`DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo = $2`, [idAppRegistro, ID_EXTERNO[tipo]]);
      continue;
    }
    const usuario = credenciaisDaLista(url)?.usuario ?? null;
    const { rows } = usuario
      ? await pool.query<{ id_conta: number }>(`SELECT id_conta FROM public.contas WHERE usuario = $1 AND removido_em IS NULL LIMIT 1`, [usuario])
      : { rows: [] as { id_conta: number }[] };
    await pool.query(
      `INSERT INTO public.aplicativo_playlists (id_app_registro, playlist_id_externo, nome, url, is_selected, id_conta, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id_app_registro, playlist_id_externo)
       DO UPDATE SET nome = EXCLUDED.nome, url = EXCLUDED.url, is_selected = EXCLUDED.is_selected, id_conta = EXCLUDED.id_conta, atualizado_em = NOW()`,
      [idAppRegistro, ID_EXTERNO[tipo], tipo.toUpperCase(), url, tipo === "tv", rows[0]?.id_conta ?? null]
    );
  }
  // Outras linhas (não deveriam existir num Clouddy) saem
  await pool.query(`DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo NOT IN (1, 2)`, [idAppRegistro]);
}

export type ResultadoAtualizacao = { validade: string | null; mudou: boolean; ultimaAtividade: string | null; estado: string | null };

/** Lê validade ("Data final do serviço") e última atividade; grava só o que mudou (validade vai pra auditoria). */
export async function atualizarAppClouddy(idAppRegistro: number): Promise<ResultadoAtualizacao> {
  const app = await carregar(idAppRegistro);
  const { resumo, ultimaAtividade, listas } = await comSessao(app.email, app.senha, async (cookie) => ({
    resumo: await lerResumo(cookie),
    ultimaAtividade: await lerUltimaAtividade(cookie).catch(() => null),
    // Acessório: falha ao ler as listas não derruba a atualização da validade (null = não mexe)
    listas: await Promise.all([lerLista(cookie, "tv"), lerLista(cookie, "vod")]).then(([tv, vod]) => ({ tv, vod })).catch(() => null),
  }));
  if (listas) await gravarListasLocais(idAppRegistro, listas);
  if (ultimaAtividade) {
    await pool.query(`UPDATE public.aplicativos SET lista_acessada_em = $1::date WHERE id_app_registro = $2`, [ultimaAtividade, idAppRegistro]);
  }
  const mudou = !!resumo.validade && resumo.validade !== app.validade;
  if (mudou) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE public.aplicativos SET validade = $1::date, atualizado_em = NOW() WHERE id_app_registro = $2`, [resumo.validade, idAppRegistro]);
      await registrarAudit(client, {
        tipo: "alteracao_app",
        id_cliente: app.id_cliente,
        id_app_registro: idAppRegistro,
        descricao: `Validade atualizada pela conta Clouddy (${resumo.tarifa ?? "tarifa ?"}, ${resumo.estado ?? "estado ?"})`,
        dados_antes: { validade: app.validade },
        dados_depois: { validade: resumo.validade },
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  return { validade: resumo.validade ?? app.validade, mudou, ultimaAtividade, estado: resumo.estado };
}

/**
 * Grava a lista em TV e VOD (o cliente precisa das duas pra ver todas as grades): da conta IPTV escolhida
 * ou de um link m3u colado (get.php ou xc://). Depois atualiza a coluna Playlists.
 */
export async function trocarListaClouddy(idAppRegistro: number, origem: { idConta: number } | { url: string }): Promise<{ usuario: string }> {
  const app = await carregar(idAppRegistro);
  if ("url" in origem) {
    const url = linkM3uPadrao(origem.url.trim());
    if (!url) throw new Error("Link de lista inválido. Use o link m3u (…/get.php?username=…&password=…) ou xc://usuario:senha@servidor/.");
    const usuario = credenciaisDaLista(url)!.usuario;
    await comSessao(app.email, app.senha, async (cookie) => {
      await salvarLista(cookie, "tv", url);
      await salvarLista(cookie, "vod", url);
    });
    await gravarListasLocais(idAppRegistro, { tv: url, vod: url });
    const { rows: c } = await pool.query<{ id_conta: number }>(`SELECT id_conta FROM public.contas WHERE usuario = $1 AND removido_em IS NULL LIMIT 1`, [usuario]);
    await registrarListaTrocada(app, idAppRegistro, c[0]?.id_conta ?? null, usuario, new URL(url).host);
    return { usuario };
  }
  const idConta = origem.idConta;
  const { rows } = await pool.query<{ usuario: string; senha: string | null; host_stream: string | null }>(
    `SELECT c.usuario, c.senha, ps.host_stream
     FROM public.contas c
     JOIN public.assinaturas a ON a.id_assinatura = c.id_assinatura
     LEFT JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
     WHERE c.id_conta = $1::bigint AND a.id_cliente = $2::bigint AND c.removido_em IS NULL`,
    [idConta, app.id_cliente]
  );
  const conta = rows[0];
  if (!conta) throw new Error("A conta escolhida não é deste cliente.");
  if (!conta.senha || !conta.host_stream) throw new Error("A conta escolhida está sem senha ou o servidor dela está sem endereço de lista.");
  const url = montarLinkM3u({ hostStream: conta.host_stream, usuario: conta.usuario, senha: conta.senha, rotulo: null, nomePainel: "" });

  await comSessao(app.email, app.senha, async (cookie) => {
    await salvarLista(cookie, "tv", url);
    await salvarLista(cookie, "vod", url);
  });
  await gravarListasLocais(idAppRegistro, { tv: url, vod: url });
  await registrarListaTrocada(app, idAppRegistro, idConta, conta.usuario, conta.host_stream);
  return { usuario: conta.usuario };
}

/** Vincula o app à conta da lista (quando reconhecida) + auditoria. */
async function registrarListaTrocada(app: AppClouddy, idAppRegistro: number, idConta: number | null, usuario: string, servidor: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE public.aplicativos SET id_conta = COALESCE($1, id_conta), atualizado_em = NOW() WHERE id_app_registro = $2`, [idConta, idAppRegistro]);
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: app.id_cliente,
      id_app_registro: idAppRegistro,
      descricao: `Lista do Clouddy (TV e VOD) trocada para o usuário ${usuario}`,
      dados_antes: {},
      dados_depois: { id_conta: idConta, usuario, servidor },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error(`A lista foi trocada no Clouddy, mas não ficou salva aqui (${e instanceof Error ? e.message : "erro"}).`);
  } finally {
    client.release();
  }
}

/**
 * Troca a senha da conta Clouddy e confirma entrando de novo com ela (1 captcha a mais) ANTES de gravar
 * no js-painel — se a troca não pegou, o cadastro continua com a senha que funciona.
 */
export async function trocarSenhaClouddy(idAppRegistro: number, novaSenha: string): Promise<void> {
  const app = await carregar(idAppRegistro);
  await comSessao(app.email, app.senha, (cookie) => trocarSenha(cookie, novaSenha));
  const chave = app.email.trim().toLowerCase();
  sessoes.delete(chave);
  let cookie: string;
  try {
    cookie = await loginClouddy(app.email.trim(), novaSenha);
  } catch {
    throw new Error("O Clouddy não confirmou a senha nova (o login com ela falhou). A senha antiga continua salva aqui; confira no site.");
  }
  sessoes.set(chave, { cookie, em: Date.now() });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE public.aplicativos SET chave = $1, atualizado_em = NOW() WHERE id_app_registro = $2`, [novaSenha, idAppRegistro]);
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: app.id_cliente,
      id_app_registro: idAppRegistro,
      descricao: "Senha da conta Clouddy trocada pelo js-painel",
      dados_antes: {},
      dados_depois: { senha_trocada: true },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error(`A senha foi trocada no Clouddy, mas não ficou salva aqui (${e instanceof Error ? e.message : "erro"}). Anote a senha nova no aplicativo do cliente.`);
  } finally {
    client.release();
  }
}

/** Troca o PIN da conta (4 números; o padrão do Clouddy é 0000) + auditoria. */
export async function trocarPinClouddy(idAppRegistro: number, pin: string): Promise<void> {
  const app = await carregar(idAppRegistro);
  await comSessao(app.email, app.senha, (cookie) => trocarPin(cookie, app.senha, pin));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: app.id_cliente,
      id_app_registro: idAppRegistro,
      descricao: "PIN da conta Clouddy trocado pelo js-painel",
      dados_antes: {},
      dados_depois: { pin_trocado: true },
    });
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

// ---------- /aplicativos: contas Clouddy (pra passar adiante) ----------

export type ContaClouddyRow = {
  id_app_registro: number;
  email: string;
  /** Senha atual da conta Clouddy (aplicativos.chave). */
  senha: string | null;
  validade: string | null;
  status: string | null;
  lista_acessada_em: string | null;
  /** Lista TV salva no js-painel (link m3u padrão; vem do "Atualizar"). Contém usuário/senha IPTV. */
  lista_url: string | null;
  id_cliente: number | null;
  nome_cliente: string | null;
  ultimo_venc_contrato: string | null;
  /** Cliente com assinatura cadastrada (qualquer status) mas nenhuma viva, ou app inativo: pode ir pra outro cliente. */
  sobrando: boolean;
};

/** Contas Clouddy com validade de hoje em diante (as vencidas não servem pra passar adiante). */
export async function getContasClouddy(): Promise<ContaClouddyRow[]> {
  const { rows } = await pool.query<ContaClouddyRow>(
    `SELECT ap.id_app_registro, ap.mac AS email, ap.chave AS senha, ap.validade::text, ap.status, ap.lista_acessada_em::text,
            ap.id_cliente::int, cl.nome AS nome_cliente, ass.ultimo_venc::text AS ultimo_venc_contrato,
            (SELECT pl.url FROM public.aplicativo_playlists pl
             WHERE pl.id_app_registro = ap.id_app_registro ORDER BY pl.playlist_id_externo LIMIT 1) AS lista_url,
            -- Sobrando: cliente que já teve assinatura (qualquer status) e não tem nenhuma viva, ou app inativo.
            -- Cliente sem NENHUMA assinatura é revendedor parceiro: a conta não é nossa (Jonas, 13/10/2026).
            (COALESCE(ass.total, 0) > 0 AND (COALESCE(ass.vivas, 0) = 0 OR lower(btrim(ap.status)) <> 'ativa')) AS sobrando
     FROM public.aplicativos ap
     LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE a.status NOT IN ('inativo', 'cancelado'))::int AS vivas, MAX(a.venc_contrato) AS ultimo_venc
       FROM public.assinaturas a WHERE a.id_cliente = ap.id_cliente
     ) ass ON true
     WHERE ap.id_app = $1 AND ap.removido_em IS NULL
       AND ap.validade >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY sobrando DESC, ap.validade DESC`,
    [ID_APP_CLOUDDY]
  );
  return rows;
}
