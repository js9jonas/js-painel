"use client";
import { useCallback, useEffect, useState } from "react";
import type { HostDesconhecido, PapelHost, ServidorComHosts } from "@/lib/servidor-hosts";

// Aba "Hosts" de /conexoes: endereços de lista de cada servidor. O principal é o usado para montar
// credenciais e listas novas (espelhado em host_stream). Embaixo, endereços achados nas playlists do
// banco que ainda não pertencem a nenhum servidor, para atribuir.

const PAPEL_ROTULO: Record<PapelHost, string> = { principal: "Principal", secundario: "Secundário", inativo: "Inativo" };
const PAPEL_COR: Record<PapelHost, string> = {
  principal: "bg-emerald-100 text-emerald-800",
  secundario: "bg-sky-100 text-sky-800",
  inativo: "bg-zinc-100 text-zinc-500",
};

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";

export default function HostsServidoresTab() {
  const [servidores, setServidores] = useState<ServidorComHosts[] | null>(null);
  const [desconhecidos, setDesconhecidos] = useState<HostDesconhecido[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // confirmação em 2 cliques para trocar o principal
  const [confirmarPrincipal, setConfirmarPrincipal] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/servidor-hosts");
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Não deu pra ler os hosts.");
      setServidores(json.servidores);
      setDesconhecidos(json.desconhecidos);
    } catch (e: unknown) {
      setServidores((s) => s ?? []);
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function enviar(corpo: Record<string, unknown>): Promise<boolean> {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/servidor-hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.erro ?? "Não deu pra salvar.");
      await carregar();
      return true;
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
      return false;
    } finally {
      setOcupado(false);
      setConfirmarPrincipal(null);
    }
  }

  if (servidores === null) return <p className="text-sm text-zinc-500">Carregando hosts…</p>;

  const ativos = servidores.filter((s) => s.ativo);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        O <strong>principal</strong> é o endereço usado ao preparar credenciais e listas novas. Secundário: ainda funciona
        (ex.: onde ficaram as listas ocultas). Inativo: não usamos mais, fica só para reconhecer listas antigas.
      </p>

      {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {desconhecidos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Endereços ainda não identificados ({desconhecidos.length})</p>
            <p className="text-xs text-amber-800">Achados em playlists do banco. Escolha a qual servidor cada um pertence.</p>
          </div>
          <div className="space-y-2">
            {desconhecidos.map((d) => (
              <LinhaDesconhecido key={d.host} d={d} servidores={servidores} ocupado={ocupado} onAtribuir={enviar} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {servidores.map((s) => (
          <div key={s.id} className={`rounded-xl border border-zinc-200 bg-white p-4 space-y-3 ${s.ativo ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-zinc-900">{s.nome}</p>
              {!s.ativo && <span className="text-xs text-zinc-400">desativado</span>}
            </div>
            {s.hosts.length === 0 ? (
              <p className="text-xs text-zinc-400">Nenhum endereço cadastrado.</p>
            ) : (
              <ul className="space-y-2">
                {s.hosts.map((h) => (
                  <li key={h.id} className="rounded-lg border border-zinc-100 px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-zinc-800 break-all">{h.host}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PAPEL_COR[h.papel]}`}>
                        {PAPEL_ROTULO[h.papel]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>{h.listas} {h.listas === 1 ? "lista" : "listas"} no banco</span>
                      {h.papel !== "principal" && (
                        <div className="flex items-center gap-1">
                          <button
                            disabled={ocupado}
                            onClick={() =>
                              confirmarPrincipal === h.id
                                ? enviar({ acao: "papel", id: h.id, papel: "principal" })
                                : setConfirmarPrincipal(h.id)
                            }
                            className={`rounded px-2 py-0.5 font-medium disabled:opacity-50 ${
                              confirmarPrincipal === h.id ? "bg-red-600 text-white hover:bg-red-700" : "text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {confirmarPrincipal === h.id ? "Confirmar principal" : "Tornar principal"}
                          </button>
                          <button
                            disabled={ocupado}
                            onClick={() => enviar({ acao: "papel", id: h.id, papel: h.papel === "inativo" ? "secundario" : "inativo" })}
                            className="rounded px-2 py-0.5 hover:bg-zinc-100 disabled:opacity-50"
                          >
                            {h.papel === "inativo" ? "Reativar" : "Inativar"}
                          </button>
                          {h.listas === 0 && (
                            <button
                              disabled={ocupado}
                              onClick={() => enviar({ acao: "remover", id: h.id })}
                              className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {h.observacao && <p className="text-xs text-zinc-400">{h.observacao}</p>}
                  </li>
                ))}
              </ul>
            )}
            <NovoHost idPainel={s.id} temPrincipal={s.hosts.some((h) => h.papel === "principal")} ocupado={ocupado} onAdicionar={enviar} />
          </div>
        ))}
      </div>
      {ativos.length === 0 && <p className="text-sm text-zinc-400">Nenhum servidor ativo.</p>}
    </div>
  );
}

function NovoHost({
  idPainel,
  temPrincipal,
  ocupado,
  onAdicionar,
}: {
  idPainel: number;
  temPrincipal: boolean;
  ocupado: boolean;
  onAdicionar: (c: Record<string, unknown>) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [host, setHost] = useState("");
  const [papel, setPapel] = useState<PapelHost>(temPrincipal ? "secundario" : "principal");

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="text-xs text-zinc-500 hover:text-zinc-800">
        + Adicionar endereço
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="http://dominio.com" className={inputClass} disabled={ocupado} />
      <div className="flex gap-2">
        <select value={papel} onChange={(e) => setPapel(e.target.value as PapelHost)} className={inputClass} disabled={ocupado}>
          <option value="secundario">Secundário</option>
          <option value="inativo">Inativo</option>
          <option value="principal">Principal</option>
        </select>
        <button onClick={() => setAberto(false)} disabled={ocupado} className="rounded-lg border border-zinc-300 px-3 text-sm hover:bg-zinc-50 disabled:opacity-50">
          Cancelar
        </button>
        <button
          disabled={ocupado || !host.trim()}
          onClick={async () => {
            if (await onAdicionar({ acao: "adicionar", id_painel_servidor: idPainel, host, papel })) {
              setHost("");
              setAberto(false);
            }
          }}
          className="rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

function LinhaDesconhecido({
  d,
  servidores,
  ocupado,
  onAtribuir,
}: {
  d: HostDesconhecido;
  servidores: ServidorComHosts[];
  ocupado: boolean;
  onAtribuir: (c: Record<string, unknown>) => Promise<boolean>;
}) {
  const [idPainel, setIdPainel] = useState<string>(d.sugestao_id ? String(d.sugestao_id) : "");
  const [papel, setPapel] = useState<PapelHost>("secundario");

  return (
    <div className="rounded-lg bg-white border border-amber-100 px-3 py-2 flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-zinc-800 break-all">{d.host}</p>
        <p className="text-xs text-zinc-500">
          {d.listas} {d.listas === 1 ? "lista" : "listas"} em {d.aparelhos} {d.aparelhos === 1 ? "aparelho" : "aparelhos"}
          {d.exemplos.length > 0 && ` · ${d.exemplos.join(", ")}`}
        </p>
      </div>
      <div className="flex gap-2 lg:w-[26rem]">
        <select value={idPainel} onChange={(e) => setIdPainel(e.target.value)} className={inputClass} disabled={ocupado}>
          <option value="">Servidor…</option>
          {servidores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}{d.sugestao_id === s.id ? " (sugerido)" : ""}
            </option>
          ))}
        </select>
        <select value={papel} onChange={(e) => setPapel(e.target.value as PapelHost)} className={`${inputClass} w-36`} disabled={ocupado}>
          <option value="secundario">Secundário</option>
          <option value="inativo">Inativo</option>
        </select>
        <button
          disabled={ocupado || !idPainel}
          onClick={() => onAtribuir({ acao: "adicionar", id_painel_servidor: Number(idPainel), host: d.host, papel })}
          className="rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Atribuir
        </button>
      </div>
    </div>
  );
}
