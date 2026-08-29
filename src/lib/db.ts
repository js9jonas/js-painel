// src/lib/db.ts
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definido");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

pool.on("connect", (client) => {
  client.query("SET timezone = 'America/Sao_Paulo'");
  // Trava de segurança: nenhuma query pode travar o pool indefinidamente.
  // Sem isso, uma consulta lenta (ex: polling que se sobrepõe) se acumula
  // sem limite e sufoca todo o app, que compartilha este mesmo pool.
  client.query("SET statement_timeout = 15000");
});