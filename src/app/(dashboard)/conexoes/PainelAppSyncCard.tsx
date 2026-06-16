"use client";
import { useState, useEffect } from "react";
import type { PainelAppSyncRow } from "@/lib/paineis";

const TIPO_BADGE: Record<string, string> = {
  funplays:   "bg-green-100 text-green-700",
  lazerplay:  "bg-yellow-100 text-yellow-700",
  coreplayer: "bg-emerald-100 text-emerald-700",
};

const TIPO_LABEL: Record<string, string> = {
  funplays:   "FunPlays",
  lazerplay:  "LazerPlay",
  coreplayer: "CorePlayer",
};

const URL_PAINEL: Record<string, string> = {
  funplays:   "https://reseller.funplays.app",
  lazerplay:  "https://reseller.lazerplay.io",
  coreplayer: "https://reseller.coreplayer.io",
};

type StatusAoVivo = {
  conectado: boolean;
  creditos: number | null;
  erro?: string;
};

type Props = { painel: PainelAppSyncRow; onEditar: () => void };

export default function PainelAppSyncCard({ painel, onEditar }: Props) {
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState<StatusAoVivo | null>(null);
  const [carregandoStatus, setCarregandoStatus] = useState(false);

  const sessionExpirada =
    painel.session_expiry && new Date(painel.session_expiry) < new Date();
  const sessionAtiva = painel.tem_session && !sessionExpirada;

  useEffect(() => {
    if (sessionAtiva) buscarStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel.id]);

  async function buscarStatus() {
    setCarregandoStatus(true);
    try {
      const res = await fetch(`/api/paineis/servidores/${painel.id}/status`);
      const json = await res.json();
      setAoVivo({ conectado: !json.erro, creditos: json.creditos ?? null, erro: json.erro });
    } catch {
      // silencioso
    } finally {
      setCarregandoStatus(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    setMensagem("Sincronizando devices e playlists...");
    try {
      const res = await fetch(`/api/paineis/servidores/${painel.id}/sync-aplicativos`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        setMensagem(
          `✅ ${json.total_devices} devices · ${json.playlists_sincronizadas} playlists · ${json.inseridos} novos · ${json.atualizados} atualizados`
        );
      } else {
        setMensagem(`Erro: ${json.erro}`);
      }
    } catch {
      setMensagem("Erro de rede.");
    } finally {
      setSincronizando(false);
    }
  }

  function statusConexao() {
    if (aoVivo?.conectado === false)
      return { label: "Sem conexão", cor: "text-red-600 bg-red-50" };
    if (aoVivo?.conectado)
      return { label: "Conectado", cor: "text-emerald-600 bg-emerald-50" };
    if (sessionAtiva)
      return { label: "Sessão ativa", cor: "text-emerald-600 bg-emerald-50" };
    if (painel.tem_session && sessionExpirada)
      return { label: "Sessão expirada", cor: "text-amber-600 bg-amber-50" };
    return { label: "Sem sessão", cor: "text-red-600 bg-red-50" };
  }

  const status = statusConexao();
  const pctVinculados = painel.total_devices > 0
    ? Math.round((painel.devices_vinculados / painel.total_devices) * 100)
    : 0;
  const urlPainel = painel.url_painel ?? URL_PAINEL[painel.tipo];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900 text-base">{painel.nome}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_BADGE[painel.tipo] ?? "bg-zinc-100 text-zinc-600"}`}>
              {TIPO_LABEL[painel.tipo] ?? painel.tipo.toUpperCase()}
            </span>
          </div>
          {painel.usuario && (
            <p className="text-xs text-zinc-400 mt-0.5">{painel.usuario}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${status.cor}`}>
            {carregandoStatus ? "Verificando…" : status.label}
          </span>
          {aoVivo?.creditos != null && (
            <span className="text-xs font-semibold text-zinc-700">
              {aoVivo.creditos} crédito{aoVivo.creditos !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Stats de devices */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Devices" value={painel.total_devices} />
        <Stat label="Vinculados" value={painel.devices_vinculados} cor="text-emerald-700" nota={`${pctVinculados}%`} />
        <Stat label="Playlists" value={painel.total_playlists} nota={`${painel.playlists_vinculadas} ativas`} />
      </div>

      {/* Sessão expirada - aviso */}
      {painel.tem_session && sessionExpirada && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
          ⚠️ Sessão expirada. O sync vai tentar relogar automaticamente (requer CAPSOLVER_API_KEY).
        </p>
      )}

      {/* Erro ao vivo */}
      {aoVivo?.erro && (
        <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{aoVivo.erro}</p>
      )}

      {/* Feedback sync */}
      {mensagem && (
        <p className="text-xs text-zinc-500 bg-zinc-50 rounded px-3 py-2">{mensagem}</p>
      )}

      {/* Última sync */}
      {painel.session_expiry && (
        <p className="text-xs text-zinc-400">
          Token expira: {new Date(painel.session_expiry).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {sincronizando ? "Sincronizando…" : "Sync Devices"}
        </button>
        <button
          onClick={onEditar}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={buscarStatus}
          disabled={carregandoStatus}
          title="Atualizar status"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          ↻
        </button>
        {urlPainel && (
          <a
            href={urlPainel}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, cor, nota }: { label: string; value: number; cor?: string; nota?: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 py-2 px-1 relative">
      <p className={`text-lg font-bold ${cor ?? "text-zinc-800"}`}>{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
      {nota && <p className="text-[10px] text-zinc-400">{nota}</p>}
    </div>
  );
}
