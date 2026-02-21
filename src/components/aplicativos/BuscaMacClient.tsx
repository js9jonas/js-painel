"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarPorMac, type ResultadoMac } from "@/app/actions/buscarPorMac";
import { buscarClientes, type ClienteBuscaRow } from "@/app/actions/buscarClientes";
import { updateAplicativo } from "@/app/actions/aplicativos";
import type { AppRow } from "@/lib/aplicativos";

type Props = { apps: AppRow[] };

const STATUS_OPTIONS = ["ativo", "inativo", "expirado", "bloqueado", "pendente"];

function toDateInput(v: string | null) {
  if (!v) return "";
  return v.split("T")[0];
}

export default function BuscaMacClient({ apps }: Props) {
  const [mac, setMac]               = useState("");
  const [resultados, setResultados] = useState<ResultadoMac[]>([]);
  const [buscando, setBuscando]     = useState(false);
  const [editando, setEditando]     = useState<ResultadoMac | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  function handleMacChange(valor: string) {
    setMac(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!valor.trim()) { setResultados([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try { setResultados(await buscarPorMac(valor)); }
      finally { setBuscando(false); }
    }, 400);
  }

  return (
    <div className="space-y-4">
      {/* Campo de busca */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <input
          value={mac}
          onChange={(e) => handleMacChange(e.target.value)}
          placeholder="🔍 Digite o MAC address... ex: 56:05:71"
          className="h-11 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
        />
        {buscando && (
          <p className="text-xs text-zinc-400 mt-2">Buscando...</p>
        )}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b bg-zinc-50 text-sm font-medium text-zinc-700">
            {resultados.length} resultado{resultados.length !== 1 ? "s" : ""} encontrado{resultados.length !== 1 ? "s" : ""}
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b">
                <tr>
                  {["Cliente", "App", "MAC", "Chave", "Validade", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {resultados.map((r) => (
                  <tr key={r.id_app_registro} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{r.nome_cliente ?? "—"}</div>
                      {r.id_cliente && (
                        <div className="text-xs text-zinc-400">ID {r.id_cliente}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{r.nome_app ?? `App #${r.id_app}`}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">{r.mac ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">{r.chave ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      {r.validade ? new Date(r.validade).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                        r.status?.toLowerCase() === "ativo"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}>
                        {r.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditando(r)}
                        className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
                      >
                        ✏️ Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mac && !buscando && resultados.length === 0 && (
        <div className="rounded-2xl border bg-white p-8 text-center text-zinc-400 text-sm">
          Nenhum resultado para <span className="font-mono font-medium">{mac}</span>
        </div>
      )}

      {/* Modal de edição */}
      {editando && (
        <EditModal
          registro={editando}
          apps={apps}
          onClose={() => setEditando(null)}
          onSaved={() => {
            router.refresh();
            buscarPorMac(mac).then(setResultados);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

// ── Modal de edição inline ──────────────────────────────────────

function EditModal({
  registro, apps, onClose, onSaved,
}: {
  registro: ResultadoMac;
  apps: AppRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [idApp, setIdApp]               = useState(String(registro.id_app ?? ""));
  const [mac, setMac]                   = useState(registro.mac ?? "");
  const [chave, setChave]               = useState(registro.chave ?? "");
  const [validade, setValidade]         = useState(toDateInput(registro.validade));
  const [status, setStatus]             = useState(registro.status ?? "ativa");
  const [observacao, setObservacao]     = useState(registro.observacao ?? "");
  const [idAssinatura, setIdAssinatura] = useState(String(registro.id_assinatura ?? ""));
  const [idConta, setIdConta]           = useState(String(registro.id_conta ?? ""));
  const [idDispositivo, setIdDispositivo] = useState(String(registro.id_dispositivo ?? ""));

  // Busca de cliente
  const [busca, setBusca]               = useState(registro.nome_cliente ?? "");
  const [clienteId, setClienteId]       = useState(registro.id_cliente ?? "");
  const [clienteNome, setClienteNome]   = useState(registro.nome_cliente ?? "");
  const [resultadosCliente, setResultadosCliente] = useState<ClienteBuscaRow[]>([]);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleBuscaCliente(valor: string) {
    setBusca(valor);
    setDropdownAberto(true);
    if (!valor.trim()) { setClienteId(""); setClienteNome(""); setResultadosCliente([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setResultadosCliente(await buscarClientes(valor));
    }, 300);
  }

  function selecionarCliente(c: ClienteBuscaRow) {
    setClienteId(c.id_cliente);
    setClienteNome(c.nome);
    setBusca(c.nome);
    setResultadosCliente([]);
    setDropdownAberto(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateAplicativo(registro.id_app_registro, clienteId || registro.id_cliente || "", {
          id_cliente:     clienteId     || null,
          id_app:         idApp         || null,
          mac:            mac           || null,
          chave:          chave         || null,
          validade:       validade      || null,
          status,
          observacao:     observacao    || null,
          id_assinatura:  idAssinatura  || null,
          id_conta:       idConta       || null,
          id_dispositivo: idDispositivo || null,
        });
        onSaved();
      } catch {
        setError("Erro ao salvar. Tente novamente.");
      }
    });
  }

  const inputClass = "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";
  const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-bold text-zinc-900">Editar Aplicativo</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Registro #{registro.id_app_registro}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Busca de cliente */}
          <div ref={dropdownRef} className="relative">
            <label className={labelClass}>Cliente</label>
            <input
              value={busca}
              onChange={(e) => handleBuscaCliente(e.target.value)}
              onFocus={() => busca && setDropdownAberto(true)}
              className={inputClass}
              placeholder="🔍 Buscar cliente..."
              autoComplete="off"
            />
            {clienteId && clienteNome === busca && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1 font-medium">
                  ✓ ID {clienteId} — {clienteNome}
                </span>
                <button type="button" onClick={() => { setClienteId(""); setClienteNome(""); setBusca(""); }}
                  className="text-xs text-zinc-400 hover:text-zinc-600">✕ limpar</button>
              </div>
            )}
            {dropdownAberto && busca.trim().length > 0 && resultadosCliente.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
                {resultadosCliente.map((c) => (
                  <button key={c.id_cliente} type="button"
                    onMouseDown={() => selecionarCliente(c)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-50 flex justify-between">
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-xs text-zinc-400">ID {c.id_cliente}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* App e Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Aplicativo</label>
              <select value={idApp} onChange={(e) => setIdApp(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all bg-white">
                <option value="">— Selecione —</option>
                {apps.map((a) => (
                  <option key={a.id_app} value={a.id_app}>{a.nome_app}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all bg-white">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* MAC e Chave */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>MAC Address</label>
              <input value={mac} onChange={(e) => setMac(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Chave / Licença</label>
              <input value={chave} onChange={(e) => setChave(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Validade */}
          <div>
            <label className={labelClass}>Validade</label>
            <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={inputClass} />
          </div>

          {/* IDs de vínculo */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Vínculos</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>ID Assinatura</label>
                <input type="number" value={idAssinatura} onChange={(e) => setIdAssinatura(e.target.value)} className={inputClass} placeholder="—" />
              </div>
              <div>
                <label className={labelClass}>ID Conta</label>
                <input type="number" value={idConta} onChange={(e) => setIdConta(e.target.value)} className={inputClass} placeholder="—" />
              </div>
              <div>
                <label className={labelClass}>ID Dispositivo</label>
                <input type="number" value={idDispositivo} onChange={(e) => setIdDispositivo(e.target.value)} className={inputClass} placeholder="—" />
              </div>
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className={labelClass}>Observação</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all resize-none" />
          </div>
        </div>

        {error && <p className="mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} disabled={isPending}
            className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={isPending}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {isPending ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}