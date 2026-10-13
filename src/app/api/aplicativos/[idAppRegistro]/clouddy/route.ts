export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { trocarListaClouddy, trocarPinClouddy, trocarSenhaClouddy } from "@/lib/clouddy";
import { PIN_RE } from "@/lib/painel-adapters/clouddy";

// Ações na conta Clouddy do cliente (13/10/2026): trocar a lista (TV e VOD juntas), o PIN e a senha
// (a senha é trocada em /aplicativos, ao passar a conta para outro cliente).
// Em segundo plano: cada login resolve um captcha (até ~1,5 min) e a troca de senha confirma entrando de novo.

type JobState = { done: false; etapa: string } | { done: true; ok: true; mensagem: string } | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

/** Senha da conta Clouddy: sem espaços, 6 a 64 caracteres (o site não diz o limite; evita erro bobo de digitação). */
const SENHA_MIN = 6;
const SENHA_MAX = 64;

async function executar(id: number, corpo: { acao: string; id_conta?: number; url?: string; nova_senha?: string; pin?: string }, jobId: string) {
  try {
    if (corpo.acao === "lista") {
      jobs.set(jobId, { done: false, etapa: "Entrando na conta e gravando a lista em TV e VOD…" });
      const r = await trocarListaClouddy(id, corpo.url ? { url: corpo.url } : { idConta: Number(corpo.id_conta) });
      jobs.set(jobId, { done: true, ok: true, mensagem: `Lista da conta ${r.usuario} gravada em TV e VOD.` });
    } else if (corpo.acao === "pin") {
      jobs.set(jobId, { done: false, etapa: "Entrando na conta e trocando o PIN…" });
      await trocarPinClouddy(id, corpo.pin!);
      jobs.set(jobId, { done: true, ok: true, mensagem: `PIN trocado para ${corpo.pin}.` });
    } else {
      jobs.set(jobId, { done: false, etapa: "Trocando a senha e conferindo o login com ela…" });
      await trocarSenhaClouddy(id, corpo.nova_senha!);
      jobs.set(jobId, { done: true, ok: true, mensagem: "Senha trocada e conferida. Já está salva no aplicativo." });
    }
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Não deu pra concluir no Clouddy." });
  } finally {
    setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
  }
}

// POST { acao: "lista", id_conta } | { acao: "lista", url } (m3u colado) | { acao: "pin", pin } | { acao: "senha", nova_senha }
export async function POST(req: NextRequest, { params }: { params: Promise<{ idAppRegistro: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const id = parseInt((await params).idAppRegistro, 10);
  const corpo = await req.json().catch(() => ({}));
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Aplicativo inválido." }, { status: 400 });
  if (corpo.acao === "lista") {
    const temUrl = typeof corpo.url === "string" && corpo.url.trim() !== "";
    if (!temUrl && (!Number.isInteger(Number(corpo.id_conta)) || Number(corpo.id_conta) <= 0)) {
      return NextResponse.json({ erro: "Escolha a conta ou cole o link m3u da lista." }, { status: 400 });
    }
  } else if (corpo.acao === "senha") {
    const s = typeof corpo.nova_senha === "string" ? corpo.nova_senha : "";
    if (s.length < SENHA_MIN || s.length > SENHA_MAX || /\s/.test(s)) {
      return NextResponse.json({ erro: `A senha precisa ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres, sem espaços.` }, { status: 400 });
    }
  } else if (corpo.acao === "pin") {
    if (typeof corpo.pin !== "string" || !PIN_RE.test(corpo.pin)) return NextResponse.json({ erro: "O PIN precisa ter 4 números." }, { status: 400 });
  } else {
    return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
  }
  // Uma ação por vez no mesmo aplicativo (evita dois logins/trocas simultâneos na mesma conta)
  for (const [k, v] of jobs) if (k.startsWith(`clouddy-${id}-`) && !v.done) return NextResponse.json({ erro: "Já tem uma ação em andamento nessa conta." }, { status: 409 });
  const jobId = `clouddy-${id}-${Date.now()}`;
  jobs.set(jobId, { done: false, etapa: "Iniciando…" });
  executar(id, corpo, jobId).catch(() => {});
  return NextResponse.json({ jobId });
}

// GET ?jobId= — andamento
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const job = jobs.get(new URL(req.url).searchParams.get("jobId") ?? "");
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
