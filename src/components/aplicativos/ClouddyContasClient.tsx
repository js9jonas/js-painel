"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ContaClouddyRow } from "@/lib/clouddy";
import AtualizarPainelButton from "./AtualizarPainelButton";

// /aplicativos → Contas Clouddy (13/10/2026). O Jonas passa uma conta Clouddy que sobrou (cliente saiu)
// para outro cliente trocando a senha da conta. A troca é conferida entrando com a senha nova antes de
// salvar no aplicativo. Vincular a conta ao cliente novo continua sendo feito em "Busca por MAC" (pelo e-mail).

const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

export default function ClouddyContasClient() {
  const [contas, setContas] = useState<ContaClouddyRow[] | null>(null);
  const [erroLista, setErroLista] = useState(false);
  const [filtro, setFiltro] = useState<"sobrando" | "todas">("sobrando");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [rodando, setRodando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ id: number; ok: boolean; texto: string } | null>(null);

  function carregar() {
    fetch("/api/aplicativos/clouddy")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((l: ContaClouddyRow[]) => { setContas(l); setErroLista(false); })
      .catch(() => setErroLista(true));
  }
  useEffect(carregar, []);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (contas ?? []).filter((c) => (filtro === "todas" || c.sobrando) && (!q || c.email.toLowerCase().includes(q) || (c.nome_cliente ?? "").toLowerCase().includes(q)));
  }, [contas, filtro, busca]);

  const senhaValida = senha.length >= 6 && senha.length <= 64 && !/\s/.test(senha);

  function abrir(id: number) {
    setEditando(id);
    setSenha("");
    setConfirmar(false);
    setResultado(null);
  }

  async function trocar(c: ContaClouddyRow) {
    if (!confirmar) { setConfirmar(true); return; }
    setConfirmar(false);
    setRodando("Iniciando…");
    setResultado(null);
    try {
      const res = await fetch(`/api/aplicativos/${c.id_app_registro}/clouddy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "senha", nova_senha: senha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.jobId) throw new Error(data.erro ?? "Não deu pra iniciar.");
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await fetch(`/api/aplicativos/${c.id_app_registro}/clouddy?jobId=${encodeURIComponent(data.jobId)}`).then((r) => r.json()).catch(() => null);
        if (!job) continue;
        if (!job.done) { if (job.etapa) setRodando(job.etapa); continue; }
        if (!job.ok) throw new Error(job.erro ?? "Não deu pra trocar a senha.");
        setResultado({ id: c.id_app_registro, ok: true, texto: job.mensagem });
        setEditando(null);
        setSenha("");
        return;
      }
      throw new Error("O Clouddy demorou para responder. Confira no site antes de tentar de novo.");
    } catch (e: unknown) {
      setResultado({ id: c.id_app_registro, ok: false, texto: e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo." });
    } finally {
      setRodando(null);
    }
  }

  const btn = "h-7 px-3 rounded-lg text-xs font-medium transition-colors border";

  return (
    <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b bg-sky-50">
        <p className="text-sm font-semibold text-sky-900">☁ Contas Clouddy</p>
        <p className="text-xs text-sky-700 mt-0.5">
          Contas ainda válidas. Pra passar uma conta a outro cliente, troque a senha aqui e depois vincule ao cliente novo na busca acima (pelo e-mail).
        </p>
      </div>

      <div className="px-5 py-3 border-b bg-zinc-50 flex flex-wrap items-center gap-2">
        <button onClick={() => setFiltro("sobrando")} className={`${btn} ${filtro === "sobrando" ? "bg-sky-600 text-white border-sky-600" : "bg-white text-zinc-600 border-zinc-200"}`}>Sobrando</button>
        <button onClick={() => setFiltro("todas")} className={`${btn} ${filtro === "todas" ? "bg-sky-600 text-white border-sky-600" : "bg-white text-zinc-600 border-zinc-200"}`}>Todas</button>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar e-mail ou cliente" className="h-7 rounded-lg border border-zinc-200 px-3 text-xs ml-auto w-56" />
      </div>

      {erroLista ? (
        <p className="px-5 py-6 text-sm text-red-600">Sem internet ou o sistema está atualizando. Recarregue a página.</p>
      ) : contas === null ? (
        <p className="px-5 py-6 text-sm text-zinc-500">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-500">Nenhuma conta {filtro === "sobrando" ? "sobrando" : "encontrada"}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Conta (e-mail)</th>
                <th className="px-4 py-2 text-left font-medium">Cliente atual</th>
                <th className="px-4 py-2 text-left font-medium">Lista</th>
                <th className="px-4 py-2 text-left font-medium">Validade</th>
                <th className="px-4 py-2 text-left font-medium">Último acesso</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visiveis.map((c) => (
                <tr key={c.id_app_registro} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700">{c.email}</td>
                  <td className="px-4 py-3">
                    {c.id_cliente ? (
                      <Link href={`/clientes/${c.id_cliente}`} target="_blank" className="hover:underline text-zinc-800">{c.nome_cliente}</Link>
                    ) : <span className="italic text-zinc-400">Sem cliente</span>}
                    <div className="text-xs text-zinc-400">
                      {c.sobrando ? (c.ultimo_venc_contrato ? `assinatura até ${br(c.ultimo_venc_contrato)}` : "sem assinatura") : "em uso"}
                      {c.status && c.status.toLowerCase() !== "ativa" ? ` · app ${c.status}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-64">
                    {c.lista_url
                      ? <span className="block truncate font-mono text-xs text-zinc-600" title={c.lista_url}>{c.lista_url}</span>
                      : <span className="text-xs italic text-zinc-400">use Atualizar</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{br(c.validade)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{br(c.lista_acessada_em)}</td>
                  <td className="px-4 py-3 text-right">
                    {editando === c.id_app_registro ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex gap-2">
                          <input
                            value={senha}
                            onChange={(e) => { setSenha(e.target.value); setConfirmar(false); }}
                            placeholder="Senha nova (6 a 64, sem espaços)"
                            className="h-7 w-52 rounded-lg border border-zinc-200 px-2 text-xs"
                            disabled={rodando !== null}
                            autoComplete="off"
                          />
                          <button
                            onClick={() => void trocar(c)}
                            disabled={!senhaValida || rodando !== null}
                            className={`h-7 whitespace-nowrap rounded-lg px-3 text-xs font-medium text-white disabled:opacity-40 ${confirmar ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-700"}`}
                          >
                            {confirmar ? "Confirmar troca" : "Trocar"}
                          </button>
                          <button onClick={() => setEditando(null)} disabled={rodando !== null} className="text-xs text-zinc-400 hover:text-zinc-600">cancelar</button>
                        </div>
                        {rodando && <span className="text-xs text-violet-700">{rodando}</span>}
                      </div>
                    ) : (
                      <div className="flex items-start justify-end gap-2">
                        <AtualizarPainelButton idAppRegistro={String(c.id_app_registro)} onAtualizado={carregar} />
                        <span className="h-7 inline-flex items-center rounded-lg bg-zinc-50 px-2 font-mono text-xs text-zinc-700" title="Senha atual da conta">
                          {c.senha || <span className="italic text-zinc-400">sem senha</span>}
                        </span>
                        <button onClick={() => abrir(c.id_app_registro)} disabled={rodando !== null} className={`${btn} bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50`}>
                          Trocar senha
                        </button>
                      </div>
                    )}
                    {resultado?.id === c.id_app_registro && (
                      <div className={`text-xs mt-1 ${resultado.ok ? "text-emerald-700" : "text-red-600"}`}>{resultado.texto}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
