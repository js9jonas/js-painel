// Uso e recusa de token de painel (sql/022). Login e troca já vêm do gatilho no banco;
// aqui só o que o banco não vê. Acessório: falha de gravação nunca derruba a chamada real.
import { createHash } from "node:crypto";
import { pool } from "@/lib/db";

// Mesmo md5 do gatilho, pra cair na linha que ele criou.
const hash = (token: string) => createHash("md5").update(token).digest("hex");

function gravar(sql: string, params: unknown[]) {
  pool.query(sql, params).catch((e: unknown) => {
    console.error("[painel-sessao-log]", e instanceof Error ? e.message : e);
  });
}

export function registrarUsoOkToken(token: string) {
  gravar(
    `INSERT INTO public.painel_sessao_log (token_hash, ultimo_ok_em) VALUES ($1, now())
     ON CONFLICT (token_hash) DO UPDATE SET ultimo_ok_em = now()
     WHERE painel_sessao_log.ultimo_ok_em IS NULL OR painel_sessao_log.ultimo_ok_em < now() - interval '1 minute'`,
    [hash(token)]
  );
}

export function registrarRecusaToken(token: string, chamada: string) {
  gravar(
    `INSERT INTO public.painel_sessao_log (token_hash, recusado_em, chamada_recusada) VALUES ($1, now(), $2)
     ON CONFLICT (token_hash) DO UPDATE SET recusado_em = now(), chamada_recusada = $2
     WHERE painel_sessao_log.recusado_em IS NULL`,
    [hash(token), chamada]
  );
}
