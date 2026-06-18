"use client";
import { useState, useEffect } from "react";
import type { PainelServidorRow } from "@/lib/paineis";

const TIPO_LABEL: Record<string, string> = {
  club:    "CLUB",
  central: "CENTRAL",
  uniplay: "UNIPLAY",
  now:     "NOW",
  unitv:   "UNITV",
  liebe:   "LIEBE",
  fast:    "FAST",
  natv:    "NATV",
};

const TIPO_BADGE: Record<string, string> = {
  club:    "bg-purple-100 text-purple-700",
  central: "bg-blue-100 text-blue-700",
  uniplay: "bg-indigo-100 text-indigo-700",
  now:     "bg-cyan-100 text-cyan-700",
  unitv:   "bg-teal-100 text-teal-700",
  liebe:   "bg-pink-100 text-pink-700",
  fast:    "bg-orange-100 text-orange-700",
  natv:    "bg-zinc-100 text-zinc-600",
};

type StatusAoVivo = {
  conectado: boolean;
  creditos: number | null;
  ativas: number;
  vencidas: number;
  bloqueadas: number;
  erro?: string;
};

type Props = { painel: PainelServidorRow; onEditar: () => void };

export default function PainelServidorCard({ painel, onEditar }: Props) {
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState<StatusAoVivo | null>(null);
  const [carregandoStatus, setCarregandoStatus] = useState(false);
  const [renovandoSessao, setRenovandoSessao] = useState(false);
  const [importandoSenhas, setImportandoSenhas] = useState(false);

  // Tipos com auto-login via impit (TLS Chrome) — login automático sem sessão salva
  const TIPOS_AUTO_LOGIN: string[] = ["uniplay", "central"];

  const podeBuscarStatus =
    painel.tem_api_token ||
    TIPOS_AUTO_LOGIN.includes(painel.tipo) ||
    (painel.tem_session &&
      (!painel.session_expiry || new Date(painel.session_expiry) > new Date()));

  useEffect(() => {
    if (!podeBuscarStatus) return;
    buscarStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel.id]);

  async function buscarStatus() {
    setCarregandoStatus(true);
    try {
      const res = await fetch(`/api/paineis/servidores/${painel.id}/status`);
      const json = await res.json();
      setAoVivo(json);
    } catch {
      // silencioso — card mostra dados do banco normalmente
    } finally {
      setCarregandoStatus(false);
    }
  }

  const sessionExpirada =
    painel.session_expiry && new Date(painel.session_expiry) < new Date();

  function statusConexao() {
    if (aoVivo?.conectado === false)
      return { label: "Sem conexão", cor: "text-red-600 bg-red-50" };
    if (aoVivo?.conectado)
      return { label: "Conectado", cor: "text-emerald-600 bg-emerald-50" };
    if (painel.tem_api_token)
      return { label: "Token ativo", cor: "text-emerald-600 bg-emerald-50" };
    if (painel.tem_session && !sessionExpirada)
      return { label: "Sessão ativa", cor: "text-emerald-600 bg-emerald-50" };
    if (painel.tem_session && sessionExpirada)
      return { label: "Sessão expirada", cor: "text-amber-600 bg-amber-50" };
    return { label: "Sem sessão", cor: "text-red-600 bg-red-50" };
  }

  async function renovarSessaoClub() {
    setRenovandoSessao(true);
    setMensagem("Iniciando resolução de captcha...");
    try {
      // 1. Dispara o job em background (retorna imediatamente)
      const startRes = await fetch(`/api/paineis/servidores/${painel.id}/renovar-sessao`, { method: "POST" });
      const { jobId } = await startRes.json();
      if (!jobId) { setMensagem("Erro ao iniciar o job."); return; }

      // 2. Polling a cada 10 segundos até concluir (máx 15 min)
      const inicio = Date.now();
      const MAX_ESPERA = 15 * 60 * 1000;
      let tentativa = 0;
      while (Date.now() - inicio < MAX_ESPERA) {
        await new Promise(r => setTimeout(r, 10_000));
        tentativa++;
        setMensagem(`Aguardando 2captcha... tentativa ${tentativa} (~${Math.round((Date.now() - inicio) / 1000)}s)`);
        const poll = await fetch(`/api/paineis/servidores/${painel.id}/renovar-sessao?jobId=${jobId}`);
        const state = await poll.json();
        if (state.done) {
          if (state.ok) {
            setMensagem("Sessão renovada com sucesso!");
            await buscarStatus();
          } else {
            setMensagem(`Erro: ${state.erro}`);
          }
          return;
        }
      }
      setMensagem("Timeout: 2captcha não resolveu em 15 minutos. Tente novamente.");
    } catch (e: unknown) {
      setMensagem(`Erro inesperado: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRenovandoSessao(false);
    }
  }

  async function importarSenhas() {
    setImportandoSenhas(true);
    setMensagem("Importando senhas... (pode levar alguns minutos)");
    try {
      const res = await fetch(`/api/paineis/servidores/${painel.id}/importar-senhas`, { method: "POST" });
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`); }
      setMensagem(json.mensagem ?? json.erro ?? (res.ok ? "Senhas importadas." : `Erro ${res.status}.`));
    } catch (e: unknown) {
      setMensagem(e instanceof Error ? e.message : "Erro de rede.");
    } finally {
      setImportandoSenhas(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    setMensagem(null);
    try {
      const res = await fetch(`/api/paineis/servidores/${painel.id}/sincronizar`, {
        method: "POST",
      });
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} — resposta não-JSON: ${text.slice(0, 200)}`); }
      setMensagem(json.mensagem ?? json.erro ?? (res.ok ? "Sincronizado com sucesso." : `Erro ${res.status}.`));
    } catch (e: unknown) {
      setMensagem(e instanceof Error ? e.message : "Erro de rede.");
    } finally {
      setSincronizando(false);
    }
  }

  const status = statusConexao();

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
          {/* Créditos — só aparece quando disponível */}
          {aoVivo?.creditos !== undefined && aoVivo.creditos !== null && (
            <span className="text-xs font-semibold text-zinc-700">
              {aoVivo.creditos.toFixed(1).replace(".", ",")} créditos
            </span>
          )}
        </div>
      </div>

      {/* Contadores — banco + ao vivo se disponível */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={painel.total_contas} />
        <Stat
          label="Ativas"
          value={aoVivo?.ativas ?? painel.contas_confirmadas}
          cor="text-emerald-700"
          aoVivo={aoVivo !== null}
        />
        <Stat
          label={aoVivo ? "Vencidas" : "Pendentes"}
          value={aoVivo?.vencidas ?? painel.contas_pendentes}
          cor={(aoVivo?.vencidas ?? painel.contas_pendentes) > 0 ? "text-amber-600" : undefined}
          aoVivo={aoVivo !== null}
        />
      </div>

      {/* Master */}
      {painel.master && (
        <div className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">Master:</span> {painel.master}
          {painel.contato_master && (
            <span className="ml-1 text-zinc-400">· {painel.contato_master}</span>
          )}
        </div>
      )}

      {/* Padrões de criação */}
      {(painel.padrao_usuario || painel.padrao_senha) && (
        <div className="text-xs text-zinc-400 space-y-0.5">
          {painel.padrao_usuario && (
            <p><span className="text-zinc-500">Usuário:</span> {painel.padrao_usuario}</p>
          )}
          {painel.padrao_senha && (
            <p><span className="text-zinc-500">Senha:</span> {painel.padrao_senha}</p>
          )}
        </div>
      )}

      {/* Erro ao vivo */}
      {aoVivo?.erro && (
        <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{aoVivo.erro}</p>
      )}

      {/* Feedback sincronização */}
      {mensagem && (
        <p className="text-xs text-zinc-500 bg-zinc-50 rounded px-3 py-2">{mensagem}</p>
      )}


      {/* Renovar sessão — exclusivo para CLUB; mostra sem sessão, expirada ou com status offline */}
      {painel.tipo === "club" && (
        !painel.tem_session ||
        (painel.session_expiry && new Date(painel.session_expiry) < new Date()) ||
        aoVivo?.conectado === false
      ) && (
        <button
          onClick={renovarSessaoClub}
          disabled={renovandoSessao}
          className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {renovandoSessao ? "Resolvendo captcha... (pode levar minutos)" : "Renovar Sessão CLUB"}
        </button>
      )}

      {/* Importar senhas — exclusivo para CLUB; só quando conectado */}
      {painel.tipo === "club" && aoVivo?.conectado && (
        <button
          onClick={importarSenhas}
          disabled={importandoSenhas}
          className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          {importandoSenhas ? "Importando senhas… (aguarde)" : "Importar Senhas CLUB"}
        </button>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {sincronizando ? "Sincronizando…" : "Sincronizar"}
        </button>
        <button
          onClick={onEditar}
          title="Editar painel"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={buscarStatus}
          disabled={carregandoStatus}
          title="Atualizar status ao vivo"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          ↻
        </button>
        {painel.url_painel && (
          <a
            href={painel.url_painel}
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

function Stat({
  label,
  value,
  cor,
  aoVivo,
}: {
  label: string;
  value: number;
  cor?: string;
  aoVivo?: boolean;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 py-2 px-1 relative">
      <p className={`text-lg font-bold ${cor ?? "text-zinc-800"}`}>{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
      {aoVivo && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" title="Dado ao vivo" />
      )}
    </div>
  );
}
