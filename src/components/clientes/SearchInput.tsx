// src/components/clientes/SearchInput.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

export default function SearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (valor) params.set("q", valor);
      else params.delete("q");
      params.set("page", "1");
      router.push(`/clientes?${params.toString()}`);
    }, 400); // 400ms de delay após parar de digitar
  }

  return (
    <input
      name="q"
      defaultValue={defaultValue}
      onChange={handleChange}
      placeholder="🔍 Buscar por nome ou observação..."
      className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
    />
  );
}