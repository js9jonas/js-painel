"use client";
import type { PainelAppRow } from "@/lib/paineis";

const TIPO_BADGE: Record<string, string> = {
  funplays:  "bg-green-100 text-green-700",
  lazerplay: "bg-yellow-100 text-yellow-700",
  smartone:  "bg-sky-100 text-sky-700",
};

type Props = { app: PainelAppRow; onEditar: () => void };

export default function PainelAppCard({ app, onEditar }: Props) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900 text-base">{app.nome}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_BADGE[app.tipo] ?? "bg-zinc-100 text-zinc-600"}`}>
              {app.tipo.toUpperCase()}
            </span>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
          app.modo_acesso === "coletivo"
            ? "bg-blue-50 text-blue-600"
            : "bg-violet-50 text-violet-600"
        }`}>
          {app.modo_acesso === "coletivo" ? "Coletivo" : "Individual"}
        </span>
      </div>

      {/* Master */}
      {app.master && (
        <div className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">Master:</span> {app.master}
          {app.contato_master && (
            <span className="ml-1 text-zinc-400">· {app.contato_master}</span>
          )}
        </div>
      )}

      {/* Descrição do modo */}
      <p className="text-xs text-zinc-400">
        {app.modo_acesso === "coletivo"
          ? "Todos os MACs gerenciados em uma página centralizada."
          : "Cada MAC/senha é acessado individualmente para gerenciar listas."}
      </p>

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onEditar}
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Editar
        </button>
        {app.url_painel && (
          <a
            href={app.url_painel}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}
