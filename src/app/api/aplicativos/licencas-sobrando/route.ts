export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { conferirNoSite, estadoConferencias, getLicencasSobrando } from "@/lib/licencas-sobrando";

export const dynamic = "force-dynamic";

// GET — licenças SmartOne sobrando (banco) + o que já foi conferido no site (transfere ou não)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const licencas = await getLicencasSobrando();
  return NextResponse.json({ licencas, ...estadoConferencias() });
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
