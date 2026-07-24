"use client";
import { useState, useEffect } from "react";
import type { PainelAppSyncRow } from "@/lib/paineis";
import { salvarPainelServidor } from "@/app/actions/paineis";

type Props = {
  painel: PainelAppSyncRow | null;
  onClose: () => void;
  onSalvo: () => void;
};

const VAZIO = {
  nome: "", url_painel: "", usuario: "", senha: "",
  master: "", contato_master: "", ativo: true,
};

export default function PainelAppSyncModal({ painel, onClose, onSalvo }: Props) {
  const [form, setForm] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (painel) {
      setForm({
        nome:           painel.nome,
        url_painel:     painel.url_painel ?? "",
        usuario:        painel.usuario ?? "",
        senha:          "",
        master:         painel.master ?? "",
        contato_master: painel.contato_master ?? "",
        ativo:          painel.ativo,
      });
    } else {
      setForm({ ...VAZIO });
    }
    setErro(null);
  }, [painel]);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro("Nome é obrigatório."); return; }
    setSalvando(true);
    setErro(null);
    const result = await salvarPainelServidor({
      ...form,
      id: painel?.id,
      tipo: painel?.tipo ?? "",
      host_stream: "",
      url_acesso_web: painel?.url_acesso_web ?? "",
      id_servidor: null,
    });
    setSalvando(false);
    if (result.ok) onSalvo();
    else setErro(result.erro ?? "Erro ao salvar.");
  }

  const TIPO_LABEL: Record<string, string> = {
    funplays:   "FunPlays",
    lazerplay:  "LazerPlay",
    coreplayer: "CorePlayer",
    smartone:   "SmartOne",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Editar painel de aplicativo</h2>
            {painel && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-zinc-100 text-zinc-500">
                {TIPO_LABEL[painel.tipo] ?? painel.tipo.toUpperCase()}
              </span>
            )}
          </div>

          <Field label="Nome *">
            <input className={input} value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
          </Field>

          <Field label="URL do painel">
            <input className={input} value={form.url_painel} onChange={(e) => set("url_painel", e.target.value)} placeholder="https://" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Usuário (e-mail)">
              <input className={input} value={form.usuario} onChange={(e) => set("usuario", e.target.value)} />
            </Field>
            <Field label={painel ? "Senha (vazio = manter)" : "Senha"}>
              <input className={input} type="password" value={form.senha} onChange={(e) => set("senha", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Master">
              <input className={input} value={form.master} onChange={(e) => set("master", e.target.value)} placeholder="Nome do contato" />
            </Field>
            <Field label="Contato do master">
              <input className={input} value={form.contato_master} onChange={(e) => set("contato_master", e.target.value)} placeholder="(51) 9..." />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} className="rounded" />
            Ativo
          </label>

          {erro && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-600">{label}</label>
      {children}
    </div>
  );
}

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
