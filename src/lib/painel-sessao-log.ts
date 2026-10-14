// Uso e recusa de token de painel (sql/022). Login e troca já vêm do gatilho no banco;
// aqui só o que o banco não vê. Só atualiza linha existente (todo token gravado tem linha):
// token que nunca foi pro banco não vira linha solta. Acessório: falha nunca derruba a chamada.
import { createHash } from "node:crypto";
import { pool } from "@/lib/db";

// Mesmo md5 do gatilho, pra cair na linha que ele criou.
const hash = (token: string) => createHash("md5").update(token).digest("hex");

function gravar(sql: string, params: unknown[]) {
  pool.query(sql, params).catch((e: unknown) => {
    console.error("[painel-sessao-log]", e instanceof Error ? e.message : e);
  });
}

// Trava em memória: um sync faz centenas de chamadas com o mesmo token — no máx. 1 gravação/min por token.
const ultimoOk = new Map<string, number>();

export function registrarUsoOkToken(token: string) {
  const h = hash(token);
  const agora = Date.now();
  if ((ultimoOk.get(h) ?? 0) > agora - 60_000) return;
  if (ultimoOk.size > 200) ultimoOk.clear();
  ultimoOk.set(h, agora);
  gravar(
    `UPDATE public.painel_sessao_log SET ultimo_ok_em = now()
      WHERE token_hash = $1 AND (ultimo_ok_em IS NULL OR ultimo_ok_em < now() - interval '1 minute')`,
    [h]
  );
}

export function registrarRecusaToken(token: string, chamada: string) {
  gravar(
    `UPDATE public.painel_sessao_log SET recusado_em = now(), chamada_recusada = $2
      WHERE token_hash = $1 AND recusado_em IS NULL`,
    [hash(token), chamada]
  );
}
