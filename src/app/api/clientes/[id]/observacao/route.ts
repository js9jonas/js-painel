import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * Next.js (App Router) - context.params pode vir como Promise em builds tipados.
 */
type Ctx = { params: Promise<{ id: string }> };

type PutBody = {
  observacao?: unknown;
};

function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { ok: false, error, ...(extra ?? {}) },
    { status }
  );
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length ? v : null;
}

function isIntLike(value: string): boolean {
  // bigint-like: só dígitos (sem sinais), evita "1 OR 1=1" etc.
  return /^[0-9]+$/.test(value);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const idCliente = String(id ?? "").trim();

    if (!idCliente) {
      return jsonError(400, "Parâmetro 'id' é obrigatório.");
    }
    if (!isIntLike(idCliente)) {
      return jsonError(400, "Parâmetro 'id' inválido. Use apenas números.");
    }

    let body: PutBody = {};
    try {
      body = (await req.json()) as PutBody;
    } catch {
      // se não vier JSON válido, trata como body vazio
      body = {};
    }

    const observacao = normalizeText(body.observacao);

    const result = await pool.query(
      `
      UPDATE public.clientes
      SET observacao = $2
      WHERE id_cliente = $1::bigint
      RETURNING id_cliente::text AS id_cliente, observacao;
      `,
      [idCliente, observacao]
    );

    if (result.rowCount === 0) {
      return jsonError(404, `Cliente ${idCliente} não encontrado`);
    }

    return NextResponse.json({ ok: true, cliente: result.rows[0] });
  } catch (err: unknown) {
    // Tratamento mínimo e seguro (sem “any”)
    const message =
      err instanceof Error ? err.message : "Erro interno";

    console.error("Erro ao salvar observação:", err);

    return jsonError(500, message);
  }
}
