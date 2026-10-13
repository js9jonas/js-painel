"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check } from "lucide-react";
import { AlertaAppRow } from "@/lib/alertas";
import AtivarPainelButton from "./AtivarPainelButton";
import LicencaSobrandoModal from "./LicencaSobrandoModal";
import { APPS_COM_TRANSFERENCIA_PAINEL } from "@/lib/apps-painel-ids";

type Filtro = "todos" | "com_contrato" | "sem_assinatura";

function hojeSP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function diasRestantes(data: string): number {
  const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const hoje = new Date(hojeStr + 'T00:00:00');
  const venc = new Date(data + "T00:00:00");
  return Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function badgeDias(dias: number) {
  if (dias < 0) return "bg-red-100 text-red-700";
  if (dias === 0) return "bg-orange-100 text-orange-700";
  if (dias <= 2) return "bg-yellow-100 text-yellow-700";
  return "bg-blue-50 text-blue-700";
}

function labelDias(dias: number) {
  if (dias < 0) return `${Math.abs(dias)}d atrás`;
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias}d`;
}

// Fun Play: a transferência só vale para aparelho novo, ainda sem licença paga — os "Precisa ativar"
// (add existing sem crédito) e os cadastrados à mão, fora do painel (em teste). O servidor confere no
// painel antes de transferir; aparelho já pago recebe aviso para usar "Renovar no painel".
function aparelhoNovoTransfere(r: AlertaAppRow): boolean {
  return APPS_COM_TRANSFERENCIA_PAINEL.includes(Number(r.id_app)) && (r.sem_validade || !r.no_painel_app);
}

export default function AlertasAppsClient({
  apps,
  recolhivel,
}: {
  apps: AlertaAppRow[];
  recolhivel?: boolean;
}) {
  const [aberto, setAberto] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("com_contrato");
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [licencaPara, setLicencaPara] = useState<AlertaAppRow | null>(null);

  const botaoLicenca = (r: AlertaAppRow) => (
    <button
      onClick={() => setLicencaPara(r)}
      title={r.painel_smartone
        ? "Transferir para este aparelho a licença de um cliente que saiu ou de um app inativo, sem gastar giftcode"
        : "Transferir para este aparelho novo a licença de um cliente que saiu ou de um app inativo, sem gastar crédito"}
      className="h-7 rounded-lg border border-violet-300 bg-white px-3 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
    >
      🎁 Licença sobrando
    </button>
  );

  function copiarNome(id: string, nome: string) {
    navigator.clipboard.writeText(nome);
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 1500);
  }

  const hoje = hojeSP();
  const filtrados = apps.filter((r) => {
    if (filtro === "com_contrato") {
      // Cadastro novo sem ativação (geralmente teste, ainda sem assinatura): sempre à vista.
      if (r.sem_validade) return true;
      // Só vale renovar a licença se o contrato vai além dela: se a assinatura vence antes (ou junto),
      // o cliente pode não renovar e a licença não precisa ser paga (Jonas, 13/10/2026).
      // E o contrato tem que estar em dia (vence hoje ou depois), senão volta licença antiga de quem já saiu.
      if (!r.venc_contrato_cliente) return false;
      const contrato = r.venc_contrato_cliente.split("T")[0];
      return contrato >= hoje && contrato > r.validade.slice(0, 10);
    }
    if (filtro === "sem_assinatura") return !r.venc_contrato_cliente;
    return true;
  });

  const btBase = "h-7 px-3 rounded-lg text-xs font-medium transition-colors border";
  const btAtivo = "bg-blue-600 text-white border-blue-600";
  const btInativo = "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400";

  return (
    <>
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-blue-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-900">📱 Aplicativos expirando</p>
            <p className="text-xs text-blue-700 mt-0.5">Validade ≤ 7 dias • Status ativa • Sem ativação no painel</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-blue-900">{filtrados.length}</span>
            {recolhivel && (
              <button
                onClick={() => setAberto((v) => !v)}
                className="text-blue-400 hover:text-blue-600 transition"
                title={aberto ? "Recolher" : "Expandir"}
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${aberto ? "rotate-0" : "-rotate-90"}`}
                  fill="none" viewBox="0 0 16 16"
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {aberto && (
          <>
            {/* Filtros */}
            <div className="px-5 py-3 border-b bg-zinc-50 flex items-center gap-2">
              <span className="text-xs text-zinc-500 mr-1">Filtrar:</span>
              {(
                [
                  { key: "todos", label: "Todos" },
                  { key: "com_contrato", label: "Contrato além da licença" },
                  { key: "sem_assinatura", label: "Sem assinatura" },
                ] as { key: Filtro; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFiltro(key)}
                  className={`${btBase} ${filtro === key ? btAtivo : btInativo}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tabela */}
            {filtrados.length === 0 ? (
              <div className="px-5 py-10 text-center text-zinc-400 text-sm">
                Nenhum aplicativo encontrado para este filtro ✅
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b">
                    <tr>
                      {["Cliente", "Pacote", "App", "MAC / Obs.", "Venc. Contrato", "Prazo", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filtrados.map((r) => {
                      const dias = diasRestantes(r.validade);
                      return (
                        <tr key={r.id_app_registro} className="hover:bg-zinc-50/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/clientes/${r.id_cliente}`}
                                className="font-medium text-zinc-900 hover:underline hover:text-zinc-600"
                              >
                                {r.nome}
                              </Link>
                              <button
                                onClick={() => copiarNome(r.id_app_registro, r.nome)}
                                title="Copiar nome"
                                className="text-zinc-300 hover:text-zinc-500 transition-colors"
                              >
                                {copiadoId === r.id_app_registro
                                  ? <Check className="w-3.5 h-3.5 text-green-500" />
                                  : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="text-xs text-zinc-400">ID {r.id_cliente}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-zinc-700">
                              {r.pacote_contrato ?? <span className="text-zinc-400 italic">—</span>}
                            </span>
                            <div className="text-xs text-zinc-400">
                              {r.total_apps} app{r.total_apps !== 1 ? "s" : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{r.nome_app}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-zinc-500">{r.mac ?? "—"}</span>
                            {r.observacao && (
                              <div className="text-xs text-zinc-400 mt-0.5 max-w-45 truncate" title={r.observacao}>
                                {r.observacao}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-600">
                            {r.venc_contrato_cliente
                              ? r.venc_contrato_cliente.split("T")[0].split("-").reverse().join("/")
                              : <span className="text-zinc-400 italic">Sem assinatura</span>}
                          </td>
                          <td className="px-4 py-3">
                            {r.sem_validade ? (
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-100 text-violet-700"
                                title="Cadastrado no painel sem ativação. A validade que aparece na TV é provisória."
                              >
                                Precisa ativar
                              </span>
                            ) : (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeDias(dias)}`}>
                                {labelDias(dias)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {r.sem_validade ? (
                              <div className="flex flex-wrap items-start gap-2">
                                <AtivarPainelButton idAppRegistro={r.id_app_registro} nomeCliente={r.nome} />
                                {aparelhoNovoTransfere(r) && botaoLicenca(r)}
                              </div>
                            ) : r.no_painel_app ? (
                              <div className="flex flex-wrap items-start gap-2">
                                <AtivarPainelButton idAppRegistro={r.id_app_registro} nomeCliente={r.nome} renovar giftcode={r.painel_smartone} />
                                {r.painel_smartone && botaoLicenca(r)}
                              </div>
                            ) : aparelhoNovoTransfere(r) ? (
                              <div className="flex flex-wrap items-start gap-2">
                                <AtivarPainelButton idAppRegistro={r.id_app_registro} nomeCliente={r.nome} />
                                {botaoLicenca(r)}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {licencaPara && (
        <LicencaSobrandoModal
          destino={{
            id_app_registro: licencaPara.id_app_registro,
            id_app: Number(licencaPara.id_app),
            nome_app: licencaPara.nome_app,
            id_cliente: licencaPara.id_cliente,
            nome: licencaPara.nome,
            mac: licencaPara.mac,
            validade: licencaPara.validade,
            sem_validade: licencaPara.sem_validade,
          }}
          onClose={() => setLicencaPara(null)}
        />
      )}
    </>
  );
}