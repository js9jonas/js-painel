// src/lib/db-portal.ts — conexões das páginas públicas do cliente (cliente.jssistemas.online).
// Usuário de banco próprio (app_portal_cliente, sql/025): lê só as colunas da página e cria
// cobranças; não enxerga o resto do banco. Fila separada e pequena: uma enxurrada de acessos
// públicos esgota estas 3 conexões, não as do painel (/chat, renovação, webhook do WhatsApp).
// Sem DATABASE_URL_PORTAL a página pública dá erro — nunca cai para o superusuário do painel.
import { Pool } from "pg";

/** Conexões simultâneas das rotas públicas (o usuário no banco aceita até 5). */
export const MAX_CONEXOES_PORTAL = 3;

let poolPortal: Pool | null = null;

export function dbPortal(): Pool {
  if (poolPortal) return poolPortal;
  const url = process.env.DATABASE_URL_PORTAL?.trim();
  if (!url) throw new Error("DATABASE_URL_PORTAL não definido");
  poolPortal = new Pool({
    connectionString: url, // SSL pela URL (`?sslmode=require`), como em db.ts
    max: MAX_CONEXOES_PORTAL,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // statement_timeout (5 s) e fuso já vêm configurados no próprio usuário do banco
  poolPortal.on("error", (err) => console.error("[db-portal] conexão ociosa caiu:", err.message));
  return poolPortal;
}
