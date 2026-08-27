import { pool } from "@/lib/db";
import { getAdapterPainel } from "@/lib/painel-adapters";
import { reconciliarSaldoServidor } from "@/lib/saldoServidor";

// Reconciliação periódica do saldo de créditos por servidor. O saldo em `saldo_servidor` é uma
// ESTIMATIVA local (abate 1 crédito por conta a cada renovação, ver abaterCreditoRenovacao em
// saldoServidor.ts) — a única correção contra o valor REAL do fornecedor (adapter.getCreditos())
// era manual, via botão "Sincronizar" no card de cada painel em /conexoes. Sem alguém clicar,
// o saldo mostrado em "Saldo de créditos por servidor" (/alertas) podia ficar desatualizado
// indefinidamente. Este job roda no próprio processo Next.js (mesmo padrão de club-keepalive.ts)
// e corrige todos os painéis automaticamente.
//
// Cadência de 6h (não mais frequente): créditos não mudam a ponto de precisar de granularidade
// de minutos, e para o CLUB isso soma-se ao orçamento de chamadas da sessão única (~280 chamadas
// antes de invalidar, ver club.ts) — vale manter essa reconciliação barata e pouco frequente.
const INTERVALO_MS = 6 * 60 * 60 * 1000;

type PainelRow = { id: number; id_servidor: number };

async function tick() {
  let rows: PainelRow[];
  try {
    ({ rows } = await pool.query<PainelRow>(
      `SELECT id, id_servidor FROM public.painel_servidores WHERE ativo = true AND id_servidor IS NOT NULL`
    ));
  } catch (err) {
    console.error("[saldo-keepalive] falha ao consultar painéis:", err instanceof Error ? err.message : err);
    return;
  }

  for (const row of rows) {
    let adapter;
    try {
      adapter = await getAdapterPainel(row.id);
    } catch (err) {
      console.error(`[saldo-keepalive] painel ${row.id}: falha ao carregar adapter —`, err instanceof Error ? err.message : err);
      continue;
    }
    if (!adapter.getCreditos) continue; // painel sem endpoint de créditos

    // getCreditos() dos adapters já engole os próprios erros e retorna null (ex: sessão CLUB
    // momentaneamente morta — o keepalive de sessão corrige antes do próximo tick de 6h).
    const creditos = await adapter.getCreditos();
    if (creditos === null) continue;

    try {
      const r = await reconciliarSaldoServidor(row.id_servidor, creditos, "Sync automático (cron)");
      if (r.atualizou) {
        console.log(`[saldo-keepalive] servidor ${row.id_servidor}: saldo corrigido ${r.saldoAnterior} → ${r.saldoNovo}`);
      }
    } catch (err) {
      console.error(`[saldo-keepalive] servidor ${row.id_servidor}: falha ao gravar saldo —`, err instanceof Error ? err.message : err);
    }
  }
}

export function iniciarKeepaliveSaldo() {
  tick().catch(() => {}); // já roda uma vez no boot, não espera o primeiro intervalo completo
  setInterval(() => { tick().catch(() => {}); }, INTERVALO_MS);
}
