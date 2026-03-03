"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function adicionarIndicacao(
  id_parceiro: string,
  id_indicado: string,
  bonificacao: "aberta" | "cortesia" | "comissao"
): Promise<void> {
  await pool.query(
    `INSERT INTO public.indicacoes (id_parceiro, id_indicado, bonificacao, criado_em)
     VALUES ($1::bigint, $2::bigint, $3, NOW())`,
    [id_parceiro, id_indicado, bonificacao]
  );
  revalidatePath(`/clientes/${id_parceiro}`);
}

export async function editarBonificacao(
  id_indicacao: string,
  bonificacao: "aberta" | "cortesia" | "comissao",
  id_parceiro: string
): Promise<void> {
  await pool.query(
    `UPDATE public.indicacoes SET bonificacao = $1 WHERE id_indicacao = $2::bigint`,
    [bonificacao, id_indicacao]
  );
  revalidatePath(`/clientes/${id_parceiro}`);
}

export async function removerIndicacao(
  id_indicacao: string,
  id_parceiro: string
): Promise<void> {
  await pool.query(
    `DELETE FROM public.indicacoes WHERE id_indicacao = $1::bigint`,
    [id_indicacao]
  );
  revalidatePath(`/clientes/${id_parceiro}`);
}

export async function definirParceiro(
  id_indicado: string,
  id_parceiro: string
): Promise<void> {
  await pool.query(
    `INSERT INTO public.indicacoes (id_parceiro, id_indicado, bonificacao, criado_em)
     VALUES ($1::bigint, $2::bigint, 'aberta', NOW())`,
    [id_parceiro, id_indicado]
  );
  revalidatePath(`/clientes/${id_indicado}`);
}