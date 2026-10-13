import { pool } from "@/lib/db";

// Licenças SmartOne ainda válidas em aparelhos que ninguém usa mais — candidatas a "Transferir
// licença" (site do SmartOne) para um MAC novo em vez de gastar giftcode (pedido do Jonas, 12/10/2026).
// A validade é a do último sync (coluna Expiration da lista de aparelhos, que acompanha transferências);
// o histórico de giftcodes NÃO serve pra isso — ele guarda o MAC original e não muda na transferência.
// Fun Play (13/10/2026): mesma ideia, para aparelho novo ainda sem licença paga; só aparelhos do painel
// ATIVO (a transferência usa o número interno do aparelho naquele painel).

/** Tipo de painel cujas licenças entram na lista (smartone ou uma plataforma appacesso). */
export type TipoLicenca = "smartone" | "funplays" | "lazerplay" | "coreplayer";

/** Fun Play só transfere licença com pelo menos 30 dias restantes (regra informada pelo Jonas). */
export const DIAS_MINIMOS_TRANSFERENCIA_PAINEL = 30;

export type MotivoSobra = "sem_cliente" | "cliente_saiu" | "app_inativo";

export type LicencaSobrando = {
  id_app_registro: number;
  mac: string;
  validade: string;
  dias: number;
  motivo: MotivoSobra;
  id_cliente: number | null;
  nome_cliente: string | null;
  /** Status das assinaturas do cliente, ex.: "cancelado, inativo" */
  status_assinaturas: string | null;
  ultimo_venc_contrato: string | null;
  observacao: string | null;
  modelo: string | null;
  sincronizado_em: string | null;
};

export async function getLicencasSobrando(tipo: TipoLicenca = "smartone"): Promise<LicencaSobrando[]> {
  const { rows } = await pool.query<LicencaSobrando>(
    `WITH base AS (
       SELECT ap.id_app_registro, ap.mac, ap.validade, ap.id_cliente, ap.observacao, ap.modelo, ap.atualizado_em,
              lower(btrim(ap.status)) AS status_app, cl.nome AS nome_cliente,
              ass.vivas, ass.status_assinaturas, ass.ultimo_venc
       FROM public.aplicativos ap
       JOIN public.painel_servidores ps ON ps.id = ap.id_painel_servidor AND ps.tipo = $1
                                         AND ($1 = 'smartone' OR ps.ativo IS TRUE)
       LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE a.status NOT IN ('inativo', 'cancelado'))::int AS vivas,
                string_agg(DISTINCT a.status, ', ') AS status_assinaturas,
                MAX(a.venc_contrato) AS ultimo_venc
         FROM public.assinaturas a
         WHERE a.id_cliente = ap.id_cliente
       ) ass ON true
       WHERE ap.removido_em IS NULL
         AND ap.validade > (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
     )
     SELECT id_app_registro, mac, validade::text,
            (validade - (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias,
            CASE WHEN id_cliente IS NULL THEN 'sem_cliente'
                 WHEN COALESCE(vivas, 0) = 0 THEN 'cliente_saiu'
                 ELSE 'app_inativo' END AS motivo,
            id_cliente::int, nome_cliente, status_assinaturas, ultimo_venc::text AS ultimo_venc_contrato,
            observacao, modelo, atualizado_em::text AS sincronizado_em
     FROM base
     WHERE id_cliente IS NULL OR COALESCE(vivas, 0) = 0 OR status_app <> 'ativa'
     ORDER BY validade DESC`,
    [tipo]
  );
  return rows;
}

// ---------- Conferência no site: a licença ainda transfere? ----------
// O site leva ~7 s por MAC, então a conferência roda em segundo plano (3 por vez) e guarda o resultado
// por 6 h em memória (só muda quando alguém transfere — e a transferência atualiza/limpa o próprio MAC).

export type Conferencia =
  | { estado: "ok"; transferivel: boolean; expira_em: string | null; em: number }
  | { estado: "erro"; em: number };

const VALIDADE_CONFERENCIA = 6 * 60 * 60 * 1000;
const SIMULTANEAS = 3;
const conferencias = new Map<string, Conferencia>();
const fila: string[] = [];
const emAndamento = new Set<string>();
let trabalhando = 0;

const chave = (mac: string) => mac.trim().toUpperCase();

/** Resultados ainda válidos + MACs na fila (pra tela mostrar "conferindo…"). */
export function estadoConferencias(): { resultados: Record<string, Conferencia>; pendentes: string[] } {
  const agora = Date.now();
  const resultados: Record<string, Conferencia> = {};
  for (const [mac, c] of conferencias) {
    if (agora - c.em < VALIDADE_CONFERENCIA) resultados[mac] = c;
    else conferencias.delete(mac);
  }
  return { resultados, pendentes: [...emAndamento, ...fila] };
}

export function guardarConferencia(mac: string, c: Conferencia | null) {
  if (c) conferencias.set(chave(mac), c);
  else conferencias.delete(chave(mac));
}

/** Põe na fila os MACs ainda sem resultado válido, na ordem recebida, e liga os trabalhadores. */
export function conferirNoSite(macs: string[]) {
  const { resultados } = estadoConferencias();
  for (const m of macs.map(chave)) {
    if ((!resultados[m] || resultados[m].estado === "erro") && !fila.includes(m) && !emAndamento.has(m)) fila.push(m);
  }
  while (trabalhando < SIMULTANEAS && fila.length > 0) {
    trabalhando++;
    void trabalhar().finally(() => { trabalhando--; });
  }
}

async function trabalhar() {
  const { painelSmartOneAtivo, sessaoSmartOne } = await import("@/lib/app-painel");
  const { csrfDaSessao, licencaDoMac } = await import("@/lib/painel-adapters/smartone");
  let cookie: string, csrf: string;
  try {
    const painel = await painelSmartOneAtivo();
    if (!painel) throw new Error("sem painel SmartOne");
    cookie = await sessaoSmartOne(painel.id);
    csrf = await csrfDaSessao(cookie);
  } catch {
    // Sem sessão: marca o que está na fila como erro (a tela oferece tentar de novo)
    while (fila.length) conferencias.set(fila.shift()!, { estado: "erro", em: Date.now() });
    return;
  }
  while (fila.length) {
    const mac = fila.shift()!;
    emAndamento.add(mac);
    try {
      const lic = await licencaDoMac(cookie, mac, csrf);
      conferencias.set(mac, { estado: "ok", transferivel: !!lic?.transferivel, expira_em: lic?.expira_em ?? null, em: Date.now() });
    } catch {
      conferencias.set(mac, { estado: "erro", em: Date.now() });
    }
    emAndamento.delete(mac);
  }
}
