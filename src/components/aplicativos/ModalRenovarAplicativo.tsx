"use client";

import { useState } from "react";
import { renovarAplicativo } from "@/app/actions/renovarAplicativo";
import { Select } from "@/components/ui/select";
import { appRenovaPelaApi, unidadeRenovacaoApi } from "@/lib/apps-painel-ids";

interface Props {
  id_app_registro: number;
  id_cliente: number;
  nome_app: string;
  nomeCliente: string;
  id_app: number | null;
  temMac: boolean;
  validadeAtual: string | null; // ISO date string
  statusAtual: string | null;
  onClose: () => void;
}

const FORMAS = ["INTER", "Nubank", "Nu PJ", "Lotérica", "Dinheiro", "Sicredi", "Caixa", "Banrisul", "Outro"];

function hojeStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcNovaValidade(validadeAtual: string | null): string {
  const base = new Date((validadeAtual ?? hojeStr()) + "T00:00:00");
  const hoje = new Date(hojeStr() + "T00:00:00");
  const ref = base < hoje ? hoje : base;
  ref.setFullYear(ref.getFullYear() + 1);
  return toLocalDateStr(ref);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.split("T")[0].split("-").reverse().join("/");
}

type Modo = "cortesia" | "pagamento" | "pendente";

type ResultadoApi = { ok: true; validade: string | null; jaAtivado: boolean } | { ok: false; erro: string };

