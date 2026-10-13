// id_app (public.apps) dos apps cujo cadastro e ativação são feitos pelo painel da plataforma appacesso
// (mesmos ids do sync-aplicativos). Arquivo sem dependências de servidor: usado também em componentes.
export type TipoPainelApp = "funplays" | "lazerplay" | "coreplayer";

export const TIPO_POR_ID_APP: Record<number, TipoPainelApp> = {
  3: "funplays",    // Fun Play
  2: "lazerplay",   // Lazer Play
  31: "coreplayer", // Core Player
};

export function appTemCadastroPeloPainel(idApp: string | number | null | undefined): boolean {
  return idApp != null && idApp !== "" && TIPO_POR_ID_APP[Number(idApp)] !== undefined;
}

// Apps da plataforma appacesso com transferência de licença (PUT /reseller/device/transfer). Testada no
// Fun Play em 13/10/2026; Lazer Play e Core Player liberados no mesmo dia a pedido do Jonas (mesma API).
export const APPS_COM_TRANSFERENCIA_PAINEL = [3, 2, 31];

export function appTransfereLicenca(idApp: string | number | null | undefined): boolean {
  return idApp != null && idApp !== "" && (APPS_COM_TRANSFERENCIA_PAINEL.includes(Number(idApp)) || Number(idApp) === ID_APP_SMARTONE);
}

// SmartOne (smartone-iptv.com): outra plataforma, sem chave da TV. Aparelho novo entra pelo painel
// junto com a lista (não existe aparelho sem lista lá) e fica "Pending" até o cliente recarregar a lista.
export const ID_APP_SMARTONE = 4;

/** Apps cujo cadastro de aparelho novo já manda a lista pelo painel (Fun/Lazer/Core + SmartOne). */
export function appTemCadastroComLista(idApp: string | number | null | undefined): boolean {
  return appTemCadastroPeloPainel(idApp) || (idApp != null && idApp !== "" && Number(idApp) === ID_APP_SMARTONE);
}

// Clouddy (console.clouddy.online): sem painel de revenda — o js-painel entra na conta do CLIENTE
// (e-mail em aplicativos.mac, senha em aplicativos.chave). Ver src/lib/clouddy.ts.
export const ID_APP_CLOUDDY = 5;

/** Apps em que o botão "Atualizar" consegue ler a validade direto na origem (painel ou conta do cliente). */
export function appTemAtualizacao(idApp: string | number | null | undefined): boolean {
  return appTemCadastroComLista(idApp) || (idApp != null && idApp !== "" && Number(idApp) === ID_APP_CLOUDDY);
}
