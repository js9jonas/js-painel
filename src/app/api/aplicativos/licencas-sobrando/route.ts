export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { TIPO_POR_ID_APP, ID_APP_SMARTONE, APPS_COM_TRANSFERENCIA_PAINEL } from "@/lib/apps-painel-ids";
import { auth } from "@/auth";
import { conferirNoSite, estadoConferencias, getLicencasSobrando } from "@/lib/licencas-sobrando";

export const dynamic = "force-dynamic";

// GET ?app=<id_app> — licenças sobrando do app (banco). SmartOne (padrão) vem junto com o que já foi
// conferido no site; Fun Play não tem conferência prévia (é feita na hora de transferir).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const idApp = Number(new URL(req.url).searchParams.get("app") ?? ID_APP_SMARTONE);
  if (idApp === ID_APP_SMARTONE) {
    const licencas = await getLicencasSobrando("smartone");
    return NextResponse.json({ licencas, ...estadoConferencias() });
  }
  if (!APPS_COM_TRANSFERENCIA_PAINEL.includes(idApp)) {
    return NextResponse.json({ erro: "Esse aplicativo não tem transferência de licença." }, { status: 400 });
  }
  const licencas = await getLicencasSobrando(TIPO_POR_ID_APP[idApp]);
  return NextResponse.json({ licencas, resultados: {}, pendentes: [] });
}

// POST { macs } — confere no site, em segundo plano, se essas licenças ainda transferem (na ordem dada)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const macs = Array.isArray(corpo.macs) ? corpo.macs.filter((m: unknown): m is string => typeof m === "string").slice(0, 200) : [];
  conferirNoSite(macs);
  return NextResponse.json({ ok: true });
}
