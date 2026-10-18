// src/app/pagar/[token]/page.tsx — página pública do link de pagamento (ver src/lib/pix-link.ts).
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { dadosDoLink, qrSvg } from "@/lib/pix-link";
import PagarCliente from "./PagarCliente";

export const metadata: Metadata = {
  title: "Pagamento — JS Sistemas",
  robots: { index: false, follow: false },
};

export default async function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dados = await dadosDoLink(token);

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
