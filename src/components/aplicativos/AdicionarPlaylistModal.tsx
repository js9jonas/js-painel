"use client";

import { useState } from "react";

type Props = {
  idAppRegistro: number;
  tipoPainel: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function AdicionarPlaylistModal({ idAppRegistro, tipoPainel, onClose, onSaved }: Props) {
  const isSmartOne = tipoPainel === "smartone";

  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = isSmartOne ? { nome, host, port, usuario, senha } : { nome, url };
      const startRes = await fetch(`/api/aplicativos/${idAppRegistro}/playlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const { jobId } = await startRes.json();
      if (!jobId) {
        setErro("Erro ao iniciar a criação.");
        setSalvando(false);
        return;
      }

      const inicio = Date.now();
      const MAX_ESPERA = 5 * 60 * 1000;
      while (Date.now() - inicio < MAX_ESPERA) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(`/api/aplicativos/${idAppRegistro}/playlists?jobId=${jobId}`);
        const job = await poll.json();
        if (job.done) {
          if (job.ok) {
            onSaved();
            onClose();
          } else {
            setErro(job.erro ?? "Falha ao criar playlist.");
            setSalvando(false);
          }
          return;
        }
      }
      setErro("Timeout: a criação não concluiu a tempo.");
      setSalvando(false);
    } catch {
      setErro("Erro de rede.");
      setSalvando(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all";
  const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={salvando ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">Adicionar Playlist</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isSmartOne
              ? "No SmartOne isso cria um device novo (smartkey) pra esse MAC — fica como \"Pending\" no painel."
              : "Adiciona uma nova playlist a este device, enviado direto pra API do painel."}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className={labelClass}>Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} placeholder="Nome da playlist" />
          </div>

          {isSmartOne ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Servidor</label>
                  <input value={host} onChange={(e) => setHost(e.target.value)} className={inputClass} placeholder="http://servidor.com" />
                </div>
                <div>
                  <label className={labelClass}>Porta</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)} className={inputClass} placeholder="80" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Usuário</label>
                  <input value={usuario} onChange={(e) => setUsuario(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Senha</label>
                  <input value={senha} onChange={(e) => setSenha(e.target.value)} className={inputClass} />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className={labelClass}>URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="http://servidor.com/get.php?username=X&password=Y" />
            </div>
          )}
        </div>

        {erro && <p className="mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !nome}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {salvando ? "Criando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
