"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { deleteAplicativo } from "@/app/actions/aplicativos";
import AplicativoModal from "./AplicativoModal";
import ModalRenovarAplicativo from "./ModalRenovarAplicativo";
import EditarPlaylistModal from "./EditarPlaylistModal";
import AdicionarPlaylistModal from "./AdicionarPlaylistModal";
import type { AplicativoRow, AppRow, PlaylistRow } from "@/lib/aplicativos";

type Props = {
  idCliente: string;
  nomeCliente: string;
  aplicativos: AplicativoRow[];
  apps: AppRow[];
};

function statusBadge(status: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "ativa":
    case "ativo":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20";
    case "pendente":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20";
    case "inativo":
    case "expirado":
      return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
    case "bloqueado":
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.split("T")[0].split("-").reverse().join("/");
}

// Compara só a data (YYYY-MM-DD), não o timestamp — comparar com `new Date()` direto
// marca o dia de hoje como vencido a qualquer hora após meia-noite UTC.
function hojeStr(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function isVencido(validade: string | null) {
  if (!validade) return false;
  return validade.slice(0, 10) < hojeStr();
}

function playlistStatus(pl: PlaylistRow, tipoPainel?: string | null, vencContrato?: string | null): "vinculada" | "expirada" | "nao_reconhecida" {
  const hoje = hojeStr();
  // Assinatura é a fonte de verdade: se há venc_contrato, determina o status diretamente.
  if (vencContrato) {
    return vencContrato < hoje ? "expirada" : "vinculada";
  }
  if (pl.id_conta) {
    // Sem assinatura, usa a validade real da conta no painel — não o expired_date do FunPlays
    const venc = pl.venc_real_conta;
    if (venc && venc.slice(0, 10) < hoje) return "expirada";
    return "vinculada";
  }
  // SmartOne não preenche expired_date (a validade fica no device, não na playlist).
  // Considerar válida se tem playlist_id_externo — "nao_reconhecida" seria falso positivo.
  if (tipoPainel === "smartone" && pl.playlist_id_externo != null) return "vinculada";
  if (pl.expired_date && pl.expired_date.slice(0, 10) < hoje) return "expirada";
  if (!pl.expired_date) return "nao_reconhecida";
  return "vinculada";
}

// Username já vem na URL da playlist como query param — extrair pra exibir mesmo
// quando a playlist não está vinculada a uma conta (id_conta null / "não reconhecida").
function extrairUsernameUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("username");
  } catch {
    return null;
  }
}

