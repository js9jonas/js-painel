// src/components/clientes/EditClienteModal.tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { updateCliente, getContatosCliente, salvarContatoV2, deletarContato, type ContatoRow } from "@/app/actions/clientes";

type Props = {
  idCliente: string;
  nomeAtual: string;
  observacaoAtual: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditClienteModal({
  idCliente, nomeAtual, observacaoAtual, onClose, onSaved,
}: Props) {
  const [nome, setNome] = useState(nomeAtual);
  const [observacao, setObservacao] = useState(observacaoAtual ?? "");
  const [contatos, setContatos] = useState<ContatoRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editReferencia, setEditReferencia] = useState("");
  const [novaReferencia, setNovaReferencia] = useState("");

  // Contato em edição inline
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTelefone, setEditTelefone] = useState("");
  const [editNome, setEditNome] = useState("");

  // Novo contato
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    getContatosCliente(idCliente).then(setContatos);
  }, [idCliente]);

  function handleSaveCliente() {
    if (!nome.trim()) { setError("Nome é obrigatório"); return; }
    setError(null);
    startTransition(async () => {
      try {
        await updateCliente(idCliente, { nome: nome.trim(), observacao: observacao.trim() || null });
        onSaved();
        onClose();
      } catch { setError("Erro ao salvar. Tente novamente."); }
    });
  }

  function iniciarEdicao(c: ContatoRow) {
    setEditandoId(c.id_contato);
    setEditTelefone(c.telefone);
    setEditNome(c.nome ?? "");
    setEditReferencia(c.referencia ?? "");
  }

  async function handleSalvarContato(idContato: string) {
    if (!editTelefone.trim()) return;
    await salvarContatoV2(idCliente, { idContato, telefone: editTelefone, nome: editNome || null, referencia: editReferencia || null });
    setContatos(await getContatosCliente(idCliente));
    setEditandoId(null);
  }

  async function handleDeletarContato(idContato: string) {
    if (!confirm("Remover este contato?")) return;
    await deletarContato(idContato, idCliente);
    setContatos(await getContatosCliente(idCliente));
  }

  async function handleAdicionarContato() {
    if (!novoTelefone.trim()) return;
    await salvarContatoV2(idCliente, { telefone: novoTelefone, nome: novoNome || null, referencia: novaReferencia || null });
    setContatos(await getContatosCliente(idCliente));
    setNovoTelefone(""); setNovoNome(""); setNovaReferencia(""); setAdicionando(false);
  }

  const inputClass = "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";
  const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-bold text-zinc-900">Editar Cliente</h2>
          <p className="text-sm text-zinc-500 mt-0.5">ID: {idCliente}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Dados principais */}
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nome *</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} placeholder="Nome do cliente" />
            </div>
            <div>
              <label className={labelClass}>Observação</label>
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3}
                className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all resize-none"
                placeholder="Observações sobre o cliente..." />
            </div>
          </div>

          {/* Contatos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">Contatos</label>
              {!adicionando && (
                <button onClick={() => setAdicionando(true)}
                  className="text-xs text-zinc-600 border border-zinc-300 rounded-lg px-3 py-1 hover:bg-zinc-50 transition-colors">
                  + Adicionar
                </button>
              )}
            </div>

            <div className="space-y-2">
              {contatos.map((c) => (
                <div key={c.id_contato} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  {editandoId === c.id_contato ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={editTelefone} onChange={(e) => setEditTelefone(e.target.value)}
                          className={inputClass} placeholder="Telefone" />
                        <input value={editNome} onChange={(e) => setEditNome(e.target.value)}
                          className={inputClass} placeholder="Nome (opcional)" />
                        <input value={editReferencia} onChange={(e) => setEditReferencia(e.target.value)}
                          className={inputClass} placeholder="Esposa, filho, etc." />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditandoId(null)}
                          className="text-xs border border-zinc-300 rounded-lg px-3 py-1 hover:bg-zinc-100">
                          Cancelar
                        </button>
                        <button onClick={() => handleSalvarContato(c.id_contato)}
                          className="text-xs bg-zinc-900 text-white rounded-lg px-3 py-1 hover:bg-zinc-800">
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{c.telefone}</div>
                        {c.nome && <div className="text-xs text-zinc-500">{c.nome}</div>}
                        {c.referencia && <div className="text-xs text-zinc-400">{c.referencia}</div>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => iniciarEdicao(c)}
                          className="text-xs border border-zinc-300 rounded-lg px-3 py-1 hover:bg-zinc-100">
                          ✏️
                        </button>
                        <button onClick={() => handleDeletarContato(c.id_contato)}
                          className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1 hover:bg-red-50">
                          🗑
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {contatos.length === 0 && !adicionando && (
                <p className="text-xs text-zinc-400 text-center py-3">Nenhum contato cadastrado</p>
              )}

              {adicionando && (
                <div className="rounded-xl border border-zinc-300 bg-white p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)}
                      className={inputClass} placeholder="Telefone *" />
                    <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                      className={inputClass} placeholder="Nome (opcional)" />
                    <input value={novaReferencia} onChange={(e) => setNovaReferencia(e.target.value)}
                      className={inputClass} placeholder="Esposa, filho, etc." />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setAdicionando(false); setNovoTelefone(""); setNovoNome(""); }}
                      className="text-xs border border-zinc-300 rounded-lg px-3 py-1 hover:bg-zinc-100">
                      Cancelar
                    </button>
                    <button onClick={handleAdicionarContato} disabled={!novoTelefone.trim()}
                      className="text-xs bg-zinc-900 text-white rounded-lg px-3 py-1 hover:bg-zinc-800 disabled:opacity-50">
                      Adicionar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p className="mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} disabled={isPending}
            className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSaveCliente} disabled={isPending || !nome.trim()}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {isPending ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}