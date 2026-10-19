// src/app/pagar/[token]/page.tsx — página pública do link de pagamento (ver src/lib/pix-link.ts).
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { dadosDoLink, qrSvg, registrarEventoLink } from "@/lib/pix-link";
import PagarCliente from "./PagarCliente";

// Sobrescreve o que vem do layout raiz (feito pro painel): sem descrição, título de app nem
// manifesto do "JS Painel" — a página do cliente não revela nada do painel.
export const metadata: Metadata = {
  title: "Pagamento — JS Sistemas",
  description: "Pagamento da sua assinatura",
  robots: { index: false, follow: false },
  manifest: null,
  appleWebApp: null,
  icons: null,
};

export default async function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let dados: Awaited<ReturnType<typeof dadosDoLink>>;
  try {
    dados = await dadosDoLink(token);
    if (dados) await registrarEventoLink(token, "abriu", (await headers()).get("user-agent"));
  } catch (err) {
    console.error("[pagar] falha ao abrir a página:", err instanceof Error ? err.message : err);
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900">
        <main className="mx-auto max-w-md px-4 py-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">JS Sistemas</p>
          <div className="mt-6 rounded-2xl border bg-white p-6 text-center">
            <p className="text-lg font-semibold">Página indisponível no momento</p>
            <p className="mt-2 text-sm text-zinc-600">Tente de novo em alguns minutos.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto max-w-md px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">JS Sistemas</p>
        {!dados ? (
          <div className="mt-6 rounded-2xl border bg-white p-6 text-center">
            <p className="text-lg font-semibold">Link não encontrado</p>
            <p className="mt-2 text-sm text-zinc-600">
              Confira se o link está completo ou peça um novo pelo WhatsApp.
            </p>
          </div>
        ) : (
          <PagarCliente
            token={token}
            primeiroNome={dados.primeiroNome}
            assinaturas={dados.assinaturas}
            cobrancaAberta={
              dados.cobrancaAberta
                ? {
                    txid: dados.cobrancaAberta.txid,
                    valor: dados.cobrancaAberta.valor,
                    pixCopiaECola: dados.cobrancaAberta.pix_copia_cola,
                    expiraEm: dados.cobrancaAberta.expira_em,
                    assinaturas: dados.cobrancaAberta.assinaturas,
                    itens: dados.cobrancaAberta.itens,
                    qrSvg: await qrSvg(dados.cobrancaAberta.pix_copia_cola),
                  }
                : null
            }
          />
        )}
      </main>
    </div>
  );
}
