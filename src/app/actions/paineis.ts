"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type PainelServidorInput = {
  id?: number;
  nome: string;
  tipo: string;
  url_painel: string;
  host_stream: string;
  url_acesso_web: string;
  usuario: string;
  senha: string;
  master: string;
  contato_master: string;
  ativo: boolean;
  id_servidor: number | null;
};

export type PainelAppInput = {
  id?: number;
  nome: string;
  tipo: string;
  url_painel: string;
  url_api: string;
  api_token: string;
  api_secret: string;
  master: string;
  contato_master: string;
  modo_acesso: "coletivo" | "individual";
  ativo: boolean;
};

export async function salvarPainelServidor(input: PainelServidorInput): Promise<{ ok: boolean; erro?: string }> {
  try {
    if (input.id) {
      await pool.query(
        `UPDATE public.painel_servidores SET
           nome = $2, tipo = $3, url_painel = $4, host_stream = $5, url_acesso_web = $6,
           usuario = $7, senha = CASE WHEN $8 = '' THEN senha ELSE $8 END,
           master = $9, contato_master = $10,
           ativo = $11, id_servidor = $12
         WHERE id = $1`,
        [
          input.id,
          input.nome.trim(),
          input.tipo.trim(),
          input.url_painel.trim() || null,
          input.host_stream.trim() || null,
          input.url_acesso_web.trim() || null,
          input.usuario.trim() || null,
          input.senha,
          input.master.trim() || null,
          input.contato_master.trim() || null,
          input.ativo,
          input.id_servidor ?? null,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO public.painel_servidores
           (nome, tipo, url_painel, host_stream, url_acesso_web, usuario, senha, master, contato_master, ativo, id_servidor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          input.nome.trim(),
          input.tipo.trim(),
          input.url_painel.trim() || null,
          input.host_stream.trim() || null,
          input.url_acesso_web.trim() || null,
          input.usuario.trim() || null,
          input.senha || null,
          input.master.trim() || null,
          input.contato_master.trim() || null,
          input.ativo,
          input.id_servidor ?? null,
        ]
      );
    }
    revalidatePath("/conexoes");
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido." };
  }
}

export async function salvarPainelApp(input: PainelAppInput): Promise<{ ok: boolean; erro?: string }> {
  try {
    if (input.id) {
      await pool.query(
        `UPDATE public.painel_apps SET
           nome = $2, tipo = $3, url_painel = $4, url_api = $5,
           api_token = CASE WHEN $6 = '' THEN api_token ELSE $6 END,
           api_secret = CASE WHEN $7 = '' THEN api_secret ELSE $7 END,
           master = $8, contato_master = $9, modo_acesso = $10, ativo = $11
         WHERE id = $1`,
        [
          input.id,
          input.nome.trim(),
          input.tipo.trim(),
          input.url_painel.trim() || null,
          input.url_api.trim() || null,
          input.api_token,
          input.api_secret,
          input.master.trim() || null,
          input.contato_master.trim() || null,
          input.modo_acesso,
          input.ativo,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO public.painel_apps
           (nome, tipo, url_painel, url_api, api_token, api_secret, master, contato_master, modo_acesso, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          input.nome.trim(),
          input.tipo.trim(),
          input.url_painel.trim() || null,
          input.url_api.trim() || null,
          input.api_token || null,
          input.api_secret || null,
          input.master.trim() || null,
          input.contato_master.trim() || null,
          input.modo_acesso,
          input.ativo,
        ]
      );
    }
    revalidatePath("/conexoes");
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido." };
  }
}
