"use client";

import { useState } from "react";
import type { AuditLogRow } from "@/lib/audit";

const TIPO_CONFIG: Record<string, { label: string; classes: string }> = {
  troca_pacote:   { label: "Troca de pacote",   classes: "bg-blue-50 text-blue-700" },
  troca_plano:    { label: "Troca de plano",     classes: "bg-purple-50 text-purple-700" },
  cancelamento:   { label: "Cancelamento",       classes: "bg-red-50 text-red-700" },
  edicao_cadastro:{ label: "Edição de cadastro", classes: "bg-zinc-100 text-zinc-600" },
  alteracao_app:  { label: "Alteração de app",   classes: "bg-amber-50 text-amber-700" },
};

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function DetalheJSON({ antes, depois }: {
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}) {
  if (!antes && !depois) return null;

  const campos = new Set([
    ...Object.keys(antes ?? {}),
    ...Object.keys(depois ?? {}),
  ]);

  return (
    <table className="mt-1 text-xs w-full">
      <thead>
        <tr className="text-zinc-500">
          <th className="text-left font-normal pr-3">Campo</th>
          <th className="text-left font-normal pr-3">Antes</th>
          <th className="text-left font-normal">Depois</th>
        </tr>
      </thead>
      <tbody>
        {[...campos].map((campo) => (
          <tr key={campo}>
            <td className="pr-3 text-zinc-500">{campo}</td>
            <td className="pr-3 text-red-700 line-through">
              {String(antes?.[campo] ?? "—")}
            </td>
            <td className="text-emerald-700">
              {String(depois?.[campo] ?? "—")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinhaAudit({ entry }: { entry: AuditLogRow }) {
  const [aberto, setAberto] = useState(false);
  const cfg = TIPO_CONFIG[entry.tipo] ?? { label: entry.tipo, classes: "bg-zinc-100 text-zinc-600" };
  const temDetalhes = entry.dados_antes || entry.dados_depois;

  return (
    <>
      <tr
        className={`hover:bg-zinc-50 ${temDetalhes ? "cursor-pointer" : ""}`}
        onClick={() => temDetalhes && setAberto((v) => !v)}
      >
        <td className="px-3 py-2 text-zinc-700 whitespace-nowrap">
          {formatarDataHora(entry.criado_em)}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cfg.classes}`}>
            {cfg.label}
          </span>
        </td>
        <td className="px-3 py-2 text-zinc-600">
          {entry.descricao ?? "—"}
          {entry.id_assinatura && (
            <span className="ml-1 text-zinc-400">· ass. {entry.id_assinatura}</span>
          )}
        </td>
        <td className="px-3 py-2 text-zinc-400 text-right">
          {temDetalhes && (
            <span>{aberto ? "▲" : "▼"}</span>
          )}
        </td>
      </tr>
      {aberto && temDetalhes && (
        <tr className="bg-zinc-50">
          <td colSpan={4} className="px-4 pb-2 pt-1">
            <DetalheJSON antes={entry.dados_antes} depois={entry.dados_depois} />
          </td>
        </tr>
      )}
    </>
  );
}

type Props = { entradas: AuditLogRow[] };

export default function HistoricoAudit({ entradas }: Props) {
  const [mostrarTodos, setMostrarTodos] = useState(false);

  if (entradas.length === 0) return null;

  const visiveis = mostrarTodos ? entradas : entradas.slice(0, 5);

  return (
    <div className="border-t">
      <div className="px-3 py-2 border-b bg-zinc-50 text-xs font-medium text-zinc-700">
        Histórico de alterações
        <span className="font-normal text-zinc-500 ml-1">
          ({entradas.length} registro{entradas.length !== 1 ? "s" : ""})
        </span>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="text-zinc-600 bg-zinc-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Data</th>
              <th className="px-3 py-2 text-left font-medium">Evento</th>
              <th className="px-3 py-2 text-left font-medium">Descrição</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visiveis.map((e) => (
              <LinhaAudit key={e.id} entry={e} />
            ))}
          </tbody>
        </table>
      </div>

      {entradas.length > 5 && (
        <div className="px-3 py-2 border-t bg-zinc-50 flex justify-center">
          <button
            onClick={() => setMostrarTodos((v) => !v)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            {mostrarTodos
              ? "← Ver menos"
              : `Ver todos os ${entradas.length} registros →`}
          </button>
        </div>
      )}
    </div>
  );
}
