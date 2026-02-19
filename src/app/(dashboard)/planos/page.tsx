// src/app/(dashboard)/planos/page.tsx
export const dynamic = "force-dynamic";

import { getPlanos } from "@/lib/planos";
import PlanosClient from "@/components/planos/PlanosClient";

export default async function PlanosPage() {
  const planos = await getPlanos();
  return <PlanosClient planos={planos} />;
}
