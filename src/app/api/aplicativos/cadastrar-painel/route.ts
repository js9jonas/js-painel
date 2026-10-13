export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { erroMacDuplicado } from "@/lib/aplicativos";
import { montarLinkM3u } from "@/lib/dados-acesso-iptv-formato";
import {
  adicionarExistente,
  buscarDispositivoPorMac,
  editarComentario,
  getPlaylistsDispositivo,
  validarMac,
} from "@/lib/painel-adapters/appacesso";
import {
  TIPO_POR_ID_APP,
  criarListaAtiva,
  nomeListaCliente,
  painelAtivoDoApp,
  painelSmartOneAtivo,
  sessaoPainelApp,
  sessaoSmartOne,
  validadeDoPainel,
} from "@/lib/app-painel";
import { ID_APP_SMARTONE } from "@/lib/apps-painel-ids";
import { criarPlaylist as criarSmartOne } from "@/lib/painel-adapters/smartone";
import { desmontarLinkM3uSmartOne, montarLinkM3uSmartOne } from "@/lib/smartone-m3u";

// Cadastro de aparelho novo (Fun Play / Lazer Play / Core Player) direto no painel do app, SEM gastar
// crédito (pedido do Jonas, 11/10/2026): "add existing device" (MAC + chave da TV) → nome do cliente
// no comentário → registro em public.aplicativos → lista da conta do cliente, marcada como ativa.
// Quase todo cadastro novo é teste: a ativação (1 crédito) fica pra quando o cliente assinar — o
// aparelho fica sem validade e aparece em /alertas como "precisa ativar".
//
// Roda em segundo plano (job) porque o login no painel pode precisar resolver captcha (~30 s).
//
// SmartOne (12/10/2026): outra plataforma, sem chave da TV e sem aparelho sem lista — o cadastro é a
// própria lista (add_playlist com MAC + Xtream, sem gastar giftcode). Nasce "Pending" e vira "Active"
// quando o cliente recarrega a lista no aparelho; a ativação (giftcode) continua sendo a renovação.

type Corpo = {
  id_cliente?: string | number;
  id_app?: string | number;
  mac?: string;
  chave?: string;
  id_conta?: string | number | null;
  observacao?: string | null;
};

type Resultado = { id_app_registro: number; validade: string | null; lista: string | null };
type JobState =
  | { done: false; etapa: string }
  | { done: true; ok: true; resultado: Resultado; aviso?: string }
  | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

