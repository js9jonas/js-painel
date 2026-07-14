"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { buscarContasLivres, vincularContaExistente, criarContaTeste, type ContaLivre, type ResultadoCriarTeste } from "@/app/actions/contasVinculo";

type Painel = { id: number; nome: string; tipo: string };

// Tipos de painel cujo adapter implementa gerarTeste() — ver src/lib/painel-adapters/*.ts
const TIPOS_COM_TESTE = new Set(["club", "central", "uniplay", "now", "unitv", "liebe", "natv", "fast"]);

type Props = {
  idAssinatura: string;
  idCliente: string;
  paineis: Painel[];
  compact?: boolean;
};

export default function AdicionarContaModal({ idAssinatura, idCliente, paineis, compact }: Props) {
  const [aberto, setAberto] = useState(false);
  const [idPainel, setIdPainel] = useState<number | "">(paineis[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ContaLivre[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [descricaoTeste, setDescricaoTeste] = useState("");
  const [criandoTeste, startCriandoTeste] = useTransition();
  const [resultadoTeste, setResultadoTeste] = useState<ResultadoCriarTeste | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResultados([]);
      setMensagem(null);
      setDescricaoTeste("");
      setResultadoTeste(null);
    }
  }, [aberto]);

  // p.id vem do banco como BIGINT (pg retorna como string); idPainel pode ser number após onPainelChange — comparar como string
  const painelSelecionado = paineis.find((p) => String(p.id) === String(idPainel));
  const podeCriarTeste = !!painelSelecionado && TIPOS_COM_TESTE.has(painelSelecionado.tipo);

  function criarTeste() {
    if (!idPainel || !descricaoTeste.trim()) return;
    setResultadoTeste(null);
    startCriandoTeste(async () => {
      const res = await criarContaTeste(Number(idPainel), idCliente, idAssinatura, descricaoTeste.trim());
      setResultadoTeste(res);
    });
  }

  async function buscar(q: string, painel: number | "") {
    if (!painel) return;
    setBuscando(true);
    const res = await buscarContasLivres(Number(painel), q);
    setResultados(res);
    setBuscando(false);
  }

  function onQueryChange(v: string) {
    setQuery(v);
    buscar(v, idPainel);
  }

  function onPainelChange(v: number | "") {
    setIdPainel(v);
    buscar(query, v);
  }

  function vincular(idConta: string) {
    startTransition(async () => {
      const res = await vincularContaExistente(idConta, idAssinatura, idCliente);
      if (res.ok) {
        setMensagem("Conta vinculada com sucesso!");
        // Remove da lista local imediatamente
        setResultados((prev) => prev.filter((c) => c.id_conta !== idConta));
      } else {
        setMensagem(res.erro ?? "Erro ao vincular.");
      }
    });
  }

  function fechar() {
    setAberto(false);
    setQuery("");
    setResultados([]);
    setMensagem(null);
  }

  return (
    <>
      {compact ? (
        <button
          onClick={() => setAberto(true)}
          title="Adicionar conta IPTV"
          className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors text-xs font-bold leading-none"
        >
          +
        </button>
      ) : (
        <button
          onClick={() => setAberto(true)}
          title="Adicionar conta IPTV"
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          + Conta
        </button>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-zinc-900">Adicionar conta IPTV</h2>
              <button onClick={fechar} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
            </div>

            {/* Filtros */}
            <div className="px-5 pt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Painel</label>
                <select
                  value={idPainel}
                  onChange={(e) => onPainelChange(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione um painel…</option>
                  {paineis.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Buscar conta</label>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Usuário, rótulo ou descrição…"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {podeCriarTeste && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                  <label className="block text-xs font-medium text-zinc-600">Criar conta de teste</label>
                  <input
                    type="text"
                    placeholder="Descrição (ex: teste solicitado)"
                    value={descricaoTeste}
                    onChange={(e) => setDescricaoTeste(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={criarTeste}
                    disabled={criandoTeste || !descricaoTeste.trim()}
                    className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {criandoTeste ? "Criando…" : "Criar teste"}
                  </button>

                  {resultadoTeste?.ok && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">
                      Teste criado e vinculado! Usuário: <span className="font-mono font-semibold">{resultadoTeste.usuario}</span>
                      {resultadoTeste.senha && <> / Senha: <span className="font-mono font-semibold">{resultadoTeste.senha}</span></>}
                      {resultadoTeste.expiracao && (
                        <>
                          {" "}/ Vence: <span className="font-mono font-semibold">
                            {resultadoTeste.expiracao.split("-").reverse().join("/")}
                            {resultadoTeste.expiracaoHorario && ` às ${resultadoTeste.expiracaoHorario}`}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  {resultadoTeste && !resultadoTeste.ok && (
                    <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{resultadoTeste.erro}</p>
                  )}
                </div>
              )}
            </div>

            {/* Resultados */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 min-h-0">
              {buscando && (
                <p className="text-xs text-zinc-400 text-center py-4">Buscando…</p>
              )}
              {!buscando && !idPainel && (
                <p className="text-xs text-zinc-400 text-center py-4">Selecione um painel para buscar contas livres.</p>
              )}
              {!buscando && idPainel && resultados.length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">
                  {query ? "Nenhuma conta livre encontrada." : "Digite para buscar ou deixe em branco para ver todas."}
                </p>
              )}
              {resultados.map((c) => {
                const dataFmt = c.vencimento_real_painel
                  ? c.vencimento_real_painel.split("T")[0].split("-").reverse().join("/")
                  : null;
                return (
                  <div
                    key={c.id_conta}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm font-semibold text-zinc-800">{c.usuario}</span>
                      {c.rotulo && (
                        <span className="ml-2 text-xs text-zinc-500">{c.rotulo}</span>
                      )}
                      {c.observacao && c.observacao !== c.rotulo && (
                        <span className="ml-1 text-xs text-zinc-400 italic">{c.observacao}</span>
                      )}
                      {dataFmt && (
                        <span className="ml-2 text-xs text-zinc-400">venc. {dataFmt}</span>
                      )}
                    </div>
                    <button
                      onClick={() => vincular(c.id_conta)}
                      disabled={pending}
                      className="shrink-0 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      Vincular
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Feedback */}
            {mensagem && (
              <div className={`px-5 pb-3 text-xs ${mensagem.includes("sucesso") ? "text-emerald-700" : "text-red-600"}`}>
                {mensagem}
              </div>
            )}

            <div className="px-5 py-3 border-t flex justify-end">
              <button
                onClick={fechar}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
