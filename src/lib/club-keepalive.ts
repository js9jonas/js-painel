import { pool } from "@/lib/db";
import { dispararLoginClub } from "@/lib/painel-adapters/club";
import type { ServidorCredenciais, SaveSession } from "@/lib/painel-adapters/types";

// Renovação preventiva da sessão CLUB (pdcapi.io). A sessão real dura ~1h ou menos (não os
// "~7 dias" nominais que uma nota antiga chegou a registrar — ver docs/memoria/
// project_club_token_expiry.md), e o re-login via hCaptcha/2captcha leva minutos e falha boa
// parte das tentativas. Sem isso, o único mecanismo era reativo (withRelogin em club.ts): só
// disparava o relogin QUANDO alguém tentava usar a sessão morta, e essa primeira tentativa
// sempre falhava na hora, atrapalhando o trabalho durante o dia (Jonas precisava ir manualmente
// no card em /conexoes e esperar). Este job roda dentro do próprio processo Next.js (Easypanel
// = instância única persistente, não serverless — mesmo pressuposto já usado em
// renovar-sessao/route.ts) e chama a MESMA função usada pelo botão manual e pelo relogin
// reativo (dispararLoginClub, que faz dedup — nunca 2 logins em paralelo pro mesmo painel).
const INTERVALO_MS = 10 * 60 * 1000; // checa a cada 10 minutos
const MARGEM_MS = 20 * 60 * 1000; // renova preventivamente quando faltar menos de 20 min pra expirar

type PainelClubRow = ServidorCredenciais & { id: number };

async function tick() {
  let rows: PainelClubRow[];
  try {
    ({ rows } = await pool.query<PainelClubRow>(
      `SELECT id, tipo AS painel_tipo, url_painel AS painel_url, usuario AS painel_usuario,
              senha AS painel_senha, session_cookie, session_expiry, api_token, api_secret
       FROM public.painel_servidores WHERE tipo = 'club'`
    ));
  } catch (err) {
    console.error("[club-keepalive] falha ao consultar painéis CLUB:", err instanceof Error ? err.message : err);
    return;
  }

  for (const row of rows) {
    const restante = row.session_expiry ? new Date(row.session_expiry).getTime() - Date.now() : -Infinity;
    if (restante >= MARGEM_MS) continue; // sessão ainda com folga, nada a fazer

    const idPainel = row.id;
    const onSaveSession: SaveSession = async (cookie, expiry) => {
      await pool.query(
        `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
        [cookie, expiry ?? null, idPainel]
      );
    };

    try {
      await dispararLoginClub(idPainel, row, onSaveSession);
      console.log(`[club-keepalive] painel ${idPainel}: sessão CLUB renovada preventivamente.`);
    } catch (err) {
      console.error(
        `[club-keepalive] painel ${idPainel}: falha ao renovar sessão CLUB preventivamente —`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

export function iniciarKeepaliveClub() {
  tick().catch(() => {}); // já checa uma vez no boot, não espera o primeiro intervalo completo
  setInterval(() => { tick().catch(() => {}); }, INTERVALO_MS);
}
