export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAdapter } from "@/lib/painel-adapters";

// Sincroniza contas do painel externo → tabela contas do banco
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idServidor = Number(params.id);
    const adapter = await getAdapter(idServidor);
    const contas = await adapter.listarContas();

    let inseridos = 0;
    let atualizados = 0;

    for (const conta of contas) {
      const { rowCount } = await pool.query(
        `INSERT INTO public.contas (id_servidor, usuario, rotulo, vencimento_real_painel, status_conta)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id_servidor, usuario) DO UPDATE SET
           rotulo = EXCLUDED.rotulo,
           vencimento_real_painel = EXCLUDED.vencimento_real_painel,
           status_conta = EXCLUDED.status_conta
         RETURNING (xmax = 0) AS inserted`,
        [idServidor, conta.usuario, conta.rotulo, conta.vencimento, conta.status]
      );
      // xmax=0 significa INSERT, caso contrário UPDATE
      if (rowCount && rowCount > 0) atualizados++;
    }

    inseridos = contas.length;

    return NextResponse.json({ ok: true, total: contas.length, sincronizados: inseridos });
  } catch (err: any) {
    console.error("Erro ao sincronizar contas:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}
