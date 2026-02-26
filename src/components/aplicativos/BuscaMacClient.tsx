"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { buscarPorMac, type ResultadoMac } from "@/app/actions/buscarPorMac";
import { buscarClientes, type ClienteBuscaRow } from "@/app/actions/buscarClientes";
import { updateAplicativo, createAplicativo, type AplicativoData } from "@/app/actions/aplicativos";
import type { AppRow } from "@/lib/aplicativos";

type Props = { apps: AppRow[] };

const STATUS_OPTIONS = ["ativa", "inativa", "neutra"];

const inputClass =
  "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";
const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

function toDateInput(v: string | null) {
  if (!v) return "";
  return v.split("T")[0];
}

// ── Hook: busca de cliente com navegação por teclado ───────────────────────────

function useClienteSearch() {
  const [busca, setBusca]                 = useState("");
  const [clienteId, setClienteId]         = useState<string>("");
  const [clienteNome, setClienteNome]     = useState("");
  const [resultados, setResultados]       = useState<ClienteBuscaRow[]>([]);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [activeIdx, setActiveIdx]         = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((valor: string) => {
    setBusca(valor);
    setActiveIdx(-1);
    setDropdownAberto(true);
    if (!valor.trim()) {
      setClienteId("");
      setClienteNome("");
      setResultados([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setResultados(await buscarClientes(valor));
    }, 300);
  }, []);

  const selecionar = useCallback((c: ClienteBuscaRow) => {
    setClienteId(c.id_cliente);
    setClienteNome(c.nome);
    setBusca(c.nome);
    setResultados([]);
    setDropdownAberto(false);
    setActiveIdx(-1);
  }, []);

  const limpar = useCallback(() => {
    setClienteId("");
    setClienteNome("");
    setBusca("");
    setResultados([]);
    setDropdownAberto(false);
    setActiveIdx(-1);
  }, []);

  /** Chame no onKeyDown do <input> */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!dropdownAberto || resultados.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i < resultados.length - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i > 0 ? i - 1 : resultados.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIdx >= 0 && resultados[activeIdx]) {
          selecionar(resultados[activeIdx]);
        }
      } else if (e.key === "Escape") {
        setDropdownAberto(false);
      }
    },
    [dropdownAberto, resultados, activeIdx, selecionar]
  );

  return {
    busca, clienteId, clienteNome,
    resultados, dropdownAberto, activeIdx,
    handleChange, selecionar, limpar, handleKeyDown,
    setDropdownAberto,
  };
}

// ── Campo de busca de cliente (reutilizável nos dois modais) ───────────────────

