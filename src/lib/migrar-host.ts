// Migração em massa de endereço (13/10/2026): troca o host de TODAS as listas da revenda que usam o
// antigo, com 1 operação no painel do app, e espelha nas listas salvas aqui.
//  - IBO Pro: Mass Change → Hostname (API, aceita porta).
//  - SmartOne: Mass Change hostname (formulário; só o endereço, sem porta — a porta é outra opção do site).
//  - IBO Player e IBO Xplayer: revenda IBOSOL (count-playlist-domain + update-playlist), uma vez por app
//    (app_platform/app_id de IBOSOL_POR_ID_APP). Só alcança as listas que a revenda conhece — as que o cliente pôs pelo site dele podem ficar de fora (o total vem da contagem).
//  - POP Player (15/10/2026): Migrador de DNS do site, pelo robô de navegador (src/lib/robo.ts). O endereço antigo
//    tem que ser exatamente um dos que o POP lista (com http/https e a porta, se houver).
//  - Duplecast (15/10/2026): Mass Change server URL (mesmo formulário do SmartOne, sem porta), pelo robô.
// Fun Play / Lazer Play / Core Player têm "servidores" no painel: ver servidores-app/route.ts.
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { ID_APP_DUPLECAST, ID_APP_IBOPRO, ID_APP_POPPLAYER, ID_APP_SMARTONE, IBOSOL_POR_ID_APP } from "@/lib/apps-painel-ids";
import { sessaoIbo } from "@/lib/ibopro";
import { comIbosol } from "@/lib/iboplayer";
import { contarDominioIbosol, mudarDominioIbosol } from "@/lib/painel-adapters/iboplayer";
import { sessaoSmartOne } from "@/lib/app-painel";
import { mudarHostListasIbo } from "@/lib/painel-adapters/ibopro";
import { mudarHostListas as mudarHostListasSmartOne } from "@/lib/painel-adapters/smartone";
import { executarNoRobo } from "@/lib/robo";

export const TIPOS_MIGRAR_HOST = ["ibopro", "smartone", "iboplayer", "popplayer", "duplecast"];

export async function migrarHost(idPainel: number, antigo: string, novo: string): Promise<{ noPainel: number; noBanco: number; painel: string }> {
  const { rows } = await pool.query<{ nome: string; tipo: string }>(`SELECT nome, tipo FROM public.painel_servidores WHERE id = $1`, [idPainel]);
  const painel = rows[0];
  if (!painel || !TIPOS_MIGRAR_HOST.includes(painel.tipo)) throw new Error("Esse painel não tem migração de endereço por aqui.");

  let noPainel: number;
  let idsApp: number[];
  if (painel.tipo === "smartone") {
    if (/:\d+$/.test(antigo) || /:\d+$/.test(novo)) throw new Error("No SmartOne a troca é só do endereço, sem a porta (a porta é trocada à parte no site).");
    noPainel = await mudarHostListasSmartOne(await sessaoSmartOne(idPainel), antigo, novo);
    idsApp = [ID_APP_SMARTONE];
  } else if (painel.tipo === "iboplayer") {
    idsApp = Object.keys(IBOSOL_POR_ID_APP).map(Number);
    noPainel = await comIbosol(idPainel, async (token) => {
      let total = 0;
      for (const id of idsApp) {
        const { modulo, appId } = IBOSOL_POR_ID_APP[id];
        const n = await contarDominioIbosol(token, antigo, modulo, appId);
        if (n > 0) await mudarDominioIbosol(token, antigo, novo, modulo, appId);
        total += n;
      }
      return total;
    });
  } else if (painel.tipo === "duplecast") {
    if (/:\d+$/.test(antigo) || /:\d+$/.test(novo)) throw new Error("No Duplecast a troca é só do endereço, sem a porta.");
    const r = await executarNoRobo<{ listas: number }>("duplecast", "migrar_host", { de: antigo, para: novo });
    noPainel = r.listas;
    idsApp = [ID_APP_DUPLECAST];
  } else if (painel.tipo === "popplayer") {
    const r = await executarNoRobo<{ listas: number }>("popplayer", "migrar_dns", { de: antigo, para: novo });
    noPainel = r.listas;
    idsApp = [ID_APP_POPPLAYER];
  } else {
    noPainel = await mudarHostListasIbo(await sessaoIbo(idPainel), antigo, novo);
    idsApp = [ID_APP_IBOPRO];
  }

  // Listas salvas aqui: troca o começo da URL quando ele é exatamente o host antigo
  const { rowCount } = await pool.query(
    `UPDATE public.aplicativo_playlists pl SET url = $2 || substr(pl.url, length($1) + 1), atualizado_em = NOW()
     FROM public.aplicativos ap
     WHERE ap.id_app_registro = pl.id_app_registro AND ap.id_app = ANY($3::bigint[])
       AND lower(left(pl.url, length($1))) = lower($1) AND substr(pl.url, length($1) + 1, 1) IN ('/', ':', '?', '')`,
    [antigo, novo, idsApp]
  );

  const client = await pool.connect();
  try {
    await registrarAudit(client, {
      tipo: "servidor_app",
      id_cliente: null,
      descricao: `Listas do painel ${painel.nome} migradas de ${antigo} para ${novo} (${noPainel} no painel)`,
      dados_antes: { host: antigo },
      dados_depois: { host: novo, total_painel: noPainel, total_banco: rowCount ?? 0 },
    });
  } catch {
    // auditoria nunca derruba a operação (ela já aconteceu no painel)
  } finally {
    client.release();
  }
  return { noPainel, noBanco: rowCount ?? 0, painel: painel.nome };
}
