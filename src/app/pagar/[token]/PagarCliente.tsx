"use client";
import { useEffect, useMemo, useState } from "react";
import type { AssinaturaLink } from "@/lib/pix-link";

type Cobranca = {
  txid: string;
  valor: string;
  pixCopiaECola: string;
  expiraEm: string;
  assinaturas: string[];
  qrSvg: string;
};

/** Consulta "já pagou?" a cada 5 s por até 20 min; depois só volta ao reabrir a aba. */
const INTERVALO_CONSULTA_MS = 5_000;
const TEMPO_MAX_CONSULTA_MS = 20 * 60 * 1000;
/** Pré-seleciona as assinaturas que vencem em até 10 dias (ou já venceram). */
const DIAS_PRE_SELECAO = 10;

function hojeSP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function diasAte(data: string): number {
  const hoje = new Date(hojeSP() + "T00:00:00");
  return Math.round((new Date(data + "T00:00:00").getTime() - hoje.getTime()) / 86_400_000);
}

function dataBR(data: string): string {
  return data.split("-").reverse().join("/");
}

function reais(v: number | string): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textoVencimento(a: AssinaturaLink): string {
  if (!a.venc_contrato) return "";
  const d = diasAte(a.venc_contrato);
  if (d < 0) return `venceu em ${dataBR(a.venc_contrato)}`;
  if (d === 0) return "vence hoje";
  return `vence em ${dataBR(a.venc_contrato)}`;
}

function preSelecao(assinaturas: AssinaturaLink[]): string[] {
  if (assinaturas.length <= 1) return assinaturas.map((a) => a.id_assinatura);
  const proximas = assinaturas.filter((a) => a.venc_contrato && diasAte(a.venc_contrato) <= DIAS_PRE_SELECAO);
  return (proximas.length > 0 ? proximas : assinaturas).map((a) => a.id_assinatura);
}

