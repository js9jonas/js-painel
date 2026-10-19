"use client";

import { useState } from "react";
import type { PlaylistRow } from "@/lib/aplicativos";
import { desmontarLinkM3uSmartOne, montarLinkM3uSmartOne } from "@/lib/smartone-m3u";
import { montarLinkM3u } from "@/lib/dados-acesso-iptv-formato";
import type { ContaPainelVinculada } from "@/lib/clientes";

type Props = {
  idAppRegistro: number;
  playlist: PlaylistRow;
  tipoPainel: string | null;
  nomeCliente: string;
  /** Contas do cliente: "Trocar conta" preenche a URL com o host principal da conta escolhida */
  contas?: ContaPainelVinculada[];
  onClose: () => void;
  onSaved: () => void;
};

/** Origem (protocolo + host + porta) para comparar hosts; vazio se não for URL. */
function origem(s: string | null | undefined): string {
  try {
    return new URL((s ?? "").trim()).origin.toLowerCase();
  } catch {
    return "";
  }
}

export default function EditarPlaylistModal({ idAppRegistro, playlist, tipoPainel, nomeCliente, contas = [], onClose, onSaved }: Props) {
  const isSmartOne = tipoPainel === "smartone";
  // Mesmo filtro do "+" de adicionar: só contas com link m3u, ativas primeiro
  const contasM3u = contas
    .filter((c) => c.tipo_painel !== "unitv" && c.host_stream && c.senha)
    .sort((a, b) => Number(b.status_conta === "ok") - Number(a.status_conta === "ok"));
  const linkDaConta = (c: ContaPainelVinculada) =>
    isSmartOne
      ? montarLinkM3uSmartOne(c.host_stream!, c.usuario, c.senha ?? "")
      : montarLinkM3u({ usuario: c.usuario, senha: c.senha, rotulo: null, nomePainel: c.nome_painel, hostStream: c.host_stream });

  // Lido uma vez ao abrir: a URL como está, a conta do cliente com o mesmo usuário e senha (se houver) e se o
  // host da playlist é outro que não o principal dessa conta — nesse caso a conta já vem escolhida e a URL
  // já vem com o host principal, pra atualizar com um clique (19/10/2026).
  const [inicial] = useState(() => {
    // SmartOne guarda host/porta/usuário/senha separados (exigência do endpoint dele),
    // mas na UI isso vira um único campo "link m3u", igual FunPlays/LazerPlay/CorePlayer —
    // normaliza aqui pra exibir sempre no mesmo formato, mesmo vindo de um registro
    // antigo (sincronizado antes dessa mudança). Ver [[smartone-m3u]].
    const lido = desmontarLinkM3uSmartOne(playlist.url ?? "");
    const url = isSmartOne ? montarLinkM3uSmartOne(lido.host, lido.usuario, lido.senha) : playlist.url ?? "";
    const conta = lido.usuario
      ? contasM3u.find((c) => c.usuario === lido.usuario && c.senha === lido.senha) ?? null
      : null;
    const hostDiferente = !!conta && origem(url) !== origem(conta.host_stream);
    return { url, conta, hostDiferente };
  });
  const contaAtual = inicial.conta;

  const [nome, setNome] = useState(playlist.nome ?? "");
  const [idConta, setIdConta] = useState(inicial.hostDiferente ? contaAtual!.id_conta : "");
  const [url, setUrl] = useState(() => (inicial.hostDiferente ? linkDaConta(contaAtual!) : inicial.url));

  const escolhida = contasM3u.find((c) => c.id_conta === idConta) ?? null;
  const trocandoConta = !!escolhida && escolhida.id_conta !== contaAtual?.id_conta;

  function escolherConta(id: string) {
    setIdConta(id);
    const c = contasM3u.find((x) => x.id_conta === id);
    if (!c) {
      setUrl(inicial.url);
      return;
    }
    setUrl(linkDaConta(c));
    // Outro painel: o nome antigo (ex.: "CENTRAL") ficaria errado
    if (c.id_conta !== contaAtual?.id_conta && c.nome_painel !== contaAtual?.nome_painel) setNome(c.nome_painel);
  }

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = isSmartOne ? { nome, ...desmontarLinkM3uSmartOne(url), nota: nomeCliente } : { nome, url };
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
          {contasM3u.length > 0 && (
            <div>
              <label className={labelClass}>Trocar conta</label>
              <select
                value={idConta}
                onChange={(e) => escolherConta(e.target.value)}
                className={`${inputClass} ${trocandoConta ? "border-amber-400 bg-amber-50 focus:ring-amber-500" : ""}`}
              >
                <option value="">Manter a URL atual / digitar</option>
                {contasM3u.map((c) => (
                  <option key={c.id_conta} value={c.id_conta}>
                    {c.id_conta === contaAtual?.id_conta ? "✓ " : ""}
                    {c.nome_painel} · {c.usuario}
                    {c.rotulo_complemento ? ` · ${c.rotulo_complemento}` : ""}
                    {c.status_conta !== "ok" ? ` (${c.status_conta})` : ""}
                    {c.id_conta === contaAtual?.id_conta ? " — conta atual" : ""}
                  </option>
                ))}
              </select>
              {trocandoConta && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  ⚠️ <b>Conta diferente da atual.</b>{" "}
                  {contaAtual
                    ? <>Hoje a playlist usa <b>{contaAtual.nome_painel} · {contaAtual.usuario}</b>.</>
                    : <>Hoje a playlist não usa nenhuma conta deste cliente.</>}{" "}
                  Ao salvar, passa a usar <b>{escolhida!.nome_painel} · {escolhida!.usuario}</b>.
                </p>
              )}
              {!trocandoConta && escolhida && inicial.hostDiferente && (
                <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 ring-1 ring-sky-200">
                  Mesma conta, host atualizado para o principal do {escolhida.nome_painel}:{" "}
                  <span className="font-mono">{origem(inicial.url) || "?"}</span> → <span className="font-mono">{origem(url)}</span>. É só salvar.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="http://servidor.com/get.php?username=X&password=Y" />
          </div>
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
