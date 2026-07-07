import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params;
    const idAssinatura = String(rawId).trim();

    const body = await req.json().catch(() => ({}));
    const dataManual = typeof body?.dataManual === "string" && body.dataManual.trim()
      ? body.dataManual.trim() : null;
    const idsIndicacoes: string[] = Array.isArray(body?.idsIndicacoes) ? body.idsIndicacoes : [];
    const enviarMensagem: boolean = body?.enviarMensagem !== false;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { rows: dadosAssinatura } = await client.query(
        `SELECT a.id_cliente, c.nome AS nome_cliente, pc.contrato AS pacote_nome
         FROM public.assinaturas a
         LEFT JOIN public.clientes c ON c.id_cliente = a.id_cliente
         LEFT JOIN public.pacote pc ON pc.id_pacote = a.id_pacote
         WHERE a.id_assinatura = $1::bigint`,
        [idAssinatura]
      );

      const sql = `
        UPDATE public.assinaturas
        SET
          venc_contrato =
            CASE
              WHEN $2::date IS NOT NULL THEN $2::date
              ELSE (COALESCE(venc_contrato::date, CURRENT_DATE) + make_interval(months => 1))::date
            END,
          atualizado_em = NOW()
        WHERE id_assinatura = $1::bigint
        RETURNING id_assinatura::text, venc_contrato::text, venc_contas::text, id_cliente::text;
      `;

      const result = await client.query(sql, [idAssinatura, dataManual]);

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "Assinatura não encontrada" }, { status: 404 });
      }

      const assinatura = result.rows[0];
      const idCliente = dadosAssinatura[0]?.id_cliente ?? assinatura.id_cliente;
      const nomeCliente = dadosAssinatura[0]?.nome_cliente ?? null;
      const pacoteNome = dadosAssinatura[0]?.pacote_nome ?? null;

      await client.query(
        `INSERT INTO public.pagamentos
         (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo, atualizado_em, id_assinatura)
         VALUES ($1::bigint, $2, $3, CURRENT_DATE, 'Cortesia', 0, 'Cortesia de indicação', 'Assinatura tv', NOW(), $4::bigint)`,
        [idCliente, nomeCliente, pacoteNome, idAssinatura]
      );

      await abaterCreditoRenovacaoCortesia(client, idAssinatura);

      await client.query("COMMIT");

      const notificacao = enviarMensagem
        ? await notificarCortesiaTelegram({
            idCliente, nomeCliente, vencContrato: assinatura.venc_contrato, idsIndicacoes,
          }).catch(() => ({ ok: false as const, reason: "erro_envio" }))
        : null;

      return NextResponse.json({ ok: true, assinatura, whatsapp: notificacao });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Erro ao conceder cortesia:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}

type WhatsappResult = { ok: true } | { ok: false; reason: string };

/**
 * Sem template Meta aprovado para esta mensagem, a notificação vai para o Telegram
 * de Jonas com um botão wa.me pré-preenchido — ele confere e envia manualmente pelo
 * próprio WhatsApp, o que não exige aprovação de template por ser envio manual.
 */
