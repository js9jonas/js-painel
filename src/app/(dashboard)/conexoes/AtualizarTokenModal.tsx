"use client";
import { useState } from "react";

type Props = {
  painelNome: string;
  painelId: number;
  painelTipo: string;
  instrucao: string;
  onClose: () => void;
  onSalvo: () => void;
};

const CAMPOS_DUPLOS: Record<string, { label1: string; placeholder1: string; label2: string; placeholder2: string }> = {
  uniplay: {
    label1:       "Token (Authorization)",
    placeholder1: "eyJ0eXAiOiJKV1Qi…",
    label2:       "CryptPass (reg_password)",
    placeholder2: "valor do parâmetro reg_password na URL",
  },
};

export default function AtualizarTokenModal({ painelNome, painelId, painelTipo, instrucao, onClose, onSalvo }: Props) {
  const [valor1, setValor1] = useState("");
  const [valor2, setValor2] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const duplo = CAMPOS_DUPLOS[painelTipo];

  function montarToken(): string {
    if (painelTipo === "uniplay") {
      return JSON.stringify({ token: valor1.trim(), cryptPass: valor2.trim() });
    }
    return valor1.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valor1.trim()) { setErro("Preencha o token antes de salvar."); return; }
    if (duplo && !valor2.trim()) { setErro(`Preencha o campo "${duplo.label2}".`); return; }

    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/paineis/servidores/${painelId}/atualizar-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: montarToken() }),
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

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">
              {duplo ? duplo.label1 : "Token"}
            </label>
            <textarea
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              placeholder={duplo ? duplo.placeholder1 : "Cole o token aqui…"}
              value={valor1}
              onChange={(e) => setValor1(e.target.value)}
              autoFocus
            />
          </div>

          {duplo && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">{duplo.label2}</label>
              <input
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={duplo.placeholder2}
                value={valor2}
                onChange={(e) => setValor2(e.target.value)}
              />
            </div>
          )}

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
