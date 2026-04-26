export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

// Salva sessão do UNITV (token permanente + cf_clearance ~1 ano).
// Como extrair:
//   1. Abra https://panel-web.starhome.vip/ no Chrome logado
//   2. DevTools → Application → Cookies → cf_clearance (valor)
//   3. DevTools → Application → Local Storage → RESELLER_SYSTEM_ADMIN__PRODUCTION__1.0.2__DEVICE_CODE_KEY_
//      OU consulte a memória do projeto para o token permanente: f1089b6267eed53cf086e6fbca376a6e
// Então chame: POST /api/servidores/5/refresh-session { token, cfClearance }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { token, cfClearance } = await req.json();

    if (!token || !cfClearance) {
      return NextResponse.json({ error: "Campos obrigatórios: token, cfClearance" }, { status: 400 });
    }

    const session = JSON.stringify({ token, cfClearance });
    // cf_clearance expira em ~1 ano; guarda session_expiry como 360 dias
    const expiry = new Date(Date.now() + 360 * 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE public.servidores SET session_cookie = $1, session_expiry = $2 WHERE id_servidor = $3`,
      [session, expiry, Number(id)]
    );

    return NextResponse.json({ ok: true, expira: expiry.toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
