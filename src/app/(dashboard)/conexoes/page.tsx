export const dynamic = "force-dynamic";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getPainelServidores, getPainelApps, getPainelAppSync, getServidoresParaVinculo } from "@/lib/paineis";
import ConexoesClient from "./ConexoesClient";

export default async function ConexoesPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || role !== "admin") {
    redirect("/dashboard");
  }

  const [servidores, apps, appSync, servidoresVinculo] = await Promise.all([
    getPainelServidores(),
    getPainelApps(),
    getPainelAppSync(),
    getServidoresParaVinculo(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Conexões</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Painéis IPTV externos — gerenciamento de contas e aplicativos
        </p>
      </div>
      <ConexoesClient servidores={servidores} apps={apps} appSync={appSync} servidoresVinculo={servidoresVinculo} />
    </div>
  );
}
