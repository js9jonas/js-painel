// src/components/aplicativos/AplicativoModal.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createAplicativo, updateAplicativo, type AplicativoData } from "@/app/actions/aplicativos";
import { Select } from "@/components/ui/select";
import type { AplicativoRow, AppRow } from "@/lib/aplicativos";
import { ID_APP_SMARTONE, appTemCadastroComLista } from "@/lib/apps-painel-ids";
import { criarContaTeste, opcoesTesteCliente, type OpcoesTesteCliente, type ResultadoCriarTeste } from "@/app/actions/contasVinculo";
import { ASSINATURA_PADRAO } from "@/lib/paineis-teste";

type ContaOpcao = { id_conta: string; usuario: string; rotulo: string | null; nome_painel: string; status_conta: string; host_stream: string | null };

type Props = {
  idCliente: string;
  aplicativo?: AplicativoRow | null;
  apps: AppRow[];
  /** Valores iniciais pra cadastro novo (ex.: lidos de uma imagem no /chat); ignorado na edição */
  inicial?: { id_app?: string; mac?: string; chave?: string; validade?: string };
  onClose: () => void;
  onSaved: () => void;
};

const STATUS_OPTIONS = ["ativa", "inativa", "neutra"];

function toDateInput(v: string | null): string {
  if (!v) return "";
  return v.split("T")[0];
}

const APPS_PRINCIPAIS = 4;
const MAIS_APPS = "__mais_apps__";

