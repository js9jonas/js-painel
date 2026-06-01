"use client";
import { useState } from "react";

type Props = {
  painelNome: string;
  painelId: number;
  instrucao: string; // texto explicando onde copiar o token
  onClose: () => void;
  onSalvo: () => void;
};

export default function AtualizarTokenModal({ painelNome, painelId, instrucao, onClose, onSalvo }: Props) {
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) { setErro("Cole o token antes de salvar."); return; }
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/paineis/servidores/${painelId}/atualizar-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const json = await res.json();
      if (res.ok) { onSalvo(); }
      else { setErro(json.erro ?? "Erro ao salvar."); }
    } catch {
      setErro("Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Atualizar token — {painelNome}</h2>
            <p className="text-xs text-zinc-500 mt-1">{instrucao}</p>
          </div>

          <textarea
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={5}
            placeholder="Cole o token aqui…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
          />

          {erro && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{erro}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {salvando ? "Salvando…" : "Salvar token"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
