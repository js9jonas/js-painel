"use client";
import { useState, useEffect } from "react";
import type { PainelServidorRow } from "@/lib/paineis";
import AtualizarTokenModal from "./AtualizarTokenModal";

const INSTRUCAO_TOKEN: Record<string, string> = {
  club:    "Acesse dashboard.bz, abra DevTools (F12) → Application → Local Storage → X-ACCESS-TOKEN e cole aqui.",
  central: "Acesse painel.fun, abra DevTools (F12) → Application → Local Storage → session-store → state.token e cole aqui.",
  now:     "Acesse o painel NOW, abra DevTools (F12) → Application → Cookies → PHPSESSID. Cole o valor no formato: PHPSESSID=<valor>",
  liebe:   "Acesse painel.liebeapp.me, abra DevTools (F12) → Application → Local Storage → token e cole aqui.",
  uniplay: "Acesse searchdefense.top logado → F12 → Network → filtre 'users-iptv' → clique na requisição → copie Authorization (sem 'Bearer ') no 1º campo e o valor de reg_password da URL no 2º campo.",
};

const TIPOS_TOKEN_MANUAL = Object.keys(INSTRUCAO_TOKEN);

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
  const [modalToken, setModalToken] = useState(false);
  const [renovandoSessao, setRenovandoSessao] = useState(false);

  // Tipos com auto-login: buscam status mesmo sem sessão salva no banco
  const TIPOS_AUTO_LOGIN: string[] = []; // uniplay removido: login bloqueado por IP na VPS

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

  async function sincronizar() {
    setSincronizando(true);
    setMensagem(null);
    try {
      const res = await fetch(`/api/paineis/servidores/${painel.id}/sincronizar`, {
        method: "POST",
      });
      const json = await res.json();
      setMensagem(json.mensagem ?? (res.ok ? "Sincronizado com sucesso." : "Erro ao sincronizar."));
    } catch {
      setMensagem("Erro de rede.");
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

      {/* Renovar sessão via Python curl_cffi — só UNIPLAY */}
      {painel.tipo === "uniplay" && (
        <button
          onClick={async () => {
            setRenovandoSessao(true);
            setMensagem(null);
            try {
              const res = await fetch(`/api/paineis/servidores/${painel.id}/refresh-session`, { method: "POST" });
              const json = await res.json();
              if (res.ok && json.ok) {
                setMensagem("Sessão renovada. Atualizando status...");
                await buscarStatus();
              } else {
                const detalhe = json.detalhe ? ` — ${JSON.stringify(json.detalhe)}` : "";
                const errStderr = json.stderr ? ` [stderr: ${json.stderr.slice(0, 200)}]` : "";
                setMensagem(`Erro: ${json.erro ?? json.error ?? "falha ao renovar"}${detalhe}${errStderr}`);
              }
            } catch {
              setMensagem("Erro de rede.");
            } finally {
              setRenovandoSessao(false);
            }
          }}
          disabled={renovandoSessao}
          className="w-full rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        >
          {renovandoSessao ? "Renovando sessão…" : "Renovar sessão (VPS)"}
        </button>
      )}

      {/* Botão atualizar token — só para painéis com sessão manual */}
      {TIPOS_TOKEN_MANUAL.includes(painel.tipo) && (
        <button
          onClick={() => setModalToken(true)}
          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
        >
          Atualizar token de sessão
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

      {modalToken && (
        <AtualizarTokenModal
          painelNome={painel.nome}
          painelId={painel.id}
          painelTipo={painel.tipo}
          instrucao={INSTRUCAO_TOKEN[painel.tipo] ?? "Cole o token de autenticação do painel."}
          onClose={() => setModalToken(false)}
          onSalvo={() => { setModalToken(false); buscarStatus(); }}
        />
      )}
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
