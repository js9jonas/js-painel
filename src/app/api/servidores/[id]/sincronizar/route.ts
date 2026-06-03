export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAdapter } from "@/lib/painel-adapters";

// Sincroniza contas do painel externo → tabela contas do banco
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idServidor = Number(id);
    const adapter = await getAdapter(idServidor);
    const contas = await adapter.listarContas();

    // Guarda de segurança: se o retorno for vazio ou menor que 50% do que está ativo,
    // abortamos a etapa de remoção para não apagar dados por falha parcial da API.
    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM public.contas WHERE id_servidor = $1 AND removido_em IS NULL`,
      [idServidor]
    );
    const totalAtivos = Number(countRows[0]?.total ?? 0);
    const syncConfiavel = contas.length > 0 && (totalAtivos === 0 || contas.length >= totalAtivos * 0.5);

    let inseridos = 0;
    let atualizados = 0;

    for (const conta of contas) {
      const { rowCount } = await pool.query(
        `INSERT INTO public.contas (id_servidor, usuario, rotulo, vencimento_real_painel, status_conta, removido_em)
         VALUES ($1, $2, $3, $4, $5, NULL)
         ON CONFLICT (id_servidor, usuario) DO UPDATE SET
           rotulo = EXCLUDED.rotulo,
           vencimento_real_painel = EXCLUDED.vencimento_real_painel,
           status_conta = EXCLUDED.status_conta,
           removido_em = NULL
         RETURNING (xmax = 0) AS inserted`,
        [idServidor, conta.usuario, conta.rotulo, conta.vencimento, conta.status]
      );
      if (rowCount && rowCount > 0) atualizados++;
    }

    inseridos = contas.length;

    let removidos = 0;
    if (syncConfiavel) {
      const usuarios = contas.map(c => c.usuario);
      const { rowCount } = await pool.query(
        `UPDATE public.contas
         SET removido_em = NOW()
         WHERE id_servidor = $1
           AND usuario != ALL($2::text[])
           AND removido_em IS NULL`,
        [idServidor, usuarios]
      );
      removidos = rowCount ?? 0;
    }

    return NextResponse.json({
      ok: true,
      total: contas.length,
      sincronizados: inseridos,
      removidos,
      aviso: syncConfiavel ? null : "Sync com retorno insuficiente — remoções ignoradas por segurança.",
    });
  } catch (err: any) {
    console.error("Erro ao sincronizar contas:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}
