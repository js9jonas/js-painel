// src/components/contatos/ContatosManager.tsx
"use client";

import { useState, useTransition } from "react";
import { addContato, updateContato, deleteContato } from "@/app/actions/contatos";
import type { ContatoRow } from "@/lib/contatos";

type Props = {
  idCliente: string;
  contatos: ContatoRow[];
  onSaved: () => void;
};

type EditState = { telefone: string; nome: string };

export default function ContatosManager({ idCliente, contatos, onSaved }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditState>({ telefone: "", nome: "" });
  const [newValues, setNewValues] = useState<EditState>({ telefone: "", nome: "" });
  const [addingNew, setAddingNew] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function startEdit(c: ContatoRow) {
    setEditingId(c.id_contato);
    setEditValues({ telefone: c.telefone ?? "", nome: c.nome ?? "" });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({ telefone: "", nome: "" });
    setError(null);
  }

  function handleUpdate(id_contato: string) {
    if (!editValues.telefone.trim()) { setError("Telefone não pode ser vazio"); return; }
    startTransition(async () => {
      try {
        await updateContato(id_contato, idCliente, editValues.telefone, editValues.nome);
        setEditingId(null);
        onSaved();
      } catch {
        setError("Erro ao salvar");
      }
    });
  }

  function handleDelete(id_contato: string) {
    if (!confirm("Remover este contato?")) return;
    startTransition(async () => {
      try {
        await deleteContato(id_contato, idCliente);
        onSaved();
      } catch {
        setError("Erro ao remover");
      }
    });
  }

  function handleAdd() {
    if (!newValues.telefone.trim()) { setError("Informe um telefone"); return; }
    startTransition(async () => {
      try {
        await addContato(idCliente, newValues.telefone, newValues.nome);
        setNewValues({ telefone: "", nome: "" });
        setAddingNew(false);
        onSaved();
      } catch {
        setError("Erro ao adicionar");
      }
    });
  }

  const inputClass =
    "rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all";

  return (
    <div className="space-y-3">
      {contatos.length === 0 && !addingNew && (
        <p className="text-sm text-zinc-400 italic">Nenhum contato cadastrado</p>
      )}

      {contatos.map((c) => (
        <div key={c.id_contato} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          {editingId === c.id_contato ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={editValues.telefone}
                  onChange={(e) => setEditValues((v) => ({ ...v, telefone: e.target.value }))}
                  className={`${inputClass} flex-1`}
                  placeholder="Telefone *"
                  autoFocus
                />
                <input
                  value={editValues.nome}
                  onChange={(e) => setEditValues((v) => ({ ...v, nome: e.target.value }))}
                  className={`${inputClass} flex-1`}
                  placeholder="Nome (opcional)"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdate(c.id_contato)}
                  disabled={isPending}
                  className="h-8 rounded-xl bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-all"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={isPending}
                  className="h-8 rounded-xl border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-50 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-900">
                  📱 {c.telefone ?? "—"}
                </div>
                {c.nome && (
                  <div className="text-xs text-zinc-500 mt-0.5">{c.nome}</div>
                )}
                {c.referencia && (
                  <div className="text-xs text-zinc-400 mt-0.5">Ref: {c.referencia}</div>
                )}
              </div>
              <a
                href={`https://wa.me/${(c.telefone ?? "").replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors inline-flex items-center shrink-0"
              >
                WA
              </a>
              <button
                type="button"
                onClick={() => startEdit(c)}
                className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors shrink-0"
              >
                ✏️ Editar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(c.id_contato)}
                disabled={isPending}
                className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors shrink-0"
              >
                🗑
              </button>
            </div>
          )}
        </div>
      ))}

      {addingNew && (
        <div className="rounded-xl border border-zinc-300 border-dashed bg-zinc-50 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={newValues.telefone}
              onChange={(e) => setNewValues((v) => ({ ...v, telefone: e.target.value }))}
              className={`${inputClass} flex-1`}
              placeholder="Telefone *"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              value={newValues.nome}
              onChange={(e) => setNewValues((v) => ({ ...v, nome: e.target.value }))}
              className={`${inputClass} flex-1`}
              placeholder="Nome (opcional)"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending}
              className="h-8 rounded-xl bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-all"
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => { setAddingNew(false); setNewValues({ telefone: "", nome: "" }); setError(null); }}
              className="h-8 rounded-xl border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-50 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">{error}</p>
      )}

      {!addingNew && (
        <button
          type="button"
          onClick={() => { setAddingNew(true); setError(null); }}
          className="h-8 rounded-xl border border-dashed border-zinc-300 px-4 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-400 transition-all"
        >
          + Adicionar contato
        </button>
      )}
    </div>
  );
}
