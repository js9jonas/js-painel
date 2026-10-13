"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ContaClouddyRow } from "@/lib/clouddy";
import AtualizarPainelButton from "./AtualizarPainelButton";

// /aplicativos → Contas Clouddy (13/10/2026). O Jonas passa uma conta Clouddy que sobrou (cliente saiu)
// para outro cliente trocando a senha da conta. A troca é conferida entrando com a senha nova antes de
// salvar no aplicativo. No mesmo passo escolhe o cliente novo (opcional): o aplicativo passa pra ele.

const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

type ClienteBusca = { id_cliente: string; nome: string; telefone: string | null };

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
  const [buscaCliente, setBuscaCliente] = useState("");
  const [opcoesCliente, setOpcoesCliente] = useState<ClienteBusca[]>([]);
  const [clienteNovo, setClienteNovo] = useState<ClienteBusca | null>(null);
  const [destaque, setDestaque] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Senha em branco + cliente novo = só passa a conta, mantendo a senha
  const podeTrocar = senhaValida || (senha === "" && clienteNovo !== null);

  function abrir(id: number) {
    setEditando(id);
    setSenha("");
    setConfirmar(false);
    setResultado(null);
    setBuscaCliente("");
    setOpcoesCliente([]);
    setClienteNovo(null);
  }

  function escolherCliente(o: ClienteBusca) {
    setClienteNovo(o);
    setBuscaCliente(o.nome);
    setOpcoesCliente([]);
    setConfirmar(false);
  }

  // ↑/↓ navegam pelas opções, Enter escolhe, Esc fecha
  function teclaCliente(e: React.KeyboardEvent<HTMLInputElement>) {
    if (clienteNovo || opcoesCliente.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setDestaque((i) => (i + 1) % opcoesCliente.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setDestaque((i) => (i - 1 + opcoesCliente.length) % opcoesCliente.length); }
    else if (e.key === "Enter") { e.preventDefault(); escolherCliente(opcoesCliente[destaque] ?? opcoesCliente[0]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpcoesCliente([]); }
  }

  function digitarCliente(v: string) {
    setBuscaCliente(v);
    setClienteNovo(null);
    setConfirmar(false);
    if (debounce.current) clearTimeout(debounce.current);
    if (v.trim().length < 2) { setOpcoesCliente([]); return; }
    debounce.current = setTimeout(() => {
      fetch(`/api/clientes?q=${encodeURIComponent(v.trim())}&limit=8`)
        .then((r) => (r.ok ? r.json() : []))
        .then((l: ClienteBusca[]) => { setOpcoesCliente(Array.isArray(l) ? l : []); setDestaque(0); })
        .catch(() => setOpcoesCliente([]));
    }, 300);
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
        body: JSON.stringify({ acao: "senha", ...(senha ? { nova_senha: senha } : {}), ...(clienteNovo ? { id_cliente: Number(clienteNovo.id_cliente) } : {}) }),
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
        setClienteNovo(null);
        setBuscaCliente("");
        carregar();
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
          Contas ainda válidas. Pra passar uma conta a outro cliente, use “Trocar senha e cliente”: troca a senha e move o aplicativo pro cliente novo.
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
                        <input
                          value={senha}
                          onChange={(e) => { setSenha(e.target.value); setConfirmar(false); }}
                          placeholder="Senha nova (em branco = mantém a atual)"
                          className="h-7 w-64 rounded-lg border border-zinc-200 px-2 text-xs"
                          disabled={rodando !== null}
                          autoComplete="off"
                        />
                        <div className="relative w-64">
                          <input
                            value={buscaCliente}
                            onChange={(e) => digitarCliente(e.target.value)}
                            onKeyDown={teclaCliente}
                            placeholder="Cliente novo (nome ou telefone)"
                            className={`h-7 w-full rounded-lg border px-2 text-xs ${clienteNovo ? "border-emerald-300 bg-emerald-50" : "border-zinc-200"}`}
                            disabled={rodando !== null}
                            autoComplete="off"
                          />
                          {!clienteNovo && opcoesCliente.length > 0 && (
                            <ul className="absolute right-0 z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-white text-left shadow-lg">
                              {opcoesCliente.map((o, i) => (
                                <li key={o.id_cliente}>
                                  <button
                                    onClick={() => escolherCliente(o)}
                                    onMouseEnter={() => setDestaque(i)}
                                    ref={i === destaque ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                                    className={`w-full px-2 py-1.5 text-left text-xs ${i === destaque ? "bg-sky-100" : ""}`}
                                  >
                                    <span className="text-zinc-800">{o.nome}</span>
                                    <span className="ml-1 text-zinc-400">#{o.id_cliente}{o.telefone ? ` · ${o.telefone}` : ""}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400">{!clienteNovo ? "Sem cliente novo: só troca a senha." : senha === "" ? "Senha em branco: só passa a conta, mesma senha." : "Troca a senha e passa a conta."}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditando(null)} disabled={rodando !== null} className="text-xs text-zinc-400 hover:text-zinc-600">cancelar</button>
                          <button
                            onClick={() => void trocar(c)}
                            disabled={!podeTrocar || rodando !== null}
                            className={`h-7 whitespace-nowrap rounded-lg px-3 text-xs font-medium text-white disabled:opacity-40 ${confirmar ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-700"}`}
                          >
                            {confirmar ? (clienteNovo ? `Confirmar: passar pra ${clienteNovo.nome.split(" ")[0]}` : "Confirmar troca") : "Trocar"}
                          </button>
                        </div>
                        {rodando && <span className="text-xs text-violet-700">{rodando}</span>}
                      </div>
                    ) : (
                      <div className="flex items-start justify-end gap-2">
                        <AtualizarPainelButton idAppRegistro={String(c.id_app_registro)} onAtualizado={carregar} />
                        <span className="h-7 inline-flex items-center rounded-lg bg-zinc-50 px-2 font-mono text-xs text-zinc-700" title="Senha atual da conta">
                          {c.senha || <span className="italic text-zinc-400">sem senha</span>}
                        </span>
                        <button onClick={() => abrir(c.id_app_registro)} disabled={rodando !== null} className={`${btn} whitespace-nowrap bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50`}>
                          Trocar senha e cliente
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
