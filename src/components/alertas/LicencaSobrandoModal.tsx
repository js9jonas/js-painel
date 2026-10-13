"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Conferencia, LicencaSobrando, MotivoSobra } from "@/lib/licencas-sobrando";
import { ID_APP_SMARTONE } from "@/lib/apps-painel-ids";

// /alertas → SmartOne vencendo → "Licença sobrando": em vez de gastar giftcode, transfere pra este
// aparelho a licença de um aparelho sem uso (cliente que saiu ou app marcado inativo). O site só deixa
// transferir cada licença uma vez — a coluna "Transfere?" é conferida no site (~7 s por aparelho,
// 3 por vez, guardado por 6 h). Os dias que o aparelho de destino ainda tem NÃO somam.
// Fun Play (13/10/2026): mesmo modal para aparelho novo (sem licença paga); sem conferência prévia —
// a regra visível é a dos 30 dias; o resto (destino ainda não pago, origem no painel) o servidor confere.

// Espelha DIAS_MINIMOS_TRANSFERENCIA_PAINEL (src/lib/licencas-sobrando.ts, que importa o banco)
const DIAS_MINIMOS_PAINEL = 30;

type Destino = { id_app_registro: string; id_app: number; nome_app: string; id_cliente: string; nome: string; mac: string | null; validade: string | null; sem_validade: boolean };

const MOTIVO: Record<MotivoSobra, { label: string; classes: string }> = {
  cliente_saiu: { label: "Cliente saiu", classes: "bg-red-50 text-red-700" },
  app_inativo: { label: "App inativo", classes: "bg-amber-50 text-amber-700" },
  sem_cliente: { label: "Sem cliente", classes: "bg-zinc-100 text-zinc-600" },
};

const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const hojeStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAte = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(hojeStr() + "T00:00:00").getTime()) / 86_400_000);

