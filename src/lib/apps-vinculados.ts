// Apps de um cliente ligados a cada conta de painel — pro aviso "Apps vinculados a esta conta"
// do EditarContaModal ("se alterar usuário/senha, atualize também nos apps").
//
// O vínculo real app↔conta fica nas playlists do app (aplicativo_playlists.id_conta, preenchido
// pelo sync dos painéis). aplicativos.id_conta existe na tabela mas está 100% vazio desde 28/09/2026
// e não é mais gravado. Sem acesso a banco: usado também no /chat (client component).
import type { AplicativoRow } from "@/lib/aplicativos";

export type AppVinculadoConta = { id_app_registro: number; nome_app: string | null };

export function appsPorConta(aplicativos: AplicativoRow[]): Map<string, AppVinculadoConta[]> {
  const mapa = new Map<string, AppVinculadoConta[]>();
  for (const app of aplicativos) {
    const contas = new Set(app.playlists.filter((pl) => pl.id_conta != null).map((pl) => String(pl.id_conta)));
    for (const idConta of contas) {
      const lista = mapa.get(idConta) ?? [];
      lista.push({ id_app_registro: app.id_app_registro, nome_app: app.nome_app });
      mapa.set(idConta, lista);
    }
  }
  return mapa;
}
