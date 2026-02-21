// src/app/(dashboard)/aplicativos/page.tsx
import { getApps } from "@/lib/aplicativos";
import BuscaMacClient from "@/components/aplicativos/BuscaMacClient";

export default async function AplicativosPage() {
  const apps = await getApps();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">Busca por MAC</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Localize aplicativos pelo endereço MAC do dispositivo
        </p>
      </div>

      <BuscaMacClient apps={apps} />
    </div>
  );
}