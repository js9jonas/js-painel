"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAplicativo } from "@/app/actions/aplicativos";
import AplicativoModal from "./AplicativoModal";
import ModalRenovarAplicativo from "./ModalRenovarAplicativo";
import type { AplicativoRow, AppRow, PlaylistRow } from "@/lib/aplicativos";

type Props = {
  idCliente: string;
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

function isVencido(validade: string | null) {
  if (!validade) return false;
  return new Date(validade) < new Date();
}

function playlistStatus(pl: PlaylistRow): "vinculada" | "expirada" | "nao_reconhecida" {
  if (pl.id_conta) {
    // Quando vinculada a uma conta, usa a validade real do painel — não o expired_date do FunPlays
    const venc = pl.venc_real_conta;
    if (venc && new Date(venc) < new Date()) return "expirada";
    return "vinculada";
  }
  if (pl.expired_date && new Date(pl.expired_date) < new Date()) return "expirada";
  return "nao_reconhecida";
}

function PlaylistBadge({ pl }: { pl: PlaylistRow }) {
  const status = playlistStatus(pl);
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

  return (
    <div className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs ${classes}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="font-medium truncate">{pl.nome || `Playlist #${pl.playlist_id_externo}`}</div>
        {pl.usuario_conta && (
          <div className="text-[10px] opacity-75 font-mono">{pl.usuario_conta}</div>
        )}
        {(pl.venc_real_conta ?? pl.expired_date) && (
          <div className="text-[10px] opacity-60">
            venc. {(pl.venc_real_conta ?? pl.expired_date)!.slice(0, 10).split("-").reverse().join("/")}
          </div>
        )}
        {pl.is_selected && (
          <div className="text-[10px] opacity-60">✓ ativa</div>
        )}
      </div>
    </div>
  );
}

function PlaylistsRow({ playlists }: { playlists: PlaylistRow[] }) {
  if (!playlists.length) return null;

  const stats = playlists.reduce(
    (acc, pl) => {
      const s = playlistStatus(pl);
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
            <PlaylistBadge key={pl.id} pl={pl} />
          ))}
        </div>
      </td>
    </tr>
  );
}

export default function AplicativosManager({ idCliente, aplicativos, apps }: Props) {
  const [modalApp, setModalApp] = useState<AplicativoRow | null | "novo">(null);
  const [appPgto, setAppPgto] = useState<AplicativoRow | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const router = useRouter();

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
                const hasPlaylists = a.playlists?.length > 0;
                const isExpanded = expandedIds.has(a.id_app_registro);
                const plStats = (a.playlists ?? []).reduce(
                  (acc, pl) => {
                    const s = playlistStatus(pl);
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
                        <div className="font-medium text-zinc-900">
                          {a.nome_app ?? (a.id_app ? `App #${a.id_app}` : "App sem tipo")}
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
                      <PlaylistsRow playlists={a.playlists} />
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
    </div>
  );
}
