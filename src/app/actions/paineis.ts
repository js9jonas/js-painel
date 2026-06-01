"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type PainelServidorInput = {
  id?: number;
  nome: string;
  tipo: string;
  url_painel: string;
  url_api: string;
  usuario: string;
  senha: string;
  master: string;
  contato_master: string;
  padrao_usuario: string;
  padrao_senha: string;
  ativo: boolean;
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
           nome = $2, tipo = $3, url_painel = $4, url_api = $5,
           usuario = $6, senha = CASE WHEN $7 = '' THEN senha ELSE $7 END,
           master = $8, contato_master = $9,
           padrao_usuario = NULLIF($10, ''), padrao_senha = NULLIF($11, ''),
           ativo = $12
         WHERE id = $1`,
        [
          input.id,
          input.nome.trim(),
          input.tipo.trim(),
          input.url_painel.trim() || null,
          input.url_api.trim() || null,
          input.usuario.trim() || null,
          input.senha,
          input.master.trim() || null,
          input.contato_master.trim() || null,
          input.padrao_usuario.trim(),
          input.padrao_senha.trim(),
          input.ativo,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO public.painel_servidores
           (nome, tipo, url_painel, url_api, usuario, senha, master, contato_master, padrao_usuario, padrao_senha, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),NULLIF($10,''),$11)`,
        [
          input.nome.trim(),
          input.tipo.trim(),
          input.url_painel.trim() || null,
          input.url_api.trim() || null,
          input.usuario.trim() || null,
          input.senha || null,
          input.master.trim() || null,
          input.contato_master.trim() || null,
          input.padrao_usuario.trim(),
          input.padrao_senha.trim(),
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
