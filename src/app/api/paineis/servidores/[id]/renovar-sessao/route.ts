export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { loginClub } from "@/lib/painel-adapters/club";
import type { ServidorCredenciais, SaveSession } from "@/lib/painel-adapters/types";

type JobState = { done: false } | { done: true; ok: true } | { done: true; ok: false; erro: string };

// In-memory job store — ok para single instance (Easypanel não é serverless)
const jobs = new Map<string, JobState>();

async function executarLogin(idPainel: number, jobId: string) {
  const { rows } = await pool.query<ServidorCredenciais & { painel_tipo: string }>(
    `SELECT tipo AS painel_tipo, usuario AS painel_usuario, senha AS painel_senha,
            session_cookie, session_expiry, api_token, api_secret
     FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );

  if (!rows.length || rows[0].painel_tipo !== "club") {
    jobs.set(jobId, { done: true, ok: false, erro: "Painel não encontrado ou tipo inválido." });
    return;
  }

  const creds = rows[0] as unknown as ServidorCredenciais;
  const onSaveSession: SaveSession = async (cookie, expiry) => {
    await pool.query(
      `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
      [cookie, expiry ?? null, idPainel]
    );
  };

  try {
    await loginClub(creds, onSaveSession);
    jobs.set(jobId, { done: true, ok: true });
  } catch (err: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: err instanceof Error ? err.message : String(err) });
  }

  // Limpa o job após 15 minutos
  setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
}

// POST — inicia o job em background e retorna imediatamente
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) {
    return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  }

  const jobId = `club-${idPainel}-${Date.now()}`;
  jobs.set(jobId, { done: false });

  // Fire and forget — não bloqueia a resposta HTTP
  executarLogin(idPainel, jobId).catch(() => {});

  return NextResponse.json({ jobId, status: "em_andamento" });
}

// GET — verifica o status do job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