export default function LicencaSobrandoModal({ destino, onClose }: { destino: Destino; onClose: () => void }) {
  const router = useRouter();
  const [licencas, setLicencas] = useState<LicencaSobrando[] | null>(null);
  const [resultados, setResultados] = useState<Record<string, Conferencia>>({});
  const [pendentes, setPendentes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [transferindo, setTransferindo] = useState<{ id: number; etapa: string } | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const pediuConferencia = useRef(false);
  const smartOne = destino.id_app === ID_APP_SMARTONE;

  async function carregar() {
    const r = await fetch(`/api/aplicativos/licencas-sobrando?app=${destino.id_app}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r) { setErro("Sem internet ou o sistema está atualizando. Feche e abra de novo."); return null; }
    setLicencas(r.licencas);
    setResultados(r.resultados ?? {});
    setPendentes(r.pendentes ?? []);
    return r as { licencas: LicencaSobrando[]; resultados: Record<string, Conferencia>; pendentes: string[] };
  }

  // Ordem: aparelhos do mesmo cliente (troca de TV) primeiro, depois as licenças mais longas
  const ordenadas = useMemo(() => {
    if (!licencas) return [];
    const mesmo = (l: LicencaSobrando) => (String(l.id_cliente ?? "") === destino.id_cliente ? 0 : 1);
    return licencas
      .filter((l) => String(l.id_app_registro) !== destino.id_app_registro)
      .sort((a, b) => mesmo(a) - mesmo(b) || b.dias - a.dias);
  }, [licencas, destino]);

  // Abre: lista na hora; pede a conferência no site na ordem da tela; acompanha a cada 3 s
  useEffect(() => {
    let parar = false;
    void (async () => {
      const r = await carregar();
      if (!r || parar || pediuConferencia.current || !smartOne) return;
      pediuConferencia.current = true;
      const mesmo = (l: LicencaSobrando) => (String(l.id_cliente ?? "") === destino.id_cliente ? 0 : 1);
      const macs = [...r.licencas]
        .filter((l) => String(l.id_app_registro) !== destino.id_app_registro)
        .sort((a, b) => mesmo(a) - mesmo(b) || b.dias - a.dias)
        .map((l) => l.mac);
      await fetch("/api/aplicativos/licencas-sobrando", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macs }),
      }).catch(() => null);
    })();
    // Só o SmartOne confere no site em segundo plano; os outros não precisam acompanhar
    const t = smartOne ? setInterval(() => { if (!parar) void carregar(); }, 3000) : undefined;
    return () => { parar = true; if (t) clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function transferir(origem: LicencaSobrando) {
    if (confirmar !== origem.id_app_registro) {
      setConfirmar(origem.id_app_registro);
      return;
    }
    setConfirmar(null);
    setErro(null);
    setTransferindo({ id: origem.id_app_registro, etapa: "Iniciando…" });
    try {
      const res = await fetch(`/api/aplicativos/${destino.id_app_registro}/transferir-licenca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_origem: origem.id_app_registro }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.jobId) throw new Error(data.erro ?? "Não deu pra iniciar a transferência.");
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await fetch(`/api/aplicativos/${destino.id_app_registro}/transferir-licenca?jobId=${encodeURIComponent(data.jobId)}`)
          .then((r) => r.json())
          .catch(() => null);
        if (!job) continue;
        if (!job.done) { setTransferindo({ id: origem.id_app_registro, etapa: job.etapa ?? "Transferindo…" }); continue; }
        if (!job.ok) throw new Error(job.erro ?? "Não deu pra transferir.");
        setFeito(`Licença transferida de ${origem.mac}. ${destino.nome} agora vai até ${br(job.validade)}.`);
        router.refresh();
        return;
      }
      throw new Error(`O ${destino.nome_app} demorou para responder. Confira no site antes de tentar de novo.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
      void carregar();
    } finally {
      setTransferindo(null);
    }
  }

  const diasDestino = destino.validade && !destino.sem_validade ? diasAte(destino.validade.slice(0, 10)) : 0;
  const ocupado = transferindo !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[88vh]">
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">Usar licença sobrando</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Para {destino.nome} · <span className="font-mono">{destino.mac}</span>
              {diasDestino > 0 && <> · ainda tem {diasDestino} dias (até {br(destino.validade)})</>}
            </p>
          </div>
          <button onClick={() => !ocupado && onClose()} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 pt-3 space-y-2">
          {smartOne ? (
            <p className="text-xs text-zinc-600">
              Aparelhos SmartOne sem uso com licença válida. A licença só transfere uma vez; a coluna &quot;Transfere?&quot; é conferida no site, alguns segundos por aparelho. As listas não vão junto.
            </p>
          ) : (
            <p className="text-xs text-zinc-600">
              Aparelhos {destino.nome_app} sem uso com licença válida. Só transfere para aparelho novo, ainda sem licença paga (em teste), e só licenças com {DIAS_MINIMOS_PAINEL} dias ou mais. O aparelho de origem sai do painel.
            </p>
          )}
          {diasDestino > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              Os {diasDestino} dias que este aparelho ainda tem não somam: ele fica com a licença transferida.
            </p>
          )}
          {feito && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">✓ {feito}</p>}
          {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {licencas === null ? (
            <p className="text-sm text-zinc-500 text-center py-6">Carregando…</p>
          ) : ordenadas.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">Nenhuma licença sobrando.</p>
          ) : (
            // Larguras fixas: o botão muda de texto ao confirmar/transferir e não pode empurrar as colunas
            <table className="w-full text-sm table-fixed">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 text-left font-medium">Aparelho sem uso</th>
                  <th className="py-2 text-left font-medium w-24">Vence</th>
                  <th className="py-2 text-left font-medium w-32">Motivo</th>
                  <th className="py-2 text-left font-medium w-28">Transfere?</th>
                  <th className="py-2 w-40" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {ordenadas.map((l) => {
                  const c = resultados[l.mac.trim().toUpperCase()];
                  const conferindo = pendentes.includes(l.mac.trim().toUpperCase());
                  const pode = smartOne ? c?.estado === "ok" && c.transferivel : l.dias >= DIAS_MINIMOS_PAINEL;
                  const mesmoCliente = String(l.id_cliente ?? "") === destino.id_cliente;
                  const ganha = l.dias - Math.max(diasDestino, 0);
                  return (
                    <tr key={l.id_app_registro} className={mesmoCliente ? "bg-emerald-50/40" : undefined}>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-zinc-800">
                          {l.nome_cliente && l.id_cliente ? (
                            <a
                              href={`/clientes/${l.id_cliente}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir o cliente em nova guia"
                              className="hover:underline hover:text-violet-700"
                            >
                              {l.nome_cliente}
                            </a>
                          ) : (
                            l.nome_cliente ?? <span className="italic text-zinc-400">Sem cliente</span>
                          )}
                          {mesmoCliente && <span className="ml-1 text-xs font-normal text-emerald-700">· mesmo cliente</span>}
                        </div>
                        <div className="font-mono text-xs text-zinc-500 truncate">{l.mac}</div>
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {br(l.validade)}
                        <div className="text-xs text-zinc-400">{l.dias} dias</div>
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${MOTIVO[l.motivo].classes}`}>{MOTIVO[l.motivo].label}</span>
                        {l.motivo === "cliente_saiu" && l.ultimo_venc_contrato && (
                          <div className="text-xs text-zinc-400 mt-0.5">assinatura até {br(l.ultimo_venc_contrato)}</div>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-xs whitespace-nowrap">
                        {!smartOne
                          ? pode ? <span className="text-emerald-700 font-semibold">✓ Sim</span> : <span className="text-zinc-400">Menos de {DIAS_MINIMOS_PAINEL} dias</span>
                          : c?.estado === "ok"
                          ? c.transferivel ? <span className="text-emerald-700 font-semibold">✓ Sim</span> : <span className="text-zinc-400">Não</span>
                          : c?.estado === "erro" ? <span className="text-red-600">Não deu pra conferir</span>
                          : conferindo ? <span className="text-zinc-400">conferindo…</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="py-2 text-right">
                        {transferindo?.id === l.id_app_registro ? (
                          <span className="block truncate text-xs text-violet-700" title={transferindo.etapa}>{transferindo.etapa}</span>
                        ) : (
                          <button
                            onClick={() => void transferir(l)}
                            disabled={!pode || ocupado || !!feito || ganha <= 0}
                            title={ganha <= 0 ? "Este aparelho já tem mais dias do que essa licença" : undefined}
                            className={`h-7 w-full whitespace-nowrap rounded-lg px-2 text-xs font-medium text-white transition-colors disabled:opacity-40 ${
                              confirmar === l.id_app_registro ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"
                            }`}
                          >
                            {confirmar === l.id_app_registro ? `Confirmar (${l.dias} dias)` : "Transferir"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end">
          <button onClick={() => !ocupado && onClose()} disabled={ocupado} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