export default function PagarCliente({
  token,
  primeiroNome,
  assinaturas,
  cobrancaAberta,
}: {
  token: string;
  primeiroNome: string;
  assinaturas: AssinaturaLink[];
  cobrancaAberta: Cobranca | null;
}) {
  const [selecionadas, setSelecionadas] = useState<string[]>(() =>
    cobrancaAberta ? cobrancaAberta.assinaturas : preSelecao(assinaturas)
  );
  const [cobranca, setCobranca] = useState<Cobranca | null>(cobrancaAberta);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pago, setPago] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [consultaParada, setConsultaParada] = useState(false);

  const total = useMemo(
    () => assinaturas.filter((a) => selecionadas.includes(a.id_assinatura)).reduce((s, a) => s + Number(a.valor), 0),
    [assinaturas, selecionadas]
  );

  // Pergunta ao servidor se o Pix já caiu enquanto o QR está na tela.
  useEffect(() => {
    if (!cobranca || pago) return;
    let ativo = true;
    let inicio = Date.now();
    setConsultaParada(false);

    async function consultar() {
      if (!ativo || document.visibilityState !== "visible") return;
      if (Date.now() - inicio > TEMPO_MAX_CONSULTA_MS) {
        setConsultaParada(true);
        return;
      }
      try {
        const res = await fetch(`/api/pagar/${token}/${cobranca!.txid}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (ativo && j?.pago) setPago(true);
      } catch {
        // sem internet: tenta de novo na próxima volta
      }
    }

    const id = setInterval(consultar, INTERVALO_CONSULTA_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") {
        inicio = Date.now();
        setConsultaParada(false);
        consultar();
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [cobranca, pago, token]);

  function alternar(id: string) {
    setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function gerarPix() {
    if (selecionadas.length === 0 || gerando) return;
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/pagar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assinaturas: selecionadas }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.pixCopiaECola) {
        setErro(j?.erro ?? "Não deu certo agora. Tente de novo em alguns minutos.");
        return;
      }
      setCobranca(j as Cobranca);
    } catch {
      setErro("Sem internet no momento. Confira a conexão e tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    if (!cobranca) return;
    try {
      await navigator.clipboard.writeText(cobranca.pixCopiaECola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não deu pra copiar sozinho. Toque e segure no código abaixo para copiar.");
    }
  }

  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";

  if (pago) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-3xl">✅</p>
        <p className="mt-2 text-lg font-semibold text-emerald-900">Pagamento recebido!</p>
        <p className="mt-2 text-sm text-emerald-800">
          Obrigado, {primeiroNome || "tudo certo"}. Você vai receber a confirmação da renovação pelo WhatsApp.
        </p>
      </div>
    );
  }

  if (assinaturas.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border bg-white p-6 text-center">
        <p className="text-lg font-semibold">{saudacao}</p>
        <p className="mt-2 text-sm text-zinc-600">
          Não encontramos assinatura para pagar por aqui. Fale com a gente pelo WhatsApp.
        </p>
      </div>
    );
  }

  if (cobranca) {
    return (
      <div className="mt-4 space-y-4">
        <h1 className="text-xl font-semibold">{saudacao}</h1>
        <div className="rounded-2xl border bg-white p-5 text-center">
          <p className="text-sm text-zinc-600">Valor</p>
          <p className="text-3xl font-bold">{reais(cobranca.valor)}</p>
          <div
            className="mx-auto mt-4 w-56 max-w-full [&>svg]:h-auto [&>svg]:w-full"
            aria-label="QR Code do Pix"
            dangerouslySetInnerHTML={{ __html: cobranca.qrSvg }}
          />
          <p className="mt-3 text-sm text-zinc-600">
            Abra o app do seu banco, escolha <b>Pix → Ler QR Code</b> ou use o código abaixo em <b>Pix Copia e Cola</b>.
          </p>
          <button
            onClick={copiar}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white active:bg-emerald-700"
          >
            {copiado ? "Código copiado ✓" : "Copiar código Pix"}
          </button>
          <p className="mt-3 break-all rounded-lg bg-zinc-50 p-2 text-left font-mono text-[11px] text-zinc-500 select-all">
            {cobranca.pixCopiaECola}
          </p>
          <p className="mt-3 text-xs text-zinc-500">Válido até {cobranca.expiraEm}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 text-center text-sm text-zinc-600">
          {consultaParada ? (
            <>Já pagou? <button className="font-semibold text-emerald-700 underline" onClick={() => location.reload()}>Toque aqui para conferir</button>.</>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Esperando o pagamento… esta tela avisa sozinha quando cair.
            </span>
          )}
        </div>

        {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

        {assinaturas.length > 1 && (
          <button onClick={() => setCobranca(null)} className="w-full text-sm text-zinc-500 underline">
            Escolher outras assinaturas
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <h1 className="text-xl font-semibold">{saudacao}</h1>
      <p className="text-sm text-zinc-600">
        {assinaturas.length > 1 ? "Escolha o que você quer pagar:" : "Confira sua assinatura:"}
      </p>

      <ul className="space-y-2">
        {assinaturas.map((a) => {
          const marcada = selecionadas.includes(a.id_assinatura);
          const venc = textoVencimento(a);
          const vencida = a.venc_contrato ? diasAte(a.venc_contrato) < 0 : false;
          return (
            <li key={a.id_assinatura}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white p-4 ${marcada ? "border-emerald-500 ring-1 ring-emerald-500" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => alternar(a.id_assinatura)}
                  className="h-5 w-5 accent-emerald-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.identificacao || a.plano}</span>
                  <span className="block text-xs text-zinc-500">
                    {a.identificacao ? `${a.plano} · ` : ""}
                    {a.meses > 1 ? `${a.meses} meses · ` : ""}
                    <span className={vencida ? "text-red-600" : ""}>{venc}</span>
                  </span>
                </span>
                <span className="font-semibold">{reais(a.valor)}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 border">
        <span className="text-sm text-zinc-600">Total</span>
        <span className="text-xl font-bold">{reais(total)}</span>
      </div>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <button
        onClick={gerarPix}
        disabled={selecionadas.length === 0 || gerando}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50 active:bg-emerald-700"
      >
        {gerando ? "Gerando Pix…" : "Pagar com Pix"}
      </button>
    </div>
  );
}
