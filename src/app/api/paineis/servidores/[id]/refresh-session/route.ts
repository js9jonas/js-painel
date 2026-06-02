export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { pool } from "@/lib/db";

function runPython(scriptPath: string, stdinData: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("python3", [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.stdin.write(stdinData);
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr: stderr + "\n[timeout]", code: -1 });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + "\n" + err.message, code: -1 });
    });
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) {
    return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  }

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
  const { stdout, stderr, code } = await runPython(
    scriptPath,
    JSON.stringify({ usuario, senha }),
    25_000
  );

  if (!stdout.trim()) {
    return NextResponse.json(
      { erro: "Script não produziu saída.", stderr: stderr.slice(0, 1000), code },
      { status: 500 }
    );
  }

  let resultado: { ok: boolean; token?: string; cryptPass?: string; error?: string; body?: string; data?: unknown };
  try {
    resultado = JSON.parse(stdout.trim());
  } catch {
    return NextResponse.json(
      { erro: "Saída do script inválida.", stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) },
      { status: 500 }
    );
  }

  if (!resultado.ok || !resultado.token) {
    return NextResponse.json({
      erro: resultado.error ?? "Login falhou.",
      detalhe: resultado.body ?? resultado.data,
      stderr: stderr.slice(0, 500) || undefined,
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
