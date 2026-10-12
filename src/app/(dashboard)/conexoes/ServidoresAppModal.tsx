"use client";
import { useCallback, useEffect, useState } from "react";

// Servidores de lista do painel de app (Fun Play / Lazer Play / Core Player): lista, cadastro e migração
// em massa (troca o host de todas as listas do servidor de uma vez). A migração passa por revisão antes.

type Servidor = { id: number; name: string; host: string; code: string | null; device_count: number | null };

type Props = { idPainel: number; nomePainel: string; onClose: () => void };

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";

export default function ServidoresAppModal({ idPainel, nomePainel, onClose }: Props) {
  const [servidores, setServidores] = useState<Servidor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [novoNome, setNovoNome] = useState("");
  const [novoHost, setNovoHost] = useState("");
  const [novoCodigo, setNovoCodigo] = useState("");
  const [mostrarNovo, setMostrarNovo] = useState(false);

  const [migrando, setMigrando] = useState<Servidor | null>(null);
  const [hostNovo, setHostNovo] = useState("");
  const [levarListas, setLevarListas] = useState(true);
  const [revisando, setRevisando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const res = await fetch(`/api/paineis/servidores/${idPainel}/servidores-app`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Não deu pra ler os servidores.");
      setServidores(json.servidores ?? []);
    } catch (e: unknown) {
      setServidores([]);
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    }
  }, [idPainel]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function enviar(corpo: Record<string, unknown>): Promise<{ ok: boolean; mensagem?: string | null }> {
    const res = await fetch(`/api/paineis/servidores/${idPainel}/servidores-app`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.erro ?? "O painel recusou a operação.");
    return json;
  }

  async function cadastrar() {
    setErro(null); setSucesso(null); setOcupado(true);
    try {
      const r = await enviar({ acao: "criar", name: novoNome, host: novoHost, code: novoCodigo });
      setSucesso(r.mensagem && r.mensagem !== "Success" ? `Servidor enviado. Resposta do painel: ${r.mensagem}` : "Servidor cadastrado.");
      setNovoNome(""); setNovoHost(""); setNovoCodigo(""); setMostrarNovo(false);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não deu pra cadastrar.");
    } finally {
      setOcupado(false);
    }
  }

  function abrirMigracao(s: Servidor) {
    setMigrando(s); setHostNovo(""); setLevarListas(true); setRevisando(false); setErro(null); setSucesso(null);
  }

  async function confirmarMigracao() {
    if (!migrando) return;
    setErro(null); setOcupado(true);
    try {
      const r = await enviar({ acao: "migrar", id: migrando.id, host: hostNovo, replace: levarListas, confirmado: true });
      setSucesso(
        `${migrando.name}: endereço trocado para ${hostNovo.trim()}${levarListas ? ", com as listas" : "; as listas continuam no endereço antigo"}.` +
          (r.mensagem && r.mensagem !== "Success" ? ` Resposta do painel: ${r.mensagem}` : "")
      );
      setMigrando(null);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não deu pra migrar.");
    } finally {
      setOcupado(false);
      setRevisando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !ocupado && onClose()} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">Servidores de lista — {nomePainel}</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Cada servidor guarda o endereço das listas. Migrar troca o endereço de todas as listas dele de uma vez.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {servidores === null ? (
            <p className="text-sm text-zinc-500">Lendo os servidores no painel… (pode levar até 1 minuto se precisar entrar de novo)</p>
          ) : servidores.length === 0 && !erro ? (
            <p className="text-sm text-zinc-500">Nenhum servidor cadastrado neste painel.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Servidor</th>
                    <th className="px-3 py-2 text-left">Endereço</th>
                    <th className="px-3 py-2 text-right">Aparelhos</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {servidores.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-zinc-900">{s.name}</span>
                        {s.code && <span className="block text-xs text-zinc-400">código {s.code}</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-600">{s.host}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.device_count ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => abrirMigracao(s)}
                          disabled={ocupado}
                          className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Migrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {migrando && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-900">
                Migrar {migrando.name} <span className="font-mono font-normal">({migrando.host})</span>
              </p>
              <div>
                <label htmlFor="srv-host-novo" className="block text-xs font-semibold text-zinc-700 mb-1">Novo endereço</label>
                <input
                  id="srv-host-novo"
                  value={hostNovo}
                  onChange={(e) => { setHostNovo(e.target.value); setRevisando(false); }}
                  placeholder="http://dominio.com"
                  className={inputClass}
                  disabled={ocupado}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={levarListas}
                  onChange={(e) => { setLevarListas(e.target.checked); setRevisando(false); }}
                  disabled={ocupado}
                  className="mt-0.5"
                />
                <span>
                  Levar as listas junto
                  <span className="block text-xs text-zinc-500">
                    Desmarcado, troca só o endereço cadastrado no servidor; as listas que já existem continuam no endereço antigo.
                  </span>
                </span>
              </label>
              {revisando && (
                <p className="text-sm text-amber-900 bg-white rounded-lg px-3 py-2 border border-amber-200">
                  {levarListas
                    ? `As listas de ${migrando.device_count ?? "todos os"} aparelhos vão passar de ${migrando.host} para ${hostNovo.trim()}, inclusive as que não aparecem no painel.`
                    : `Só o servidor passa a usar ${hostNovo.trim()}. As listas de ${migrando.device_count ?? "todos os"} aparelhos continuam em ${migrando.host}.`}{" "}
                  Confirma?
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setMigrando(null)}
                  disabled={ocupado}
                  className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm hover:bg-white disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => (revisando ? confirmarMigracao() : setRevisando(true))}
                  disabled={ocupado || !hostNovo.trim()}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${revisando ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800"}`}
                >
                  {ocupado ? "Migrando…" : revisando ? "Confirmar migração" : "Revisar"}
                </button>
              </div>
            </div>
          )}

          {mostrarNovo ? (
            <div className="rounded-xl border border-zinc-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-zinc-900">Novo servidor</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="srv-nome" className="block text-xs font-semibold text-zinc-700 mb-1">Nome</label>
                  <input id="srv-nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="FAST" className={inputClass} disabled={ocupado} />
                </div>
                <div>
                  <label htmlFor="srv-codigo" className="block text-xs font-semibold text-zinc-700 mb-1">Código (opcional)</label>
                  <input id="srv-codigo" value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value)} className={inputClass} disabled={ocupado} />
                </div>
              </div>
              <div>
                <label htmlFor="srv-host" className="block text-xs font-semibold text-zinc-700 mb-1">Endereço</label>
                <input id="srv-host" value={novoHost} onChange={(e) => setNovoHost(e.target.value)} placeholder="http://dominio.com" className={inputClass} disabled={ocupado} />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMostrarNovo(false)} disabled={ocupado} className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button
                  onClick={cadastrar}
                  disabled={ocupado || !novoNome.trim() || !novoHost.trim()}
                  className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {ocupado ? "Cadastrando…" : "Cadastrar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setMostrarNovo(true); setMigrando(null); setSucesso(null); }}
              disabled={ocupado || servidores === null}
              className="rounded-lg border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              + Novo servidor
            </button>
          )}
        </div>

        {erro && <p className="mx-6 mb-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
        {sucesso && <p className="mx-6 mb-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{sucesso}</p>}

        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end">
          <button onClick={onClose} disabled={ocupado} className="h-9 rounded-lg border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
