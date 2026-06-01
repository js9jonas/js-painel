"use client";
import { useState, useEffect } from "react";
import type { PainelAppRow } from "@/lib/paineis";
import { salvarPainelApp } from "@/app/actions/paineis";

const TIPOS_APP = ["funplays", "lazerplay", "smartone", "outro"];

type Props = {
  app: PainelAppRow | null; // null = novo
  onClose: () => void;
  onSalvo: () => void;
};

const VAZIO = {
  nome: "", tipo: "funplays", url_painel: "", url_api: "",
  api_token: "", api_secret: "", master: "", contato_master: "",
  modo_acesso: "coletivo" as "coletivo" | "individual", ativo: true,
};

export default function PainelAppModal({ app, onClose, onSalvo }: Props) {
  const [form, setForm] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (app) {
      setForm({
        nome:           app.nome,
        tipo:           app.tipo,
        url_painel:     app.url_painel ?? "",
        url_api:        "",
        api_token:      "",
        api_secret:     "",
        master:         app.master ?? "",
        contato_master: app.contato_master ?? "",
        modo_acesso:    app.modo_acesso,
        ativo:          app.ativo,
      });
    } else {
      setForm({ ...VAZIO });
    }
    setErro(null);
  }, [app]);

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
    const result = await salvarPainelApp({ ...form, id: app?.id });
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
          {app ? "Editar painel de aplicativo" : "Novo painel de aplicativo"}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome *">
            <input className={input} value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
          </Field>
          <Field label="Tipo *">
            <select className={input} value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
              {TIPOS_APP.map((t) => (
                <option key={t} value={t}>{t.toUpperCase()}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Modo de acesso *">
          <div className="flex gap-4">
            {(["coletivo", "individual"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="radio"
                  name="modo_acesso"
                  value={m}
                  checked={form.modo_acesso === m}
                  onChange={() => set("modo_acesso", m)}
                />
                <span>
                  <strong className="capitalize">{m}</strong>
                  <span className="text-zinc-400 ml-1 text-xs">
                    {m === "coletivo" ? "— todos os MACs numa página" : "— cada MAC acessado individualmente"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="URL do painel">
            <input className={input} value={form.url_painel} onChange={(e) => set("url_painel", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="URL da API">
            <input className={input} value={form.url_api} onChange={(e) => set("url_api", e.target.value)} placeholder="https://api..." />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={app ? "Token API (vazio = manter)" : "Token API"}>
            <input className={input} value={form.api_token} onChange={(e) => set("api_token", e.target.value)} />
          </Field>
          <Field label={app ? "Secret API (vazio = manter)" : "Secret API"}>
            <input className={input} value={form.api_secret} onChange={(e) => set("api_secret", e.target.value)} />
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
