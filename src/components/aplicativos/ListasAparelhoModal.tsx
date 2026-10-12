"use client";
import { useCallback, useEffect, useState } from "react";

// Listas que estão de fato no aparelho (Fun Play / Lazer Play / Core Player), lidas pelo site do cliente
// com MAC + chave — inclusive as OCULTAS, que o painel de revenda não mostra. Apagar pede 2º clique.

type ListaAparelho = {
  id: number;
  nome: string;
  host: string;
  usuario: string | null;
  ativa: boolean;
  /** null = não deu pra comparar com o painel de revenda */
  oculta: boolean | null;
  criada_em: string | null;
};

type Props = { idAppRegistro: number; mac: string | null; onClose: () => void; onAlterado: () => void };

export default function ListasAparelhoModal({ idAppRegistro, mac, onClose, onAlterado }: Props) {
  const [listas, setListas] = useState<ListaAparelho[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [alterou, setAlterou] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const res = await fetch(`/api/aplicativos/${idAppRegistro}/listas-aparelho`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Não deu pra ler as listas do aparelho.");
      setListas(json.listas);
    } catch (e: unknown) {
      setListas((l) => l ?? []);
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    }
  }, [idAppRegistro]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function apagar(l: ListaAparelho) {
    if (confirmar !== l.id) { setConfirmar(l.id); return; }
    setConfirmar(null);
    setApagando(l.id);
    setErro(null);
    try {
      const res = await fetch(`/api/aplicativos/${idAppRegistro}/listas-aparelho`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: l.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.erro ?? "Não deu pra apagar a lista.");
      setAlterou(true);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    } finally {
      setApagando(null);
    }
  }

  function fechar() {
    if (alterou) onAlterado();
    onClose();
  }

  const ocultas = listas?.filter((l) => l.oculta).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => apagando === null && fechar()} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">Listas no aparelho</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            <span className="font-mono">{mac}</span> · como o app vê, inclusive as listas que o painel de revenda esconde.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {listas === null ? (
            <p className="text-sm text-zinc-500">Entrando no aparelho…</p>
          ) : listas.length === 0 && !erro ? (
            <p className="text-sm text-zinc-500">Nenhuma lista no aparelho.</p>
          ) : (
            <>
              {ocultas > 0 && (
                <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                  {ocultas === 1 ? "1 lista oculta" : `${ocultas} listas ocultas`}: não aparecem no painel de revenda e
                  fazem o painel recusar uma lista igual como &quot;já existe&quot;.
                </p>
              )}
              <ul className="space-y-2">
                {listas.map((l) => (
                  <li key={l.id} className="rounded-lg border border-zinc-200 px-3 py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-900">{l.nome || "(sem nome)"}</span>
                        {l.ativa && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">ATIVA</span>}
                        {l.oculta && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">OCULTA</span>}
                      </div>
                      <p className="font-mono text-xs text-zinc-500 break-all">
                        {l.host}{l.usuario ? ` · ${l.usuario}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => apagar(l)}
                      disabled={apagando !== null}
                      className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        confirmar === l.id ? "bg-red-600 text-white hover:bg-red-700" : "border border-red-200 text-red-600 hover:bg-red-50"
                      }`}
                    >
                      {apagando === l.id ? "Apagando…" : confirmar === l.id ? (l.ativa ? "Confirmar (é a ativa)" : "Confirmar") : "Apagar"}
                    </button>
                  </li>
                ))}
              </ul>
              {listas.some((l) => l.oculta === null) && (
                <p className="text-xs text-zinc-400">Não deu pra comparar com o painel de revenda, então as ocultas não estão marcadas.</p>
              )}
            </>
          )}
        </div>

        {erro && <p className="mx-6 mb-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end">
          <button onClick={fechar} disabled={apagando !== null} className="h-9 rounded-lg border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
