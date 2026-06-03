"use client";
import { useState, useEffect } from "react";
import type { PainelServidorRow, ServidorVinculoRow } from "@/lib/paineis";
import { salvarPainelServidor } from "@/app/actions/paineis";

const TIPOS_SERVIDOR = [
  "club", "central", "uniplay", "now", "unitv", "liebe", "fast", "natv", "outro",
];

type Props = {
  painel: PainelServidorRow | null;
  servidores: ServidorVinculoRow[];
  onClose: () => void;
  onSalvo: () => void;
};

const VAZIO = {
  nome: "", tipo: "club", url_painel: "", url_api: "",
  usuario: "", senha: "", master: "", contato_master: "",
  padrao_usuario: "", padrao_senha: "", ativo: true, id_servidor: null as number | null,
};

export default function PainelServidorModal({ painel, servidores, onClose, onSalvo }: Props) {
  const [form, setForm] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (painel) {
      setForm({
        nome:           painel.nome,
        tipo:           painel.tipo,
        url_painel:     painel.url_painel ?? "",
        url_api:        painel.url_api ?? "",
        usuario:        painel.usuario ?? "",
        senha:          "",
        master:         painel.master ?? "",
        contato_master: painel.contato_master ?? "",
        padrao_usuario: painel.padrao_usuario ?? "",
        padrao_senha:   painel.padrao_senha ?? "",
        ativo:          painel.ativo,
        id_servidor:    painel.id_servidor ?? null,
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
    if (!form.nome.trim() || !form.tipo.trim()) {
      setErro("Nome e tipo são obrigatórios.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const result = await salvarPainelServidor({ ...form, id: painel?.id, id_servidor: form.id_servidor });
    setSalvando(false);
    if (result.ok) {
      onSalvo();
    } else {
      setErro(result.erro ?? "Erro ao salvar.");
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-900">
          {painel ? "Editar painel" : "Novo painel de contas"}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome *">
            <input className={input} value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
          </Field>
          <Field label="Tipo *">
            <select className={input} value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
              {TIPOS_SERVIDOR.map((t) => (
                <option key={t} value={t}>{t.toUpperCase()}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="URL do painel">
            <input className={input} value={form.url_painel} onChange={(e) => set("url_painel", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="URL da API">
            <input className={input} value={form.url_api} onChange={(e) => set("url_api", e.target.value)} placeholder="https://api..." />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Usuário">
            <input className={input} value={form.usuario} onChange={(e) => set("usuario", e.target.value)} />
          </Field>
          <Field label={painel ? "Senha (deixe vazio para manter)" : "Senha"}>
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Padrão de usuário">
            <input className={input} value={form.padrao_usuario} onChange={(e) => set("padrao_usuario", e.target.value)} placeholder="Ex: primeironome.sobrenome" />
          </Field>
          <Field label="Padrão de senha">
            <input className={input} value={form.padrao_senha} onChange={(e) => set("padrao_senha", e.target.value)} placeholder="Ex: Cel+3dígitos" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
          <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} className="rounded" />
          Ativo
        </label>

        <Field label="Servidor vinculado (saldo automático)">
          <select
            className={input}
            value={form.id_servidor ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, id_servidor: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">— Nenhum —</option>
            {servidores.map((s) => (
              <option key={s.id_servidor} value={s.id_servidor}>
                {s.codigo_publico} — {s.nome_interno}
              </option>
            ))}
          </select>
        </Field>

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
    </Overlay>
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

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
