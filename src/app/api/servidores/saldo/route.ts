// src/app/api/servidores/saldo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id_servidor, quantidade, tipo, observacao } = body;

    if (!id_servidor || quantidade === undefined || !tipo) {
      return NextResponse.json(
        { ok: false, error: "Campos obrigatórios: id_servidor, quantidade, tipo" },
        { status: 400 }
      );
    }

    if (!["recarga", "ajuste"].includes(tipo)) {
      return NextResponse.json(
        { ok: false, error: "tipo deve ser 'recarga' ou 'ajuste'" },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO public.saldo_servidor (id_servidor, saldo_atual)
         VALUES ($1, 0)
         ON CONFLICT (id_servidor) DO NOTHING`,
        [id_servidor]
      );

      const { rows } = await client.query(
        `SELECT saldo_atual FROM public.saldo_servidor WHERE id_servidor = $1 FOR UPDATE`,
        [id_servidor]
      );

      const saldoAnterior: number = rows[0]?.saldo_atual ?? 0;
      const saldoNovo = saldoAnterior + Number(quantidade);

      await client.query(
        `UPDATE public.saldo_servidor
         SET saldo_atual = $1, atualizado_em = NOW()
         WHERE id_servidor = $2`,
        [saldoNovo, id_servidor]
      );

      await client.query(
        `INSERT INTO public.saldo_servidor_historico
         (id_servidor, tipo, quantidade, saldo_anterior, saldo_novo, observacao)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id_servidor, tipo, Number(quantidade), saldoAnterior, saldoNovo, observacao ?? null]
      );

      await client.query("COMMIT");
      return NextResponse.json({ ok: true, saldo_novo: saldoNovo });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Erro ao atualizar saldo:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erro interno" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id_servidor, exibir_saldo } = body;

    if (!id_servidor || typeof exibir_saldo !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "Campos obrigatórios: id_servidor, exibir_saldo (boolean)" },
        { status: 400 }
      );
    }

    // Garante que o registro existe antes de atualizar
    await pool.query(
      `INSERT INTO public.saldo_servidor (id_servidor, saldo_atual, exibir_saldo)
       VALUES ($1, 0, $2)
       ON CONFLICT (id_servidor) DO UPDATE SET exibir_saldo = $2`,
      [id_servidor, exibir_saldo]
    );

    return NextResponse.json({ ok: true, exibir_saldo });
  } catch (err: any) {
    console.error("Erro ao atualizar exibir_saldo:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erro interno" },
      { status: 500 }
    );
  }
}