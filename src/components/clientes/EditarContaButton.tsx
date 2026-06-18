"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContaPainelVinculada } from "@/lib/clientes";

type AppVinculado = { id_app_registro: number; nome_app: string | null };

type Props = {
  conta: ContaPainelVinculada;
  idCliente: string;
  appsVinculados: AppVinculado[];
};

export default function EditarContaButton({ conta, idCliente: _idCliente, appsVinculados }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [rotulo, setRotulo]     = useState(conta.rotulo   ?? "");
  const [senha,  setSenha]      = useState(conta.senha    ?? "");
  const [usuario, setUsuario]   = useState(conta.usuario  ?? "");
  const [erro,   setErro]       = useState<string | null>(null);
  const [aviso,  setAviso]      = useState<string | null>(null);
  const [ok,     setOk]         = useState(false);

  function abrir() {
    setRotulo(conta.rotulo  ?? "");
    setSenha(conta.senha    ?? "");
    setUsuario(conta.usuario ?? "");
    setErro(null);
    setAviso(null);
    setOk(false);
    setOpen(true);
  }

  function fechar() {
    setOpen(false);
  }

  function salvar() {
    setErro(null);
    setAviso(null);
    setOk(false);

    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          idConta: Number(conta.id_conta),
          usuario: conta.usuario,
        };
        if (rotulo  !== (conta.rotulo  ?? "")) body.novoRotulo  = rotulo;
        if (senha   !== (conta.senha   ?? "")) body.novaSenha   = senha;
        if (usuario !== conta.usuario)         body.novoUsuario = usuario;

        // Nada mudou
        if (Object.keys(body).length === 2) {
          setAviso("Nenhuma alteração detectada.");
          return;
        }

        const res = await fetch(`/api/paineis/servidores/${conta.id_painel_servidor}/editar-conta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setErro(json.erro ?? "Erro ao salvar.");
          return;
        }

        if (json.aviso) setAviso(json.aviso);
        else setOk(true);

        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro de rede.");
      }
    });
  }

  return (
    <>
      <button
        onClick={abrir}
        className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
        title="Editar conta"
        type="button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.target === e.currentTarget && fechar()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-zinc-900 text-sm">Editar conta</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{conta.nome_painel}</p>
              </div>
              <button onClick={fechar} className="text-zinc-400 hover:text-zinc-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {appsVinculados.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <p className="font-medium mb-1">Apps vinculados a esta conta:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {appsVinculados.map(a => (
                    <li key={a.id_app_registro}>{a.nome_app ?? `App #${a.id_app_registro}`}</li>
                  ))}
                </ul>
                <p className="mt-1 text-amber-700">Se alterar usuário/senha, atualize também nos apps acima.</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Rótulo</label>
                <input
                  type="text"
                  value={rotulo}
                  onChange={e => setRotulo(e.target.value)}
                  placeholder="Ex: Nome do cliente"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Senha</label>
                <input
                  type="text"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder={conta.senha ?? "•••••••"}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Usuário
                  <span className="ml-1.5 font-normal text-zinc-400">(somente adapters que suportam)</span>
                </label>
                <input
                  type="text"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {erro  && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{erro}</p>}
            {aviso && <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">{aviso}</p>}
            {ok    && <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">Conta atualizada com sucesso.</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={fechar}
                className="px-4 py-1.5 rounded-lg text-sm border border-zinc-300 hover:bg-zinc-50 transition-colors"
                type="button"
              >
                Fechar
              </button>
              <button
                onClick={salvar}
                disabled={isPending}
                className="px-4 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                type="button"
              >
                {isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
