export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getPlanos } from "@/lib/planos";
import { getPacotes } from "@/lib/pacotes";
import { getServidores } from "@/lib/servidores";
import { getAllConsumos } from "@/lib/consumo_servidor";
import PlanosClient from "@/components/planos/PlanosClient";

export default async function PlanosPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || role !== "admin") {
    redirect("/dashboard");
  }

  const [planos, pacotes, servidores, consumos] = await Promise.all([
    getPlanos(),
    getPacotes(),
    getServidores(),
    getAllConsumos(),
  ]);
  return <PlanosClient planos={planos} pacotes={pacotes} servidores={servidores} consumos={consumos} />;
}