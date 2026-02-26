"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function renovarValidadeApp(id_app_registro: string) {
  await pool.query(
    `UPDATE aplicativos
     SET validade = CASE
           WHEN validade < NOW()
             THEN NOW() + INTERVAL '1 year'
           ELSE validade + INTERVAL '1 year'
         END
     WHERE id_app_registro = $1`,
    [id_app_registro]
  );
  revalidatePath("/alertas");
}