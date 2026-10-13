export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getContasClouddy } from "@/lib/clouddy";

export const dynamic = "force-dynamic";

// GET — contas Clouddy válidas (seção "Contas Clouddy" de /aplicativos). Só banco, não entra no Clouddy.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await getContasClouddy());
}
