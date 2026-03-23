export const dynamic = "force-dynamic";

import { getPlanos } from "@/lib/planos";
import { getPacotes } from "@/lib/pacotes";
import { getServidores } from "@/lib/servidores";
import { getAllConsumos } from "@/lib/consumo_servidor";
import PlanosClient from "@/components/planos/PlanosClient";

export default async function PlanosPage() {
  const [planos, pacotes, servidores, consumos] = await Promise.all([
    getPlanos(),
    getPacotes(),
    getServidores(),
    getAllConsumos(),
  ]);
  return <PlanosClient planos={planos} pacotes={pacotes} servidores={servidores} consumos={consumos} />;
}