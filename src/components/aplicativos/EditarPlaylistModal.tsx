"use client";

import { useState } from "react";
import type { PlaylistRow } from "@/lib/aplicativos";

type Props = {
  idAppRegistro: number;
  playlist: PlaylistRow;
  tipoPainel: string | null;
  nomeCliente: string;
  onClose: () => void;
  onSaved: () => void;
};

// SmartOne armazena a URL já montada como "host:port/?username=X&password=Y" —
// desmonta pra exibir os campos separados (formato exigido pelo POST de edição lá).
function parseSmartOneUrl(url: string | null): { host: string; port: string; usuario: string; senha: string } {
  const m = (url ?? "").match(/^(.*):(\d+)\/\?username=([^&]*)&password=(.*)$/);
  if (!m) return { host: "", port: "", usuario: "", senha: "" };
  return { host: m[1], port: m[2], usuario: decodeURIComponent(m[3]), senha: decodeURIComponent(m[4]) };
}

export default function EditarPlaylistModal({ idAppRegistro, playlist, tipoPainel, nomeCliente, onClose, onSaved }: Props) {
  const isSmartOne = tipoPainel === "smartone";
  const smartOneCampos = isSmartOne ? parseSmartOneUrl(playlist.url) : null;

  const [nome, setNome] = useState(playlist.nome ?? "");
  const [url, setUrl] = useState(playlist.url ?? "");
  const [host, setHost] = useState(smartOneCampos?.host ?? "");
  const [port, setPort] = useState(smartOneCampos?.port ?? "");
  const [usuario, setUsuario] = useState(smartOneCampos?.usuario ?? "");
  const [senha, setSenha] = useState(smartOneCampos?.senha ?? "");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = isSmartOne ? { nome, host, port, usuario, senha, nota: nomeCliente } : { nome, url };
      const startRes = await fetch(`/api/aplicativos/${idAppRegistro}/playlists/${playlist.playlist_id_externo}?acao=editar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const { jobId } = await startRes.json();
      if (!jobId) {
        setErro("Erro ao iniciar a edição.");
        setSalvando(false);
        return;
      }

      const inicio = Date.now();
      const MAX_ESPERA = 5 * 60 * 1000;
      while (Date.now() - inicio < MAX_ESPERA) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(`/api/aplicativos/${idAppRegistro}/playlists/${playlist.playlist_id_externo}?jobId=${jobId}`);
        const job = await poll.json();
        if (job.done) {
          if (job.ok) {
            onSaved();
            onClose();
          } else {
            setErro(job.erro ?? "Falha ao salvar.");
            setSalvando(false);
          }
          return;
        }
      }
      setErro("Timeout: a edição não concluiu a tempo.");
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
          <h2 className="text-lg font-bold text-zinc-900">Editar Playlist</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Alterações são enviadas direto pra API do painel.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className={labelClass}>Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} />
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
                  <input value={port} onChange={(e) => setPort(e.target.value)} className={inputClass} />
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
            disabled={salvando}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