function ClienteSearchField({
  state,
  initialNome,
}: {
  state: ReturnType<typeof useClienteSearch>;
  initialNome?: string;
}) {
  const selecionado = state.clienteId && state.clienteNome === state.busca;

  return (
    <div className="relative">
      <label className={labelClass}>Cliente</label>
      <input
        value={state.busca}
        onChange={(e) => state.handleChange(e.target.value)}
        onFocus={() => state.busca && state.setDropdownAberto(true)}
        onKeyDown={state.handleKeyDown}
        className={inputClass}
        placeholder="🔍 Buscar cliente pelo nome ou ID..."
        autoComplete="off"
      />

      {selecionado && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1 font-medium">
            ✓ ID {state.clienteId} — {state.clienteNome}
          </span>
          <button
            type="button"
            onClick={state.limpar}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            ✕ limpar
          </button>
        </div>
      )}

      {state.dropdownAberto &&
        state.busca.trim().length > 0 &&
        state.resultados.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
            {state.resultados.map((c, idx) => (
              <button
                key={c.id_cliente}
                type="button"
                onMouseDown={() => state.selecionar(c)}
                className={`w-full text-left px-4 py-2.5 text-sm flex justify-between transition-colors ${
                  idx === state.activeIdx
                    ? "bg-zinc-100 text-zinc-900"
                    : "hover:bg-zinc-50"
                }`}
              >
                <span className="font-medium">{c.nome}</span>
                <span className="text-xs text-zinc-400">ID {c.id_cliente}</span>
              </button>
            ))}
            <p className="px-4 py-1.5 text-[11px] text-zinc-400 border-t bg-zinc-50">
              ↑ ↓ navegar · Enter selecionar · Esc fechar
            </p>
          </div>
        )}
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function BuscaMacClient({ apps }: Props) {
  const [mac, setMac]               = useState("");
  const [resultados, setResultados] = useState<ResultadoMac[]>([]);
  const [buscando, setBuscando]     = useState(false);
  const [editando, setEditando]     = useState<ResultadoMac | null>(null);
  const [adicionando, setAdicionando] = useState(false);
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

  const semResultados = mac.trim().length > 0 && !buscando && resultados.length === 0;

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
                      <div className="font-medium text-zinc-900">
                        {r.id_cliente ? (
                          <a href={`/clientes/${r.id_cliente}`} className="hover:text-zinc-600 hover:underline transition-colors">
                            {r.nome_cliente ?? `Cliente #${r.id_cliente}`}
                          </a>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </div>
                      {r.id_cliente && (
                        <div className="text-xs text-zinc-400">ID {r.id_cliente}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{r.nome_app ?? `App #${r.id_app}`}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">{r.mac ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">{r.chave ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      {r.validade ? r.validade?.split("T")[0].split("-").reverse().join("/") ?? "—" : "—"}
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

      {/* Estado vazio — sem resultados */}
      {semResultados && (
        <div className="rounded-2xl border bg-white p-8 flex flex-col items-center gap-4 text-center">
          <p className="text-zinc-400 text-sm">
            Nenhum resultado para{" "}
            <span className="font-mono font-medium text-zinc-600">{mac}</span>
          </p>
          <button
            onClick={() => setAdicionando(true)}
            className="inline-flex items-center gap-2 h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Adicionar APP
          </button>
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

      {/* Modal de criação */}
      {adicionando && (
        <AddModal
          apps={apps}
          macInicial={mac}
          onClose={() => setAdicionando(false)}
          onSaved={() => {
            router.refresh();
            buscarPorMac(mac).then(setResultados);
            setAdicionando(false);
          }}
        />
      )}
    </div>
  );
}

// ── Modal de criação ───────────────────────────────────────────────────────────

function AddModal({
  apps,
  macInicial,
  onClose,
  onSaved,
}: {
  apps: AppRow[];
  macInicial?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const clienteSearch = useClienteSearch();

  const [idApp, setIdApp]               = useState("");
  const [mac, setMac]                   = useState(macInicial ?? "");
  const [chave, setChave]               = useState("");
  const [validade, setValidade]         = useState("");
  const [status, setStatus]             = useState("ativa");
  const [observacao, setObservacao]     = useState("");
  const [idAssinatura, setIdAssinatura] = useState("");
  const [idConta, setIdConta]           = useState("");
  const [idDispositivo, setIdDispositivo] = useState("");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const payload: AplicativoData = {
          id_cliente:     clienteSearch.clienteId || null,
          id_app:         idApp         || null,
          mac:            mac           || null,
          chave:          chave         || null,
          validade:       validade      || null,
          status,
          observacao:     observacao    || null,
          id_assinatura:  idAssinatura  || null,
          id_conta:       idConta       || null,
          id_dispositivo: idDispositivo || null,
        };
        await createAplicativo(clienteSearch.clienteId || "", payload);
        onSaved();
      } catch {
        setError("Erro ao cadastrar. Verifique os dados e tente novamente.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-bold text-zinc-900">Adicionar Aplicativo</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Preencha os dados do novo registro</p>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Busca de cliente com navegação por teclado */}
          <ClienteSearchField state={clienteSearch} />

          {/* App e Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Aplicativo</label>
              <select
                value={idApp}
                onChange={(e) => setIdApp(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all bg-white"
              >
                <option value="">— Selecione —</option>
                {apps.map((a) => (
                  <option key={a.id_app} value={a.id_app}>{a.nome_app}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all bg-white"
              >
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
              <input value={mac} onChange={(e) => setMac(e.target.value)} className={inputClass} placeholder="00:00:00:00:00:00" />
            </div>
            <div>
              <label className={labelClass}>Chave / Licença</label>
              <input value={chave} onChange={(e) => setChave(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Validade */}
          <div>
            <label className={labelClass}>Validade</label>
            <input
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              className={inputClass}
            />
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
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all resize-none"
            />
          </div>
        </div>

        {error && (
          <p className="mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "Cadastrar APP"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de edição (inalterado, mas agora usa ClienteSearchField) ─────────────

function EditModal({
  registro, apps, onClose, onSaved,
}: {
  registro: ResultadoMac;
  apps: AppRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const clienteSearch = useClienteSearch();

  // inicializa o search com os dados do registro
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    if (registro.nome_cliente) clienteSearch.handleChange(registro.nome_cliente);
    // força seleção direta sem disparar busca
    setInitialized(true);
  }

  const [idApp, setIdApp]               = useState(String(registro.id_app ?? ""));
  const [mac, setMac]                   = useState(registro.mac ?? "");
  const [chave, setChave]               = useState(registro.chave ?? "");
  const [validade, setValidade]         = useState(toDateInput(registro.validade));
  const [status, setStatus]             = useState(registro.status ?? "ativo");
  const [observacao, setObservacao]     = useState(registro.observacao ?? "");
  const [idAssinatura, setIdAssinatura] = useState(String(registro.id_assinatura ?? ""));
  const [idConta, setIdConta]           = useState(String(registro.id_conta ?? ""));
  const [idDispositivo, setIdDispositivo] = useState(String(registro.id_dispositivo ?? ""));

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Para edição, mantemos o id_cliente original caso o search não tenha sido alterado
  const clienteIdEfetivo = clienteSearch.clienteId || registro.id_cliente || "";

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateAplicativo(registro.id_app_registro, clienteIdEfetivo, {
          id_cliente:     clienteIdEfetivo || null,
          id_app:         idApp            || null,
          mac:            mac              || null,
          chave:          chave            || null,
          validade:       validade         || null,
          status,
          observacao:     observacao       || null,
          id_assinatura:  idAssinatura     || null,
          id_conta:       idConta          || null,
          id_dispositivo: idDispositivo    || null,
        });
        onSaved();
      } catch {
        setError("Erro ao salvar. Tente novamente.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-bold text-zinc-900">Editar Aplicativo</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Registro #{registro.id_app_registro}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Busca de cliente com teclado */}
          <ClienteSearchField state={clienteSearch} initialNome={registro.nome_cliente ?? undefined} />

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