"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

type PainelResumo = { id: number; nome: string; tipo: string };
// Campos mínimos usados pelo modal — aceita tanto ContaPainelVinculada (clientes/[id])
// quanto AlertaSubConta (alertas), sem acoplar aos tipos completos de cada página.
type ContaMinima = { id_conta: string; usuario: string; nome_painel: string | null };

type Props = {
  conta: ContaMinima;
  opcoes: PainelResumo[];
  onClose: () => void;
  onMigrado: () => void;
};

export default function MigrarPainelModal({ conta, opcoes, onClose, onMigrado }: Props) {
  const router = useRouter();
  const [idDestino, setIdDestino] = useState<number>(opcoes[0]?.id ?? 0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/contas/${conta.id_conta}/migrar-painel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPainelDestino: idDestino }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro ?? "Erro ao migrar conta.");
        return;
      }
      router.refresh();
      onMigrado();
    } catch {
      setErro("Erro de rede ao migrar conta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <h2 className="font-semibold text-zinc-900 text-sm">Migrar conta pra outro painel</h2>
        <p className="text-xs text-zinc-500">
          Exclui <span className="font-medium text-zinc-700">{conta.usuario}</span> do painel atual
          ({conta.nome_painel}) e recria com o mesmo usuário/senha no painel escolhido, mantendo
          telas e conteúdo adulto.
        </p>

        <div>
          <label className="text-xs text-zinc-500">Painel de destino</label>
          <Select
            className="w-full mt-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            value={String(idDestino)}
            onChange={(v) => setIdDestino(Number(v))}
            disabled={enviando}
            options={opcoes.map((p) => ({ value: String(p.id), label: p.nome }))}
          />
        </div>

        {erro && (
          <p className="text-xs text-red-700 bg-red-50 rounded px-3 py-2 whitespace-pre-wrap">{erro}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            type="button"
            disabled={enviando}
            className="px-4 py-1.5 rounded-lg text-sm border border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            type="button"
            disabled={enviando || !idDestino}
            className="px-4 py-1.5 rounded-lg text-sm bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {enviando ? "Migrando…" : "Migrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
