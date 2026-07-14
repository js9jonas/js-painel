"use client";

import { useState, useTransition } from "react";
import type { ContaPainelVinculada } from "@/lib/clientes";
import { enviarDadosAcesso, type FormatoEnvio, type ResultadoEnvioDados } from "@/app/actions/dadosAcessoIptv";
import { montarLinkM3u } from "@/lib/dados-acesso-iptv-formato";
import EditarContaModal from "./EditarContaModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppVinculado = { id_app_registro: number; nome_app: string | null };

type Props = {
  conta: ContaPainelVinculada;
  idCliente: string;
  appsVinculados: AppVinculado[];
  /** Chamado após editar a conta com sucesso — ver EditarContaModal.onSaved. */
  onContaChanged?: () => void;
};

export default function ContaAcoesMenu({ conta, idCliente, appsVinculados, onContaChanged }: Props) {
  const [editarAberto, setEditarAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvioDados | null>(null);
  const [copiadoModelo, setCopiadoModelo] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isUnitv = conta.tipo_painel === "unitv";
  const podeM3u = !isUnitv && !!conta.host_stream;

  function copiarM3u() {
    if (!conta.host_stream) return;
    const link = montarLinkM3u({
      usuario: conta.usuario,
      senha: conta.senha,
      rotulo: null,
      nomePainel: conta.nome_painel,
      hostStream: conta.host_stream,
    });
    navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  function enviar(formato: FormatoEnvio) {
    setResultado(null);
    setCopiadoModelo(false);
    startTransition(async () => {
      const r = await enviarDadosAcesso(conta.id_conta, idCliente, formato);
      if ("erro" in r) {
        setResultado({ enviado: false, motivo: r.erro, texto: "" });
      } else {
        setResultado(r);
      }
    });
  }

  function copiarModelo() {
    if (!resultado) return;
    navigator.clipboard.writeText(resultado.texto);
    setCopiadoModelo(true);
    setTimeout(() => setCopiadoModelo(false), 1500);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors leading-none"
            title="Ações da conta"
            type="button"
          >
            ⚙️
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setEditarAberto(true)}>
            ✏️ Editar
          </DropdownMenuItem>

          {podeM3u && (
            <>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); copiarM3u(); }}>
                🔗 {copiado ? "Copiado!" : "Copiar M3U"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => enviar("xciptv")}>
                📲 Enviar Dados de XCIPTV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => enviar("xtream")}>
                📲 Enviar dados Xtream Codes
              </DropdownMenuItem>
            </>
          )}

          {isUnitv && (
            <DropdownMenuItem onSelect={() => enviar("unitv")}>
              📲 Enviar dados de acesso
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditarContaModal
        conta={conta}
        appsVinculados={appsVinculados}
        open={editarAberto}
        onClose={() => setEditarAberto(false)}
        onSaved={onContaChanged}
      />

      {(resultado || isPending) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && !isPending && setResultado(null)}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900 text-sm">Envio de dados de acesso</h2>

            {isPending && (
              <p className="text-xs text-zinc-500">Enviando…</p>
            )}

            {!isPending && resultado?.enviado && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">
                Mensagem enviada para {resultado.telefone}.
              </p>
            )}

            {!isPending && resultado && !resultado.enviado && (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
                  {resultado.motivo ?? "Não foi possível enviar automaticamente."}
                </p>
                {resultado.texto && (
                  <button
                    onClick={copiarModelo}
                    type="button"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 transition-colors"
                  >
                    {copiadoModelo ? "Modelo copiado!" : "Copiar modelo da mensagem"}
                  </button>
                )}
              </div>
            )}

            {!isPending && (
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setResultado(null)}
                  type="button"
                  className="px-4 py-1.5 rounded-lg text-sm border border-zinc-300 hover:bg-zinc-50 transition-colors"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
