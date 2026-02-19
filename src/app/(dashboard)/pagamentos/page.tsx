// src/app/(dashboard)/pagamentos/page.tsx
export const dynamic = "force-dynamic";

import { getPagamentos, countPagamentos } from "@/lib/pagamentos";
import PagamentosClient from "@/components/pagamentos/PagamentosClient";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function toInt(v: unknown, fallback: number): number {
  const n = Number(typeof v === "string" ? v : "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export default async function PagamentosPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const q = toStr(sp.q);
  const page = toInt(sp.page, 1);
  const pageSize = toInt(sp.pageSize, 50);

  const [total, data] = await Promise.all([
    countPagamentos({ q }),
    getPagamentos({ q, page, pageSize }),
  ]);

  return (
    <PagamentosClient
      data={data}
      total={total}
      page={page}
      pageSize={pageSize}
      q={q}
    />
  );
}