export default function AplicativoModal({ idCliente, aplicativo, apps, inicial, onClose, onSaved }: Props) {
  const isEdit = !!aplicativo;

  const base = aplicativo ? null : inicial;
  const [idApp, setIdApp] = useState(String(aplicativo?.id_app ?? base?.id_app ?? ""));
  const [mac, setMac] = useState(aplicativo?.mac ?? base?.mac ?? "");
  const [chave, setChave] = useState(aplicativo?.chave ?? base?.chave ?? "");
  const [validade, setValidade] = useState(toDateInput(aplicativo?.validade ?? base?.validade ?? null));
  const [status, setStatus] = useState(aplicativo?.status ?? "ativa");
  const [observacao, setObservacao] = useState(aplicativo?.observacao ?? "");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const appSelecionado = apps.find((a) => a.id_app === idApp) ?? null;
  // Lista do cadastro (13/10/2026): os 4 mais usados primeiro + "Mais aplicativos…" abre o resto.
  // O app já escolhido (edição) sempre aparece.
  const [todosApps, setTodosApps] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const appsOrdenados = [...apps].sort((a, b) => (b.uso ?? 0) - (a.uso ?? 0) || a.nome_app.localeCompare(b.nome_app));
  const appsDaLista = todosApps
    ? appsOrdenados
    : appsOrdenados.filter((a, i) => i < APPS_PRINCIPAIS || a.id_app === idApp);

  // Fun Play / Lazer Play / Core Player: cadastro direto no painel (add existing + lista, sem gastar
  // crédito). A ativação fica pra quando o cliente assinar — /alertas mostra "Precisa ativar".
  // SmartOne: sem chave; o aparelho só entra no painel junto com a lista (obrigatória).
  const podePainel = !isEdit && appTemCadastroComLista(idApp);
  const smartOne = Number(idApp) === ID_APP_SMARTONE;
  const [peloPainel, setPeloPainel] = useState(true);
  const usarPainel = podePainel && peloPainel;
  const [contas, setContas] = useState<ContaOpcao[] | null>(null);
  const [idConta, setIdConta] = useState("");
  const [etapa, setEtapa] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const criouAlgo = useRef(false);

  function carregarContas(selecionar?: string) {
    return fetch(`/api/clientes/${idCliente}/contas`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: ContaOpcao[]) => {
        const comLista = Array.isArray(lista) ? lista.filter((c) => !!c.host_stream) : [];
        setContas(comLista);
        if (selecionar && comLista.some((c) => c.id_conta === selecionar)) setIdConta(selecionar);
        else if (comLista.length === 1) setIdConta(comLista[0].id_conta);
      })
      .catch(() => setContas([]));
  }

  useEffect(() => {
    if (!usarPainel || contas !== null) return;
    void carregarContas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usarPainel, contas, idCliente]);

  // Cliente sem conta com lista: criar um teste aqui mesmo (e a assinatura padrão, se faltar)
  const semConta = usarPainel && contas !== null && contas.length === 0;
  const [opcoesTeste, setOpcoesTeste] = useState<OpcoesTesteCliente | null>(null);
  const [idPainelTeste, setIdPainelTeste] = useState("");
  const [descricaoTeste, setDescricaoTeste] = useState("Teste");
  const [criandoTeste, setCriandoTeste] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<ResultadoCriarTeste | null>(null);

  useEffect(() => {
    if (!semConta || opcoesTeste !== null) return;
    opcoesTesteCliente(idCliente)
      .then((o) => {
        setOpcoesTeste(o);
        if (o.paineis.length === 1) setIdPainelTeste(String(o.paineis[0].id));
      })
      .catch(() => setOpcoesTeste({ paineis: [], assinatura: null }));
  }, [semConta, opcoesTeste, idCliente]);

  async function criarTeste() {
    if (!idPainelTeste || !descricaoTeste.trim() || criandoTeste) return;
    setResultadoTeste(null);
    setCriandoTeste(true);
    try {
      const res = await criarContaTeste(
        Number(idPainelTeste), idCliente, opcoesTeste?.assinatura?.id_assinatura ?? null, descricaoTeste.trim()
      );
      setResultadoTeste(res);
      if (res.ok) {
        criouAlgo.current = true;
        await carregarContas(res.id_conta);
      }
    } catch {
      setResultadoTeste({ ok: false, erro: "Sem internet ou o sistema está atualizando. Confira no painel antes de tentar de novo." });
    } finally {
      setCriandoTeste(false);
    }
  }

  async function cadastrarNoPainel() {
    setError(null);
    setAviso(null);
    if (!mac.trim() || (!smartOne && !chave.trim())) {
      setError(smartOne ? "Informe o MAC que aparece na TV." : "Informe o MAC e a chave (Device Key) que aparecem na TV.");
      return;
    }
    if (smartOne && !idConta) {
      setError("No SmartOne o aparelho só entra com uma lista. Escolha a conta ou crie um teste.");
      return;
    }
    setEnviando(true);
    setEtapa("Iniciando…");
    try {
      const res = await fetch("/api/aplicativos/cadastrar-painel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cliente: idCliente, id_app: idApp, mac, chave, id_conta: idConta || null, observacao: observacao || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.jobId) throw new Error(data.erro ?? "Não deu pra iniciar o cadastro.");
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await fetch(`/api/aplicativos/cadastrar-painel?jobId=${encodeURIComponent(data.jobId)}`)
          .then((r) => r.json())
          .catch(() => null);
        if (!job) continue;
        if (!job.done) {
          if (job.etapa) setEtapa(job.etapa);
          continue;
        }
        if (!job.ok) throw new Error(job.erro ?? "Não deu pra cadastrar no painel.");
        if (job.aviso) {
          // Mostra o aviso antes de fechar; a tela atualiza ao fechar (fecharModal → onSaved).
          setEtapa(null);
          setAviso(job.aviso);
          return;
        }
        onSaved();
        onClose();
        return;
      }
      throw new Error("O painel demorou para responder. Confira o aparelho no painel antes de tentar de novo.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
      setEtapa(null);
    } finally {
      setEnviando(false);
    }
  }

  // Depois de um cadastro com aviso, fechar também atualiza a tela do cliente.
  function fecharModal() {
    if (enviando || criandoTeste) return;
    if (aviso || criouAlgo.current) onSaved();
    onClose();
  }

  function handleSave() {
    if (usarPainel) {
      void cadastrarNoPainel();
      return;
    }
    setError(null);
    if (!idApp) {
      setError("Selecione o aplicativo antes de salvar.");
      return;
    }
    const data: AplicativoData = {
      id_cliente: idCliente,
      id_app: idApp || null,
      mac: mac || null,
      chave: chave || null,
      validade: validade || null,
      status,
      observacao: observacao || null,
    };

    startTransition(async () => {
      try {
        if (isEdit && aplicativo) {
          await updateAplicativo(aplicativo.id_app_registro, idCliente, data);
        } else {
          await createAplicativo(idCliente, data);
        }
        onSaved();
        onClose();
      } catch (err: any) {
        setError(err?.message ?? "Erro ao salvar. Tente novamente.");
      }
    });
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all";
  const selectClass =
    "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all bg-white";
  const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={fecharModal} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">
            {isEdit ? "Editar Aplicativo" : "Novo Aplicativo"}
          </h2>
          {isEdit && (
            <p className="text-sm text-zinc-500 mt-0.5">
              Registro #{aplicativo!.id_app_registro}
            </p>
          )}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* App */}
          <div>
            <label className={labelClass}>Aplicativo</label>
            <Select
              value={idApp}
              onChange={(v) => {
                if (v === MAIS_APPS) {
                  // Abre de novo, agora com todos (o Radix fecha ao escolher)
                  setTodosApps(true);
                  setTimeout(() => setListaAberta(true), 0);
                  return;
                }
                setIdApp(v);
              }}
              open={listaAberta}
              onOpenChange={setListaAberta}
              className={selectClass}
              options={[
                { value: "", label: "— Selecione —" },
                ...appsDaLista.map((a) => ({
                  value: a.id_app,
                  label: `${a.nome_app}${a.exige_licenca ? " 🔑" : ""}`,
                })),
                ...(!todosApps && appsOrdenados.length > appsDaLista.length
                  ? [{ value: MAIS_APPS, label: <span className="text-blue-600">Mais aplicativos…</span> }]
                  : []),
              ]}
            />
            {appSelecionado?.url_referencia && (
              <a
                href={appSelecionado.url_referencia}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 text-xs text-blue-600 hover:underline inline-block"
              >
                🔗 {appSelecionado.url_referencia}
              </a>
            )}
            {appSelecionado?.observacao && (
              <p className="mt-1 text-xs text-zinc-500">{appSelecionado.observacao}</p>
            )}
          </div>

          {podePainel && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-3">
              <label className="flex items-start gap-2 text-sm text-violet-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={peloPainel}
                  onChange={(e) => setPeloPainel(e.target.checked)}
                  disabled={enviando}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Cadastrar no painel do app</span>
                  <span className="block text-xs text-violet-700">
                    {smartOne
                      ? <>Manda a lista para o MAC pelo painel do SmartOne, sem gastar giftcode. Fica &quot;Pending&quot; até o cliente recarregar a lista na TV.</>
                      : <>Adiciona o aparelho ao painel com o MAC e a chave, sem gastar crédito. A ativação fica para quando o cliente assinar: o aparelho aparece em Alertas como &quot;Precisa ativar&quot;.</>}
                  </span>
                </span>
              </label>
              {peloPainel && (
                <div>
                  <label className={labelClass}>Lista no aparelho</label>
                  {contas === null ? (
                    <p className="text-xs text-zinc-500">Carregando contas do cliente…</p>
                  ) : semConta ? (
                    <div className="rounded-lg border border-violet-200 bg-white p-3 space-y-2">
                      <p className="text-xs text-zinc-600">Cliente sem conta com lista. Crie um teste para já mandar a lista para o aparelho.</p>
                      {opcoesTeste === null ? (
                        <p className="text-xs text-zinc-500">Carregando servidores…</p>
                      ) : opcoesTeste.paineis.length === 0 ? (
                        <p className="text-xs text-zinc-500">Nenhum servidor ativo gera teste pelo sistema.</p>
                      ) : (
                        <>
                          <Select
                            value={idPainelTeste}
                            onChange={setIdPainelTeste}
                            className={selectClass}
                            options={[
                              { value: "", label: "— Servidor do teste —" },
                              ...opcoesTeste.paineis.map((p) => ({ value: String(p.id), label: p.nome })),
                            ]}
                          />
                          <input
                            value={descricaoTeste}
                            onChange={(e) => setDescricaoTeste(e.target.value)}
                            className={inputClass}
                            placeholder="Descrição (ex: teste solicitado)"
                          />
                          <p className="text-xs text-zinc-500">
                            {opcoesTeste.assinatura
                              ? <>Vai para a assinatura {opcoesTeste.assinatura.descricao}.</>
                              : <>Cliente sem assinatura: cria junto uma assinatura <span className="font-semibold">{ASSINATURA_PADRAO.descricao}</span> (ativa, vencimento hoje).</>}
                          </p>
                          <button
                            type="button"
                            onClick={() => void criarTeste()}
                            disabled={criandoTeste || enviando || !idPainelTeste || !descricaoTeste.trim()}
                            className="w-full h-9 rounded-xl bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
                          >
                            {criandoTeste ? "Criando teste…" : "Criar teste"}
                          </button>
                        </>
                      )}
                      {resultadoTeste && !resultadoTeste.ok && (
                        <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{resultadoTeste.erro}</p>
                      )}
                    </div>
                  ) : (
                    <Select
                      value={idConta}
                      onChange={setIdConta}
                      className={selectClass}
                      options={[
                        { value: "", label: smartOne ? "— Escolha a conta —" : "— Não criar lista —" },
                        ...contas.map((c) => ({
                          value: c.id_conta,
                          label: `${c.nome_painel} — ${c.rotulo?.trim() || c.usuario}${c.status_conta !== "ok" ? ` (${c.status_conta})` : ""}`,
                        })),
                      ]}
                    />
                  )}
                  {resultadoTeste?.ok && (
                    <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">
                      Teste criado: <span className="font-mono font-semibold">{resultadoTeste.usuario}</span>
                      {resultadoTeste.senha && <> / <span className="font-mono font-semibold">{resultadoTeste.senha}</span></>}
                      {resultadoTeste.expiracao && (
                        <> · vence {resultadoTeste.expiracao.split("-").reverse().join("/")}
                          {resultadoTeste.expiracaoHorario && ` às ${resultadoTeste.expiracaoHorario}`}</>
                      )}
                      . Já selecionado acima.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status e Validade */}
          {!usarPainel && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Status</label>
              <Select
                value={status}
                onChange={setStatus}
                className={selectClass}
                options={STATUS_OPTIONS.map((s) => ({
                  value: s,
                  label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
              />
            </div>
            <div>
              <label className={labelClass}>Validade</label>
              <input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          )}

          {/* MAC e Chave */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>MAC Address</label>
              <input
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                className={inputClass}
                placeholder="Ex: 00:1A:2B:3C:4D:5E"
              />
            </div>
            <div>
              <label className={labelClass}>
                Chave / Licença
                {appSelecionado?.exige_licenca && !(usarPainel && smartOne) && (
                  <span className="ml-1 text-amber-600 font-normal">🔑 obrigatória</span>
                )}
              </label>
              <input
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                className={inputClass}
                placeholder="Chave de ativação..."
              />
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className={labelClass}>Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none"
              placeholder="Observações sobre este aplicativo..."
            />
          </div>

        </div>

        {error && (
          <p className="mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        {etapa && (
          <p className="mx-6 text-sm text-violet-700 bg-violet-50 rounded-lg px-3 py-2">{etapa}</p>
        )}
        {aviso && (
          <p className="mx-6 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Cadastrado. {aviso}</p>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={fecharModal}
            disabled={isPending || enviando || criandoTeste}
            className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 transition-all disabled:opacity-50"
          >
            {aviso ? "Fechar" : "Cancelar"}
          </button>
          {!aviso && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || enviando}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {enviando ? "Cadastrando no painel..." : isPending ? "Salvando..." : isEdit ? "Salvar alterações" : usarPainel ? "Cadastrar no painel" : "Adicionar"}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}