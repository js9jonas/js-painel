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