async function notificarCortesiaTelegram({
  idCliente,
  nomeCliente,
  vencContrato,
  idsIndicacoes,
}: {
  idCliente: string;
  nomeCliente: string | null;
  vencContrato: string | null;
  idsIndicacoes: string[];
}): Promise<WhatsappResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID_JONAS;
  if (!botToken || !chatId) return { ok: false, reason: "sem_config" };

  const { rows } = await pool.query(
    `SELECT ct.telefone::text AS telefone
     FROM public.contatos ct
     WHERE ct.id_cliente = $1::bigint
       AND ct.telefone IS NOT NULL
       AND btrim(ct.telefone) <> ''
     ORDER BY ct.atualizado_em DESC NULLS LAST, ct.criado_em DESC NULLS LAST
     LIMIT 1`,
    [idCliente]
  );
  const telefoneRaw: string | undefined = rows[0]?.telefone;
  if (!telefoneRaw) return { ok: false, reason: "sem_telefone" };

  const digits = telefoneRaw.replace(/\D/g, "");
  const numero = digits.startsWith("55") ? digits : `55${digits}`;

  const nome = nomeCliente ? nomeCliente.split(" ")[0] : "cliente";
  const vencFormatado = vencContrato
    ? new Date(vencContrato + "T00:00:00").toLocaleDateString("pt-BR")
    : null;

  let nomesIndicados: string[] = [];
  if (idsIndicacoes.length > 0) {
    const { rows: indicadosRows } = await pool.query(
      `SELECT c.nome
       FROM public.indicacoes i
       JOIN public.clientes c ON c.id_cliente = i.id_indicado
       WHERE i.id_indicacao = ANY($1::bigint[])
       ORDER BY c.nome ASC`,
      [idsIndicacoes]
    );
    nomesIndicados = indicadosRows.map((r: { nome: string }) => r.nome);
  }

  const blocoIndicados = nomesIndicados.length > 0
    ? `📋 *Indicações desta cortesia:*\n${nomesIndicados.map((n) => `• ${n}`).join("\n")}\n\n`
    : "";
  const linhaVenc = vencFormatado ? `📅 Novo vencimento do contrato: *${vencFormatado}*\n\n` : "";

  const mensagem =
    `*Parabéns, ${nome}!* 🎁\n\n` +
    `Você ganhou _1 mês de cortesia_ na sua assinatura *JS Sistemas* como agradecimento pelas suas indicações.\n\n` +
    `${blocoIndicados}${linhaVenc}` +
    `_Obrigado por confiar na JS Sistemas e por nos indicar!_ 🙏`;

  const linkWhatsapp = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem).replace(/!/g, "%21")}`;

  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🎁 *Cortesia concedida — ${nomeCliente ?? "cliente"}*\n\nClique no botão pra abrir o WhatsApp com a mensagem pronta e enviar.`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "📲 Abrir no WhatsApp", url: linkWhatsapp }]],
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error("[Cortesia] Timeout/erro de rede ao notificar Telegram:", err);
    return { ok: false, reason: "erro_envio" };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[Cortesia] Erro ao notificar Telegram:", err);
    return { ok: false, reason: "erro_envio" };
  }

  return { ok: true };
}

async function abaterCreditoRenovacaoCortesia(
  client: any,
  idAssinatura: string,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT id_servidor, COUNT(*)::int AS creditos_mensal
     FROM public.contas
     WHERE id_assinatura = $1::bigint AND removido_em IS NULL
     GROUP BY id_servidor`,
    [idAssinatura]
  );
  if (rows.length === 0) return;

  for (const { id_servidor, creditos_mensal } of rows) {
    await client.query(
      `INSERT INTO public.saldo_servidor (id_servidor, saldo_atual)
       VALUES ($1, 0) ON CONFLICT (id_servidor) DO NOTHING`,
      [id_servidor]
    );

    const { rows: saldoRows } = await client.query(
      `SELECT saldo_atual FROM public.saldo_servidor WHERE id_servidor = $1 FOR UPDATE`,
      [id_servidor]
    );

    const saldoAnterior = saldoRows[0]?.saldo_atual ?? 0;
    const saldoNovo = saldoAnterior - creditos_mensal;

    await client.query(
      `UPDATE public.saldo_servidor SET saldo_atual = $1, atualizado_em = NOW() WHERE id_servidor = $2`,
      [saldoNovo, id_servidor]
    );

    await client.query(
      `INSERT INTO public.saldo_servidor_historico
       (id_servidor, tipo, quantidade, saldo_anterior, saldo_novo, observacao, id_assinatura)
       VALUES ($1, 'abatimento', $2, $3, $4, 'Cortesia de indicacao', $5::bigint)`,
      [id_servidor, -creditos_mensal, saldoAnterior, saldoNovo, idAssinatura]
    );
  }
}