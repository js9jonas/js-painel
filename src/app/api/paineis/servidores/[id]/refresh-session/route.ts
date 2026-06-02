export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { pool } from "@/lib/db";

const execFileAsync = promisify(execFile);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) {
    return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  }

  // Busca credenciais do painel
  const { rows } = await pool.query(
    `SELECT tipo, usuario, senha FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  if (!rows.length) {
    return NextResponse.json({ erro: "Painel não encontrado." }, { status: 404 });
  }
  const { tipo, usuario, senha } = rows[0];

  if (tipo !== "uniplay") {
    return NextResponse.json({ erro: `refresh-session não suportado para tipo "${tipo}".` }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), "src", "scripts", "uniplay_login.py");
  const input = JSON.stringify({ usuario, senha });

  let resultado: { ok: boolean; token?: string; cryptPass?: string; error?: string; body?: string; data?: unknown };
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath], {
      input,
      timeout: 20_000,
      encoding: "utf8",
    } as any);
    resultado = JSON.parse((stdout as string).trim());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao executar script.";
    return NextResponse.json({ erro: msg }, { status: 500 });
  }

  if (!resultado.ok || !resultado.token) {
    return NextResponse.json({
      erro: resultado.error ?? "Login falhou.",
      detalhe: resultado.body ?? resultado.data,
    });
  }

  const sessionJson = JSON.stringify({ token: resultado.token, cryptPass: resultado.cryptPass });
  const expiresAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // 5.5h

  await pool.query(
    `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
    [sessionJson, expiresAt, idPainel]
  );

  return NextResponse.json({ ok: true, mensagem: "Sessão renovada com sucesso.", expira: expiresAt });
}
