"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Clouddy — "Editar" no balão da lista (13/10/2026). Mostra a lista atual (link m3u padrão), troca a
// lista em TV e VOD juntas (conta do cliente ou link m3u colado) e troca o PIN (padrão 0000). Sem nome
// de lista: no Clouddy não existe. A senha da conta é trocada em /aplicativos (ao passar a conta adiante).
// Cada ação entra na conta do cliente (captcha na 1ª vez) e pode levar até ~1,5 min.

type ContaOpcao = { id_conta: string; usuario: string; rotulo: string | null; nome_painel: string; status_conta: string; host_stream: string | null };

export default function ClouddyModal({ idAppRegistro, idCliente, email, urlAtual, onClose }: {
  idAppRegistro: number; idCliente: number; email: string; urlAtual: string | null; onClose: () => void;
}) {
  const router = useRouter();
  const [contas, setContas] = useState<ContaOpcao[] | null>(null);
  const [idConta, setIdConta] = useState("");
  const [linkM3u, setLinkM3u] = useState("");
  const [pin, setPin] = useState("");
  const [rodando, setRodando] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/clientes/${idCliente}/contas`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: ContaOpcao[]) => setContas(Array.isArray(lista) ? lista.filter((c) => !!c.host_stream) : []))
      .catch(() => setContas([]));
  }, [idCliente]);

  async function executar(corpo: Record<string, unknown>) {
    setErro(null);
    setOk(null);
    setRodando("Iniciando…");
    try {
      const res = await fetch(`/api/aplicativos/${idAppRegistro}/clouddy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.jobId) throw new Error(data.erro ?? "Não deu pra iniciar.");
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await fetch(`/api/aplicativos/${idAppRegistro}/clouddy?jobId=${encodeURIComponent(data.jobId)}`).then((r) => r.json()).catch(() => null);
        if (!job) continue;
        if (!job.done) { if (job.etapa) setRodando(job.etapa); continue; }
        if (!job.ok) throw new Error(job.erro ?? "Não deu pra concluir no Clouddy.");
        setOk(job.mensagem);
        setLinkM3u("");
        setIdConta("");
        setPin("");
        router.refresh();
        return;
      }
      throw new Error("O Clouddy demorou para responder. Confira no site antes de tentar de novo.");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    } finally {
      setRodando(null);
    }
  }

  const ocupado = rodando !== null;
  const linkValido = /^(https?|xc):\/\//i.test(linkM3u.trim());
  const inputClass = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:bg-zinc-50";
  const botao = "shrink-0 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">Editar lista Clouddy</p>
            <p className="text-xs text-zinc-500 mt-0.5">{email}</p>
          </div>
          <button onClick={() => !ocupado && onClose()} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
        </div>

        <section className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">Lista atual (TV e VOD)</p>
          <p className="rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700 break-all">
            {urlAtual ?? <span className="italic text-zinc-400">Sem lista cadastrada</span>}
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium text-zinc-800">Alterar a lista</p>
          <p className="text-xs text-zinc-500">Grava em TV e em VOD (as duas são necessárias pra todas as grades).</p>
          {contas === null ? (
            <p className="text-xs text-zinc-400">Carregando contas…</p>
          ) : contas.length > 0 && (
            <div className="flex gap-2">
              <select value={idConta} onChange={(e) => { setIdConta(e.target.value); setLinkM3u(""); }} className={inputClass} disabled={ocupado}>
                <option value="">Uma das contas do cliente…</option>
                {contas.map((c) => (
                  <option key={c.id_conta} value={c.id_conta}>
                    {c.usuario} · {c.rotulo || c.nome_painel}{c.status_conta ? ` (${c.status_conta})` : ""}
                  </option>
                ))}
              </select>
              <button onClick={() => void executar({ acao: "lista", id_conta: Number(idConta) })} disabled={!idConta || ocupado} className={botao}>
                Gravar
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={linkM3u}
              onChange={(e) => { setLinkM3u(e.target.value); setIdConta(""); }}
              placeholder={contas?.length ? "ou cole o link m3u (…/get.php?username=…&password=…)" : "Cole o link m3u (…/get.php?username=…&password=…)"}
              className={inputClass}
              disabled={ocupado}
              autoComplete="off"
            />
            <button onClick={() => void executar({ acao: "lista", url: linkM3u.trim() })} disabled={!linkValido || ocupado} className={botao}>
              Gravar
            </button>
          </div>
        </section>

        <section className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium text-zinc-800">PIN</p>
          <p className="text-xs text-zinc-500">O Clouddy vem com 0000. Defina outro com 4 números.</p>
          <div className="flex gap-2">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
              className={`${inputClass} max-w-32 font-mono tracking-widest`}
              disabled={ocupado}
              autoComplete="off"
            />
            <button onClick={() => void executar({ acao: "pin", pin })} disabled={!/^\d{4}$/.test(pin) || ocupado} className={botao}>
              Definir PIN
            </button>
          </div>
        </section>

        {rodando && <p className="text-xs text-violet-700">{rodando}</p>}
        {ok && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">✓ {ok}</p>}
        {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex justify-end">
          <button onClick={() => !ocupado && onClose()} disabled={ocupado} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