// Mesma rota do "Renovar no painel" do /alertas: roda em segundo plano, a gente acompanha pelo jobId.
// A rota já grava a validade devolvida pelo painel, status 'ativa' e o audit_log.
async function renovarPelaApi(id_app_registro: number): Promise<ResultadoApi> {
  try {
    const res = await fetch(`/api/aplicativos/${id_app_registro}/ativar-painel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.jobId) return { ok: false, erro: data.erro ?? "Não deu pra iniciar a renovação pela API." };
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const job = await fetch(`/api/aplicativos/${id_app_registro}/ativar-painel?jobId=${encodeURIComponent(data.jobId)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (!job?.done) continue;
      return job.ok ? { ok: true, validade: job.validade ?? null, jaAtivado: !!job.jaAtivado } : { ok: false, erro: job.erro ?? "Não deu pra renovar pela API." };
    }
    return { ok: false, erro: "O painel demorou para responder. Confira o aparelho no painel antes de tentar de novo." };
  } catch {
    return { ok: false, erro: "Sem internet ou o sistema está atualizando. Tente de novo." };
  }
}

export default function ModalRenovarAplicativo({
  id_app_registro,
  id_cliente,
  nome_app,
  nomeCliente,
  id_app,
  temMac,
  validadeAtual,
  statusAtual,
  onClose,
}: Props) {
  const isPendente = (statusAtual ?? "").toLowerCase() === "pendente";
  const temApi = appRenovaPelaApi(id_app) && temMac;
  const unidade = unidadeRenovacaoApi(id_app);
  const [modo, setModo] = useState<Modo>("pagamento");
  const [novaValidade, setNovaValidade] = useState(() =>
    isPendente ? (validadeAtual?.split("T")[0] ?? "") : calcNovaValidade(validadeAtual)
  );
  const [forma, setForma] = useState("INTER");
  const [valor, setValor] = useState("20");
  const [viaApi, setViaApi] = useState(temApi);
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const inputClass =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all";

  // Pendente não mexe na validade, então não renova no painel.
  const usarApi = viaApi && temApi && modo !== "pendente";

  async function handleConfirmar() {
    if (modo === "pagamento" && !valor.trim()) {
      setErro("Informe o valor do pagamento.");
      return;
    }
    setLoading(true);
    setErro("");
    setAviso("");

    let validadeFinal = novaValidade;
    if (usarApi) {
      setEtapa("Renovando no painel…");
      const r = await renovarPelaApi(id_app_registro);
      if (!r.ok) {
        setLoading(false);
        setEtapa("");
        setErro(`${r.erro} Nada foi registrado.`);
        return;
      }
      if (r.validade) {
        validadeFinal = r.validade.slice(0, 10);
        setNovaValidade(validadeFinal);
      }
      if (r.jaAtivado) {
        // Painel já estava renovado (renovação anterior, aba antiga): não gastou nada. Para antes de lançar
        // pagamento, pra não registrar em dobro — o Jonas decide e confirma de novo, já sem a API.
        setViaApi(false);
        setLoading(false);
        setEtapa("");
        setAviso(`O painel já mostrava o app renovado${r.validade ? ` até ${formatDate(r.validade)}` : ""}. Nenhum ${unidade} foi gasto. Se ainda quiser registrar ${modo === "pagamento" ? "o pagamento" : "a cortesia"}, confira e clique em Confirmar de novo.`);
        return;
      }
    }

    setEtapa("Salvando…");
    const res = await renovarAplicativo({
      id_app_registro,
      id_cliente,
      novaValidade: validadeFinal,
      modo,
      valor: modo === "pagamento" ? parseFloat(valor) || 0 : 0,
      forma,
    });

    setLoading(false);
    setEtapa("");

    if (res.success) {
      onClose();
    } else if (usarApi) {
      // A API já renovou e gravou a validade; só o lançamento falhou. Desmarca pra não gastar de novo.
      setViaApi(false);
      setErro(`Renovado no painel até ${formatDate(validadeFinal)}, mas não deu pra registrar ${modo === "pagamento" ? "o pagamento" : "a cortesia"}: ${res.error ?? "erro ao salvar"}. Confirme de novo (sem a API).`);
    } else {
      setErro(res.error ?? "Erro ao salvar.");
    }
  }

  const modoConfig: Record<Modo, { label: string; cor: string; corAtivo: string }> = {
    cortesia:  { label: "🎁 Cortesia",  cor: "border-zinc-200 text-zinc-600 hover:border-zinc-400",            corAtivo: "bg-zinc-900 border-zinc-900 text-white" },
    pagamento: { label: "💳 Pagamento", cor: "border-zinc-200 text-zinc-600 hover:border-zinc-400",            corAtivo: "bg-emerald-600 border-emerald-600 text-white" },
    pendente:  { label: "⏳ Pendente",  cor: "border-zinc-200 text-zinc-600 hover:border-zinc-400",            corAtivo: "bg-amber-500 border-amber-500 text-white" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-base font-semibold text-zinc-900">Gerenciar aplicativo</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{nome_app}</p>
          {validadeAtual && (
            <p className="text-xs text-zinc-400 mt-1">
              Validade atual: <span className="font-medium text-zinc-600">{formatDate(validadeAtual)}</span>
            </p>
          )}
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* Nova validade */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Nova validade</label>
            <input
              type="date"
              value={novaValidade}
              onChange={(e) => setNovaValidade(e.target.value)}
              disabled={usarApi}
              className={`${inputClass} disabled:bg-zinc-50 disabled:text-zinc-400`}
            />
            {usarApi && (
              <p className="text-[11px] text-zinc-400 mt-1">Vale a validade que o painel devolver.</p>
            )}
          </div>

          {/* Renovar via API do app */}
          {temApi && modo !== "pendente" && (
            <label className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={viaApi}
                onChange={(e) => setViaApi(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <span className="text-xs text-violet-800">
                <b>Renovar via API</b> — renova 1 ano no painel do {nome_app} e <b>gasta 1 {unidade}</b>.
                {viaApi && <span className="block text-violet-600 mt-0.5">Aparelho de {nomeCliente}.</span>}
              </span>
            </label>
          )}

          {/* Seleção de modo */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Tipo de renovação</label>
            <div className="grid grid-cols-3 gap-2">
              {(["cortesia", "pagamento", "pendente"] as Modo[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-colors ${
                    modo === m ? modoConfig[m].corAtivo : modoConfig[m].cor
                  }`}
                >
                  {modoConfig[m].label}
                </button>
              ))}
            </div>
          </div>

          {/* Campos de pagamento */}
          {modo === "pagamento" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Forma</label>
                <Select
                  value={forma}
                  onChange={setForma}
                  className={inputClass}
                  options={FORMAS.map((f) => ({ value: f, label: f }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Valor (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className={inputClass}
                  placeholder="0,00"
                />
              </div>
            </div>
          )}

          {/* Aviso pendente */}
          {modo === "pendente" && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              A <b>data de vencimento não será alterada</b>. Nenhum pagamento será registrado. O app ficará como <b>pendente</b> aguardando pagamento ou cortesia.
            </div>
          )}

          {/* Aviso cortesia */}
          {modo === "cortesia" && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-600">
              Somente a validade será atualizada. Nenhum pagamento registrado.
            </div>
          )}

          {aviso && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{aviso}</p>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>
          )}
        </div>

        {/* Ações */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 rounded-xl border border-zinc-300 text-sm hover:bg-zinc-50 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={loading}
            className={`flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition ${
              modo === "pendente"
                ? "bg-amber-500 hover:bg-amber-600"
                : modo === "cortesia"
                ? "bg-zinc-900 hover:bg-zinc-800"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {loading ? etapa || "Salvando..." : usarApi ? `Confirmar (gasta 1 ${unidade})` : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}