async function executar(corpo: Required<Pick<Corpo, "mac" | "chave">> & { idCliente: number; idApp: number; idConta: number | null; observacao: string | null }, jobId: string) {
  const etapa = (texto: string) => jobs.set(jobId, { done: false, etapa: texto });
  const avisos: string[] = [];
  try {
    const { idCliente, idApp, idConta, observacao } = corpo;

    // 1) Checagens no banco antes de mexer no painel.
    const { rows: clienteRows } = await pool.query<{ nome: string }>(
      `SELECT nome FROM public.clientes WHERE id_cliente = $1::bigint`,
      [idCliente]
    );
    const nomeCliente = clienteRows[0]?.nome;
    if (!nomeCliente) throw new Error("Cliente não encontrado.");

    const { rows: existentes } = await pool.query<{
      id_app_registro: number; id_cliente: number | null; nome_cliente: string | null; removido_em: string | null;
    }>(
      `SELECT ap.id_app_registro, ap.id_cliente, cl.nome AS nome_cliente, ap.removido_em::text
       FROM public.aplicativos ap
       LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
       WHERE UPPER(ap.mac) = UPPER($1) AND ap.id_app = $2
       ORDER BY (ap.removido_em IS NULL) DESC, ap.id_app_registro DESC
       LIMIT 1`,
      [corpo.mac, idApp]
    );
    const existente = existentes[0] ?? null;
    if (existente && !existente.removido_em && existente.id_cliente != null) {
      if (Number(existente.id_cliente) === idCliente) {
        throw new Error("Esse aparelho já está cadastrado neste cliente. Use \"Adicionar lista\" no aplicativo dele.");
      }
      throw erroMacDuplicado(existente);
    }

    let conta: { usuario: string; senha: string; host_stream: string } | null = null;
    if (idConta) {
      const { rows } = await pool.query<{ usuario: string; senha: string | null; host_stream: string | null }>(
        `SELECT c.usuario, c.senha, ps.host_stream
         FROM public.contas c
         JOIN public.assinaturas a ON a.id_assinatura = c.id_assinatura
         LEFT JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
         WHERE c.id_conta = $1::bigint AND a.id_cliente = $2::bigint AND c.removido_em IS NULL`,
        [idConta, idCliente]
      );
      const r = rows[0];
      if (!r) throw new Error("A conta escolhida não é deste cliente.");
      if (!r.senha || !r.host_stream) throw new Error("A conta escolhida está sem senha ou o servidor dela está sem endereço de lista.");
      conta = { usuario: r.usuario, senha: r.senha, host_stream: r.host_stream };
    }

    if (idApp === ID_APP_SMARTONE) {
      if (!conta) throw new Error("No SmartOne o aparelho só entra com uma lista. Escolha a conta (ou crie um teste).");
      await executarSmartOne({ idCliente, idApp, mac: corpo.mac, chave: corpo.chave || null, idConta: idConta!, observacao, nomeCliente, conta, existente }, jobId, etapa, avisos);
      return;
    }

    const painel = await painelAtivoDoApp(idApp);
    if (!painel) throw new Error("Nenhum painel ativo cadastrado para esse aplicativo.");

    // 2) Painel: confere o MAC, traz o aparelho pro painel e grava o nome do cliente.
    etapa(`Entrando no painel ${painel.nome}…`);
    const token = await sessaoPainelApp(painel);

    etapa("Conferindo o MAC no painel…");
    let validacao;
    try {
      validacao = await validarMac(painel.cfg, token, corpo.mac);
    } catch {
      throw new Error("O painel não encontrou esse MAC. Confira se digitou certo e se o aplicativo já foi aberto na TV.");
    }
    const macPainel = validacao.mac || corpo.mac;

    let dev = await buscarDispositivoPorMac(painel.cfg, token, macPainel);
    if (!dev) {
      if (validacao.auth_type && validacao.auth_type !== "device_key") {
        throw new Error("Esse aparelho pede o código que aparece na TV, em vez da chave. Cadastre ele pelo site do painel.");
      }
      etapa("Adicionando o aparelho ao painel…");
      try {
        await adicionarExistente(painel.cfg, token, macPainel, corpo.chave);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message.replace(/^[^:]+ API: /, "") : "";
        throw new Error(`O painel recusou o aparelho${msg ? `: ${msg}` : ""}. Confira a chave (Device Key) que aparece na TV.`);
      }
      dev = await buscarDispositivoPorMac(painel.cfg, token, macPainel);
      if (!dev) throw new Error("O painel aceitou o aparelho, mas ele não apareceu na lista. Rode a sincronização do painel em Conexões.");
    } else {
      avisos.push("O aparelho já estava no seu painel; só foi vinculado a este cliente.");
    }

    try {
      await editarComentario(painel.cfg, token, dev.id, nomeCliente);
    } catch {
      avisos.push("Não deu pra gravar o nome do cliente no aparelho, no painel.");
    }

    // 3) Banco: reaproveita registro removido ou sem cliente (órfão do sync); senão cria.
    const validade = validadeDoPainel(dev.activation_expired);
    const chaveReal = dev.key != null && String(dev.key).trim() ? String(dev.key) : corpo.chave;
    const client = await pool.connect();
    let idAppRegistro: number;
    try {
      await client.query("BEGIN");
      if (existente) {
        await client.query(
          `UPDATE public.aplicativos
           SET id_cliente = $1, mac = $2, chave = $3, id_dispositivo_painel = $4, id_painel_servidor = $5,
               validade = $6::date, modelo = COALESCE($7, modelo), status = 'ativa',
               observacao = COALESCE($8, observacao), removido_em = NULL, atualizado_em = NOW()
           WHERE id_app_registro = $9`,
          [idCliente, dev.mac, chaveReal, dev.id, painel.id, validade, dev.model ?? null, observacao, existente.id_app_registro]
        );
        idAppRegistro = existente.id_app_registro;
      } else {
        const { rows } = await client.query<{ id_app_registro: number }>(
          `INSERT INTO public.aplicativos
             (id_cliente, id_app, mac, chave, id_dispositivo_painel, id_painel_servidor, validade, modelo,
              status, observacao, data_cadastro, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, 'ativa', $9, NOW(), NOW())
           RETURNING id_app_registro`,
          [idCliente, idApp, dev.mac, chaveReal, dev.id, painel.id, validade, dev.model ?? null, observacao]
        );
        idAppRegistro = rows[0].id_app_registro;
      }
      await registrarAudit(client, {
        tipo: "alteracao_app",
        id_cliente: idCliente,
        id_app_registro: idAppRegistro,
        descricao: `Aparelho cadastrado no painel ${painel.nome} (add existing, sem gastar crédito)`,
        dados_depois: { mac: dev.mac, id_painel_servidor: painel.id, validade, reaproveitado: existente?.id_app_registro ?? null },
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // 4) Lista da conta do cliente. Falha aqui não desfaz o cadastro: avisa e segue.
    let nomeLista: string | null = null;
    if (conta) {
      etapa("Criando a lista no aparelho…");
      try {
        const url = montarLinkM3u({ hostStream: conta.host_stream, usuario: conta.usuario, senha: conta.senha, rotulo: null, nomePainel: "" });
        const atuais = await getPlaylistsDispositivo(painel.cfg, token, dev.id);
        let lista = atuais.find((p) => p.url === url) ?? null;
        let ativa = !!lista?.is_selected;
        if (!lista) {
          const criada = await criarListaAtiva(painel.cfg, token, dev.id, nomeListaCliente(nomeCliente), url, { mac: dev.mac, chave: chaveReal });
          ({ lista, ativa } = criada);
          if (criada.ocultasApagadas) avisos.push(`Havia ${criada.ocultasApagadas === 1 ? "uma lista oculta igual" : `${criada.ocultasApagadas} listas ocultas iguais`} no aparelho; foi apagada para a nova entrar.`);
        }
        if (!lista) throw new Error("a lista não apareceu no aparelho depois de criada");
        await pool.query(
          `INSERT INTO public.aplicativo_playlists
             (id_app_registro, playlist_id_externo, nome, url, is_selected, expired_date, id_conta, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id_app_registro, playlist_id_externo) DO NOTHING`,
          [idAppRegistro, lista.id, lista.name ?? null, lista.url ?? null, !!lista.is_selected, lista.expired_date ?? null, idConta]
        );
        nomeLista = lista.name ?? null;
        if (!ativa) avisos.push("A lista foi criada, mas não ficou marcada como ativa. Use \"Marcar como ativa\" no menu da lista.");
      } catch (e: unknown) {
        avisos.push(`O aparelho foi cadastrado, mas a lista não foi criada (${e instanceof Error ? e.message : "erro no painel"}). Adicione pelo botão de lista do aplicativo.`);
      }
    }

    concluir(jobId, { id_app_registro: idAppRegistro, validade, lista: nomeLista }, avisos);
  } catch (e: unknown) {
    const erro = e instanceof Error ? e.message : "Erro ao cadastrar no painel.";
    jobs.set(jobId, { done: true, ok: false, erro });
  } finally {
    setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
  }
}

function concluir(jobId: string, resultado: Resultado, avisos: string[]) {
  jobs.set(jobId, { done: true, ok: true, resultado, ...(avisos.length ? { aviso: avisos.join(" ") } : {}) });
}

type Existente = { id_app_registro: number; id_cliente: number | null; nome_cliente: string | null; removido_em: string | null } | null;

async function executarSmartOne(
  d: {
    idCliente: number; idApp: number; mac: string; chave: string | null; idConta: number; observacao: string | null;
    nomeCliente: string; conta: { usuario: string; senha: string; host_stream: string }; existente: Existente;
  },
  jobId: string,
  etapa: (texto: string) => void,
  avisos: string[]
) {
  const painel = await painelSmartOneAtivo();
  if (!painel) throw new Error("Nenhum painel SmartOne ativo cadastrado.");

  etapa(`Entrando no painel ${painel.nome}…`);
  const cookie = await sessaoSmartOne(painel.id);

  // O SmartOne guarda host/porta/usuário/senha separados (porta sempre 80) — ver smartone-m3u.
  const link = montarLinkM3u({ hostStream: d.conta.host_stream, usuario: d.conta.usuario, senha: d.conta.senha, rotulo: null, nomePainel: "" });
  const partes = desmontarLinkM3uSmartOne(link);
  if (!partes.host) throw new Error("O servidor da conta escolhida está com o endereço de lista inválido.");
  const nomeLista = nomeListaCliente(d.nomeCliente);

  etapa("Mandando a lista para o aparelho…");
  let novo;
  try {
    novo = await criarSmartOne(cookie, { mac: d.mac, nome: nomeLista, ...partes, nota: d.nomeCliente });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.replace(/^SmartOne: /, "") : "";
    throw new Error(`O SmartOne recusou o cadastro${msg ? ` (${msg})` : ""}. Confira o MAC que aparece na TV.`);
  }
  if (!novo) throw new Error("O SmartOne aceitou, mas o aparelho não apareceu na lista do painel. Confira no site antes de tentar de novo.");

  const validade = validadeDoPainel(novo.activation_expired);
  const url = montarLinkM3uSmartOne(partes.host, partes.usuario, partes.senha);
  const client = await pool.connect();
  let idAppRegistro: number;
  try {
    await client.query("BEGIN");
    if (d.existente) {
      await client.query(
        `UPDATE public.aplicativos
         SET id_cliente = $1, mac = $2, chave = COALESCE($3, chave), id_dispositivo_painel = $4, id_painel_servidor = $5,
             validade = $6::date, modelo = COALESCE($7, modelo), status = 'ativa',
             observacao = COALESCE($8, observacao), removido_em = NULL, atualizado_em = NOW()
         WHERE id_app_registro = $9`,
        [d.idCliente, novo.mac, d.chave, novo.id, painel.id, validade, novo.model ?? null, d.observacao, d.existente.id_app_registro]
      );
      idAppRegistro = d.existente.id_app_registro;
      // Registro reaproveitado: listas antigas dele não valem mais
      await client.query(`DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1`, [idAppRegistro]);
    } else {
      const { rows } = await client.query<{ id_app_registro: number }>(
        `INSERT INTO public.aplicativos
           (id_cliente, id_app, mac, chave, id_dispositivo_painel, id_painel_servidor, validade, modelo,
            status, observacao, data_cadastro, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, 'ativa', $9, NOW(), NOW())
         RETURNING id_app_registro`,
        [d.idCliente, d.idApp, novo.mac, d.chave, novo.id, painel.id, validade, novo.model ?? null, d.observacao]
      );
      idAppRegistro = rows[0].id_app_registro;
    }
    await client.query(
      `INSERT INTO public.aplicativo_playlists
         (id_app_registro, playlist_id_externo, nome, url, is_selected, expired_date, id_conta, atualizado_em)
       VALUES ($1, $2, $3, $4, false, $5, $6, NOW())
       ON CONFLICT (id_app_registro, playlist_id_externo) DO NOTHING`,
      [idAppRegistro, novo.id, nomeLista, url, novo.activation_expired ?? null, d.idConta]
    );
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: d.idCliente,
      id_app_registro: idAppRegistro,
      descricao: `Aparelho cadastrado no painel ${painel.nome} com a lista ${nomeLista} (sem gastar giftcode)`,
      dados_depois: { mac: novo.mac, id_painel_servidor: painel.id, smartkey: novo.id, validade, reaproveitado: d.existente?.id_app_registro ?? null },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error(`O aparelho entrou no SmartOne, mas não ficou salvo aqui (${e instanceof Error ? e.message : "erro"}). Rode a sincronização em Conexões em vez de cadastrar de novo.`);
  } finally {
    client.release();
  }

  avisos.push("No SmartOne a lista fica \"Pending\" até o cliente recarregar a lista no aparelho.");
  concluir(jobId, { id_app_registro: idAppRegistro, validade, lista: nomeLista }, avisos);
}

// POST — valida e inicia o cadastro em segundo plano
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const corpo: Corpo = await req.json().catch(() => ({}));
  const idCliente = Number(corpo.id_cliente);
  const idApp = Number(corpo.id_app);
  const mac = (corpo.mac ?? "").trim();
  const chave = (corpo.chave ?? "").trim();
  const idConta = corpo.id_conta ? Number(corpo.id_conta) : null;

  if (!Number.isInteger(idCliente) || idCliente <= 0) return NextResponse.json({ erro: "Cliente inválido." }, { status: 400 });
  const smartOne = idApp === ID_APP_SMARTONE;
  if (!TIPO_POR_ID_APP[idApp] && !smartOne) return NextResponse.json({ erro: "Esse aplicativo não tem cadastro pelo painel." }, { status: 400 });
  if (!MAC_RE.test(mac)) return NextResponse.json({ erro: "MAC inválido. Use o formato 00:1A:2B:3C:4D:5E." }, { status: 400 });
  if (!chave && !smartOne) return NextResponse.json({ erro: "Informe a chave (Device Key) que aparece na TV." }, { status: 400 });
  if (smartOne && !idConta) return NextResponse.json({ erro: "No SmartOne o aparelho só entra com uma lista. Escolha a conta (ou crie um teste)." }, { status: 400 });
  if (idConta !== null && (!Number.isInteger(idConta) || idConta <= 0)) return NextResponse.json({ erro: "Conta inválida." }, { status: 400 });

  const jobId = `cadastro-painel-${idCliente}-${Date.now()}`;
  jobs.set(jobId, { done: false, etapa: "Iniciando…" });
  executar({ idCliente, idApp, mac, chave, idConta, observacao: corpo.observacao?.trim() || null }, jobId).catch(() => {});
  return NextResponse.json({ jobId });
}

// GET ?jobId= — andamento do cadastro
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