function PlaylistOptionsButton({ onEditar, onExcluir, excluindo }: { onEditar: () => void; onExcluir: () => void; excluindo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={excluindo}
        className="text-zinc-400 hover:text-zinc-700 px-1 disabled:opacity-50"
        title="Opções da playlist"
      >
        {excluindo ? <span className="animate-spin">⟳</span> : "▾"}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-200 bg-white shadow-lg py-1 z-50 text-left">
          <button
            type="button"
            onClick={() => { setAberto(false); onEditar(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            ✏️ Editar
          </button>
          <button
            type="button"
            onClick={() => { setAberto(false); onExcluir(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            🗑 Excluir
          </button>
        </div>
      )}
    </div>
  );
}

function PlaylistBadge({
  pl,
  idAppRegistro,
  tipoPainel,
  vencContrato,
  onEditar,
  onExcluido,
}: {
  pl: PlaylistRow;
  idAppRegistro: number;
  tipoPainel: string | null;
  vencContrato: string | null;
  onEditar: () => void;
  onExcluido: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  async function excluir() {
    if (!confirm(`Excluir a playlist "${pl.nome || `#${pl.playlist_id_externo}`}"? Isso é feito direto na API do painel e não pode ser desfeito.`)) return;
    setExcluindo(true);
    setErroExclusao(null);
    try {
      const startRes = await fetch(`/api/aplicativos/${idAppRegistro}/playlists/${pl.playlist_id_externo}?acao=excluir`, { method: "POST" });
      const { jobId } = await startRes.json();
      if (!jobId) {
        setErroExclusao("Erro ao iniciar exclusão.");
        setExcluindo(false);
        return;
      }
      const inicio = Date.now();
      const MAX_ESPERA = 5 * 60 * 1000;
      while (Date.now() - inicio < MAX_ESPERA) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(`/api/aplicativos/${idAppRegistro}/playlists/${pl.playlist_id_externo}?jobId=${jobId}`);
        const job = await poll.json();
        if (job.done) {
          if (job.ok) onExcluido();
          else setErroExclusao(job.erro ?? "Falha ao excluir.");
          setExcluindo(false);
          return;
        }
      }
      setErroExclusao("Timeout: exclusão não concluiu a tempo.");
      setExcluindo(false);
    } catch {
      setErroExclusao("Erro de rede.");
      setExcluindo(false);
    }
  }

  const status = playlistStatus(pl, tipoPainel, vencContrato);
  const classes = {
    vinculada:       "bg-emerald-50 text-emerald-700 border border-emerald-200",
    expirada:        "bg-red-50 text-red-600 border border-red-200",
    nao_reconhecida: "bg-amber-50 text-amber-700 border border-amber-200",
  }[status];

  const icon = {
    vinculada:       "●",
    expirada:        "⊗",
    nao_reconhecida: "◌",
  }[status];

  const usuario = pl.usuario_conta ?? (pl.url ? extrairUsernameUrl(pl.url) : null);

  return (
    <div className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs ${classes}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{pl.nome || `Playlist #${pl.playlist_id_externo}`}</div>
        {usuario && (
          <div className="text-[10px] opacity-75 font-mono select-all">{usuario}</div>
        )}
        {(pl.venc_real_conta ?? pl.expired_date) && (
          <div className="text-[10px] opacity-60">
            venc. {(pl.venc_real_conta ?? pl.expired_date)!.slice(0, 10).split("-").reverse().join("/")}
          </div>
        )}
        {pl.url && (
          <div
            className="text-[10px] opacity-60 font-mono truncate max-w-[220px] select-all"
            title={pl.url}
          >
            {pl.url}
          </div>
        )}
        {erroExclusao && (
          <div className="text-[10px] text-red-600 mt-0.5">{erroExclusao}</div>
        )}
      </div>
      {pl.playlist_id_externo != null && (
        <PlaylistOptionsButton onEditar={onEditar} onExcluir={excluir} excluindo={excluindo} />
      )}
    </div>
  );
}

function PlaylistsRow({
  playlists,
  idAppRegistro,
  tipoPainel,
  vencContrato,
  onEditarPlaylist,
  onPlaylistExcluida,
}: {
  playlists: PlaylistRow[];
  idAppRegistro: number;
  tipoPainel: string | null;
  vencContrato: string | null;
  onEditarPlaylist: (pl: PlaylistRow) => void;
  onPlaylistExcluida: (pl: PlaylistRow) => void;
}) {
  if (!playlists.length) return null;

  const stats = playlists.reduce(
    (acc, pl) => {
      const s = playlistStatus(pl, tipoPainel, vencContrato);
      acc[s]++;
      return acc;
    },
    { vinculada: 0, expirada: 0, nao_reconhecida: 0 }
  );

  return (
    <tr className="bg-zinc-50/60 border-b border-zinc-100">
      <td colSpan={7} className="px-4 pb-3 pt-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Playlists</span>
          {stats.vinculada > 0 && (
            <span className="text-[10px] text-emerald-600">{stats.vinculada} vinculada{stats.vinculada > 1 ? "s" : ""}</span>
          )}
          {stats.nao_reconhecida > 0 && (
            <span className="text-[10px] text-amber-600">{stats.nao_reconhecida} não reconhecida{stats.nao_reconhecida > 1 ? "s" : ""}</span>
          )}
          {stats.expirada > 0 && (
            <span className="text-[10px] text-red-600">{stats.expirada} expirada{stats.expirada > 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {playlists.map((pl) => (
            <PlaylistBadge
              key={pl.id}
              pl={pl}
              idAppRegistro={idAppRegistro}
              tipoPainel={tipoPainel}
              vencContrato={vencContrato}
              onEditar={() => onEditarPlaylist(pl)}
              onExcluido={() => onPlaylistExcluida(pl)}
            />
          ))}
        </div>
      </td>
    </tr>
  );
}

export default function AplicativosManager({ idCliente, nomeCliente, aplicativos, apps }: Props) {
  const [modalApp, setModalApp] = useState<AplicativoRow | null | "novo">(null);
  const [appPgto, setAppPgto] = useState<AplicativoRow | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [playlistsAoVivo, setPlaylistsAoVivo] = useState<Record<number, PlaylistRow[]>>({});
  const [atualizadoAoVivo, setAtualizadoAoVivo] = useState<Set<number>>(new Set());
  const [editandoPlaylist, setEditandoPlaylist] = useState<{ idAppRegistro: number; pl: PlaylistRow; tipoPainel: string | null } | null>(null);
  const [criandoPlaylist, setCriandoPlaylist] = useState<{ idAppRegistro: number; tipoPainel: string | null } | null>(null);
  const router = useRouter();

  async function recarregarPlaylistsAoVivo(idAppRegistro: number) {
    try {
      const r = await fetch(`/api/clientes/${idCliente}/aplicativos/${idAppRegistro}/playlists-live`);
      const json = await r.json();
      if (json.ok) {
        setPlaylistsAoVivo((prev) => ({ ...prev, [idAppRegistro]: json.playlists }));
        setAtualizadoAoVivo((prev) => new Set(prev).add(idAppRegistro));
      }
    } catch {
      // silencioso — mantém os dados já exibidos
    }
  }

  // Ao abrir a página do cliente, busca a playlist mais recente de cada app vinculado
  // a um painel — só usa sessão já em cache (sem forçar relogin síncrono, que pode
  // travar a página por até ~2min em painéis com captcha). Ver feedback_avaliacao_playlist_live.
  useEffect(() => {
    const candidatos = aplicativos.filter((a) => a.id_painel_servidor && a.chave);
    candidatos.forEach((a) => recarregarPlaylistsAoVivo(a.id_app_registro));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCliente]);

  function handlePlaylistExcluida(idAppRegistro: number, pl: PlaylistRow) {
    setPlaylistsAoVivo((prev) => {
      const atual = prev[idAppRegistro] ?? aplicativos.find((a) => a.id_app_registro === idAppRegistro)?.playlists ?? [];
      return { ...prev, [idAppRegistro]: atual.filter((p) => p.id !== pl.id) };
    });
    router.refresh();
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDelete(id_app_registro: number) {
    if (!confirm("Remover este aplicativo do cliente?")) return;
    setDeletingId(id_app_registro);
    startTransition(async () => {
      try {
        await deleteAplicativo(id_app_registro, idCliente);
        router.refresh();
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b bg-zinc-50 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-zinc-700">📱 Aplicativos</span>
          <span className="ml-2 text-xs text-zinc-400">
            {aplicativos.length} registro{aplicativos.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setModalApp("novo")}
          className="h-8 rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 transition-all"
        >
          + Adicionar
        </button>
      </div>

      {aplicativos.length === 0 ? (
        <div className="px-4 py-10 text-center text-zinc-400 text-sm">
          Nenhum aplicativo vinculado
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-100">
              <tr>
                {["App", "Status", "Validade", "MAC / Modelo", "Playlists", "Obs.", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {aplicativos.map((a) => {
                const playlists = playlistsAoVivo[a.id_app_registro] ?? a.playlists;
                const hasPlaylists = playlists?.length > 0;
                const isExpanded = expandedIds.has(a.id_app_registro);
                const plStats = (playlists ?? []).reduce(
                  (acc, pl) => {
                    const s = playlistStatus(pl, a.tipo_painel, a.venc_contrato);
                    acc[s]++;
                    return acc;
                  },
                  { vinculada: 0, expirada: 0, nao_reconhecida: 0 }
                );

                return (
                  <>
                    <tr key={a.id_app_registro} className="hover:bg-zinc-50/50 transition-colors">
                      {/* App */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 flex items-center gap-1.5">
                          {a.nome_app ?? (a.id_app ? `App #${a.id_app}` : "App sem tipo")}
                          {atualizadoAoVivo.has(a.id_app_registro) && (
                            <span
                              title="Playlist atualizada agora via API"
                              className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"
                            />
                          )}
                        </div>
                        {a.exige_licenca && (
                          <div className="text-xs text-amber-600 mt-0.5">🔑 Exige licença</div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${statusBadge(a.status)}`}>
                          {a.status ?? "—"}
                        </span>
                      </td>

                      {/* Validade */}
                      <td className="px-4 py-3">
                        <span className={isVencido(a.validade) ? "text-red-600 font-medium" : "text-zinc-700"}>
                          {formatDate(a.validade)}
                          {isVencido(a.validade) && <span className="ml-1 text-xs">⚠️</span>}
                        </span>
                      </td>

                      {/* MAC + Modelo */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-zinc-600 block">{a.mac ?? "—"}</span>
                        {a.modelo && (
                          <span className="text-[10px] text-zinc-400 mt-0.5 block">{a.modelo}</span>
                        )}
                      </td>

                      {/* Resumo playlists */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {hasPlaylists ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(a.id_app_registro)}
                              className="flex items-center gap-1.5 text-xs hover:text-zinc-900 transition-colors"
                            >
                              <span className="text-zinc-400">{isExpanded ? "▲" : "▼"}</span>
                              <span className="flex gap-1">
                                {plStats.vinculada > 0 && (
                                  <span className="text-emerald-600">{plStats.vinculada}✓</span>
                                )}
                                {plStats.nao_reconhecida > 0 && (
                                  <span className="text-amber-600">{plStats.nao_reconhecida}◌</span>
                                )}
                                {plStats.expirada > 0 && (
                                  <span className="text-red-600">{plStats.expirada}⊗</span>
                                )}
                              </span>
                            </button>
                          ) : (
                            <span className="text-zinc-300 text-xs">—</span>
                          )}
                          {a.id_painel_servidor && a.chave && (
                            <button
                              type="button"
                              onClick={() => setCriandoPlaylist({ idAppRegistro: a.id_app_registro, tipoPainel: a.tipo_painel })}
                              title="Adicionar playlist"
                              className="text-zinc-400 hover:text-emerald-600 transition-colors"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Observação */}
                      <td className="px-4 py-3 max-w-[140px]">
                        <span className="text-xs text-zinc-500 truncate block" title={a.observacao ?? ""}>
                          {a.observacao || "—"}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setModalApp(a)}
                            className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setAppPgto(a)}
                            className="h-8 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                          >
                            ⚙️ Gerenciar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(a.id_app_registro)}
                            disabled={isPending && deletingId === a.id_app_registro}
                            className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && hasPlaylists && (
                      <PlaylistsRow
                        playlists={playlists}
                        idAppRegistro={a.id_app_registro}
                        tipoPainel={a.tipo_painel}
                        vencContrato={a.venc_contrato}
                        onEditarPlaylist={(pl) => setEditandoPlaylist({ idAppRegistro: a.id_app_registro, pl, tipoPainel: a.tipo_painel })}
                        onPlaylistExcluida={(pl) => handlePlaylistExcluida(a.id_app_registro, pl)}
                      />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalApp !== null && (
        <AplicativoModal
          idCliente={idCliente}
          aplicativo={modalApp === "novo" ? null : modalApp}
          apps={apps}
          onClose={() => setModalApp(null)}
          onSaved={() => {
            router.refresh();
            setModalApp(null);
          }}
        />
      )}

      {appPgto !== null && (
        <ModalRenovarAplicativo
          id_app_registro={appPgto.id_app_registro}
          id_cliente={Number(idCliente)}
          nome_app={appPgto.nome_app ?? `App #${appPgto.id_app}`}
          validadeAtual={appPgto.validade ?? null}
          statusAtual={appPgto.status ?? null}
          onClose={() => {
            setAppPgto(null);
            router.refresh();
          }}
        />
      )}

      {editandoPlaylist && (
        <EditarPlaylistModal
          idAppRegistro={editandoPlaylist.idAppRegistro}
          playlist={editandoPlaylist.pl}
          tipoPainel={editandoPlaylist.tipoPainel}
          nomeCliente={nomeCliente}
          onClose={() => setEditandoPlaylist(null)}
          onSaved={() => {
            recarregarPlaylistsAoVivo(editandoPlaylist.idAppRegistro);
            setEditandoPlaylist(null);
          }}
        />
      )}

      {criandoPlaylist && (
        <AdicionarPlaylistModal
          idAppRegistro={criandoPlaylist.idAppRegistro}
          tipoPainel={criandoPlaylist.tipoPainel}
          onClose={() => setCriandoPlaylist(null)}
          onSaved={() => {
            router.refresh();
            setCriandoPlaylist(null);
          }}
        />
      )}
    </div>
  );
}
