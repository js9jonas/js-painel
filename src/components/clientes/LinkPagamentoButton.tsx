// src/components/clientes/LinkPagamentoButton.tsx — copia o link /pagar do cliente.
"use client";
import { useState } from "react";

export default function LinkPagamentoButton({ idCliente }: { idCliente: string }) {
  const [estado, setEstado] = useState<"idle" | "loading" | "copiado">("idle");
  const [link, setLink] = useState<string | null>(null);

  async function copiar() {
    if (estado === "loading") return;
    setEstado("loading");
    try {
      const res = await fetch(`/api/clientes/${idCliente}/link-pagamento`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.link) throw new Error(j?.erro ?? "Não foi possível gerar o link.");
      setLink(j.link);
      try {
        await navigator.clipboard.writeText(j.link);
        setEstado("copiado");
        setTimeout(() => setEstado("idle"), 2500);
      } catch {
        setEstado("idle"); // sem permissão de copiar: o link fica visível pra copiar à mão
      }
    } catch (e) {
      setEstado("idle");
      alert(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={copiar}
        disabled={estado === "loading"}
        title={link ?? "Copiar link de pagamento por Pix"}
        className="h-8 rounded-lg border border-teal-300 bg-teal-50 px-3 text-xs font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
      >
        {estado === "copiado" ? "Link copiado ✓" : estado === "loading" ? "..." : "💸 Link Pix"}
      </button>
      {link && estado === "idle" && (
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-8 w-56 rounded border px-2 text-xs" />
      )}
    </span>
  );
}
