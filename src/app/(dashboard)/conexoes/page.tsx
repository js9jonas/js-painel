export const dynamic = "force-dynamic";
import { getPainelServidores, getPainelApps, getServidoresParaVinculo } from "@/lib/paineis";
import ConexoesClient from "./ConexoesClient";

export default async function ConexoesPage() {
  const [servidores, apps, servidoresVinculo] = await Promise.all([
    getPainelServidores(),
    getPainelApps(),
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
      <ConexoesClient servidores={servidores} apps={apps} servidoresVinculo={servidoresVinculo} />
    </div>
  );
}
