"use client";
import { useEffect, useMemo, useState } from "react";
import type { ServidorComHosts } from "@/lib/servidor-hosts";

// Migração em massa de endereço (IBO Pro e SmartOne, 13/10/2026): troca o endereço do servidor em TODAS as
// listas da revenda (Mass Change → Hostname do painel). Sugere os hosts cadastrados na aba Hosts: ao escolher o antigo,
// o novo vem preenchido com o principal do mesmo servidor. Confirmação em 2 cliques.

const semBarra = (h: string) => h.trim().replace(/\/+$/, "");
const HOST_RE = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/;

export default function MigrarHostModal({ idPainel, nomePainel, semPorta = false, onClose }: {
  idPainel: number; nomePainel: string; semPorta?: boolean; onClose: () => void;
}) {
  const [servidores, setServidores] = useState<ServidorComHosts[]>([]);
  const [antigo, setAntigo] = useState("");
  const [novo, setNovo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/servidor-hosts")
      .then((r) => (r.ok ? r.json() : { servidores: [] }))
      .then((j) => setServidores(Array.isArray(j.servidores) ? j.servidores : []))
      .catch(() => setServidores([]));
  }, []);

  // host → servidor dono (pra sugerir o principal do mesmo servidor)
  const donoDoHost = useMemo(() => {
    const m = new Map<string, ServidorComHosts>();
    for (const s of servidores) for (const h of s.hosts) m.set(semBarra(h.host).toLowerCase(), s);
    return m;
  }, [servidores]);

  function escolherAntigo(v: string) {
    setAntigo(v);
    setConfirmar(false);
    const dono = donoDoHost.get(semBarra(v).toLowerCase());
    const principal = dono?.hosts.find((h) => h.papel === "principal");
    const sugerido = principal ? semBarra(principal.host).replace(semPorta ? /:\d+$/ : /$^/, "") : "";
    if (sugerido && sugerido.toLowerCase() !== semBarra(v).toLowerCase()) setNovo(sugerido);
  }

  const temPorta = (h: string) => /:\d+$/.test(semBarra(h));
  const valido = HOST_RE.test(semBarra(antigo)) && HOST_RE.test(semBarra(novo)) && semBarra(antigo).toLowerCase() !== semBarra(novo).toLowerCase()
    && !(semPorta && (temPorta(antigo) || temPorta(novo)));

  async function migrar() {
    if (!confirmar) { setConfirmar(true); return; }
    setConfirmar(false);
    setRodando(true);
    setErro(null);
    setOk(null);
    try {
      const res = await fetch(`/api/paineis/servidores/${idPainel}/migrar-host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ antigo: semBarra(antigo), novo: semBarra(novo), confirmado: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.erro ?? "O painel recusou a migração.");
      setOk(`${j.noPainel} lista(s) migradas no painel${j.noBanco ? ` · ${j.noBanco} atualizada(s) aqui` : ""}.`);
      setAntigo("");
      setNovo("");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    } finally {
      setRodando(false);
    }
  }

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-zinc-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !rodando) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">Migrar endereço — {nomePainel}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Troca o endereço em todas as listas da revenda que usam o antigo. {semPorta ? "Sem a porta: no SmartOne ela é trocada à parte, no site." : "Inclua a porta, se tiver."}</p>
          </div>
          <button onClick={() => !rodando && onClose()} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
        </div>

        <datalist id="migrar-hosts">
          {servidores.flatMap((s) => s.hosts.map((h) => (
            <option key={`${s.id}-${h.id}`} value={semPorta ? semBarra(h.host).replace(/:\d+$/, "") : semBarra(h.host)}>{`${s.nome} · ${h.papel}`}</option>
          )))}
        </datalist>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">De (endereço antigo)</span>
          <input list="migrar-hosts" value={antigo} onChange={(e) => escolherAntigo(e.target.value)} placeholder="http://servidor-antigo.com" className={input} disabled={rodando} autoComplete="off" />
          {donoDoHost.get(semBarra(antigo).toLowerCase()) && (
            <span className="text-xs text-zinc-400">Servidor: {donoDoHost.get(semBarra(antigo).toLowerCase())!.nome}</span>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">Para (endereço novo)</span>
          <input list="migrar-hosts" value={novo} onChange={(e) => { setNovo(e.target.value); setConfirmar(false); }} placeholder={semPorta ? "http://servidor-novo.com" : "http://servidor-novo.com:8080"} className={input} disabled={rodando} autoComplete="off" />
        </label>

        {ok && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">✓ {ok}</p>}
        {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={() => !rodando && onClose()} disabled={rodando} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
            Fechar
          </button>
          <button
            onClick={() => void migrar()}
            disabled={!valido || rodando}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 ${confirmar ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"}`}
          >
            {rodando ? "Migrando…" : confirmar ? "Confirmar migração" : "Migrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
