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
    const totalIndicacoes = typeof body?.totalIndicacoes === "number" ? body.totalIndicacoes : null;

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
         (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo, atualizado_em)
         VALUES ($1::bigint, $2, $3, CURRENT_DATE, 'Cortesia', 0, 'Cortesia de indicação', 'Assinatura tv', NOW())`,
        [idCliente, nomeCliente, pacoteNome]
      );

      await abaterCreditoRenovacaoCortesia(client, idAssinatura);

      await client.query("COMMIT");

      const whatsapp = await enviarMensagensCortesia({
        idCliente, nomeCliente, vencContrato: assinatura.venc_contrato, totalIndicacoes,
      }).catch(() => ({ ok: false as const, reason: "erro_envio" }));

      return NextResponse.json({ ok: true, assinatura, whatsapp });
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

async function enviarMensagensCortesia({
  idCliente,
  nomeCliente,
  vencContrato,
  totalIndicacoes,
}: {
  idCliente: string;
  nomeCliente: string | null;
  vencContrato: string | null;
  totalIndicacoes: number | null;
}): Promise<WhatsappResult> {
  const evolutionUrl = process.env.EVOLUTION_API_URL ?? process.env.NEXT_PUBLIC_EVOLUTION_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY ?? process.env.NEXT_PUBLIC_EVOLUTION_KEY;
  if (!evolutionUrl || !evolutionKey) return { ok: false, reason: "sem_config" };

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

  const msg1 =
    `Olá! Sabia que você pode ganhar meses gratuitos na sua assinatura indicando amigos e familiares para a JS Sistemas? 🎉\n\n` +
    `Funciona assim: a cada 2 pessoas que você indicar e que ativarem a assinatura, você ganha *1 mês de cortesia* no seu plano — sem pagar nada!\n\n` +
    `Quanto mais indicações, mais meses você acumula. Não há limite! 😊\n\n` +
    `Continue indicando e aproveite esse benefício exclusivo para nossos clientes parceiros.`;

  const linhaIndicacoes = totalIndicacoes
    ? `• Indicações desta cortesia: *${totalIndicacoes} pessoa${totalIndicacoes !== 1 ? "s" : ""}*\n`
    : "";
  const linhaVenc = vencFormatado
    ? `• Novo vencimento do contrato: *${vencFormatado}*\n`
    : "";

  const msg2 =
    `*Parabéns, ${nome}!* 🎁\n\n` +
    `Você acaba de ganhar *1 mês de cortesia* na sua assinatura como agradecimento pelas suas indicações!\n\n` +
    `${linhaIndicacoes}${linhaVenc}\n` +
    `Muito obrigado por confiar na JS Sistemas e por nos indicar! Continue assim 🙏`;

  const headers = {
    "Content-Type": "application/json",
    apikey: evolutionKey,
  };
  const endpoint = `${evolutionUrl}/message/sendText/jsevolution`;

  const r1 = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ number: numero, text: msg1 }),
  });
  if (!r1.ok) return { ok: false, reason: "erro_envio" };

  await new Promise((r) => setTimeout(r, 1500));

  const r2 = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ number: numero, text: msg2 }),
  });
  if (!r2.ok) return { ok: false, reason: "erro_envio" };

  return { ok: true };
}

async function abaterCreditoRenovacaoCortesia(
  client: any,
  idAssinatura: string,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT cs.id_servidor, cs.creditos_mensal
     FROM public.assinaturas a
     JOIN public.consumo_servidor cs ON cs.id_pacote = a.id_pacote
     WHERE a.id_assinatura = $1::bigint`,
    [idAssinatura]
  );
  if (rows.length === 0) return;

  const { id_servidor, creditos_mensal } = rows[0];

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