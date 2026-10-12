export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { criarServidor, listarServidores, migrarServidor, recontarServidor, type AppAcessoServidor } from "@/lib/painel-adapters/appacesso";
import type { PainelApp } from "@/lib/app-painel";
import { painelAppPorId, sessaoPainelApp } from "@/lib/app-painel";

// "Servidores" do painel de app (Fun Play / Lazer Play / Core Player): cada um guarda o host das listas
// e permite a migração em massa (troca o host de todas as listas daquele servidor com 1 chamada).
// GET lista · POST { acao: "criar", name, host, code? } · POST { acao: "migrar", id, host, replace, confirmado }

const HOST_RE = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/;

function normalizarHost(h: unknown): string | null {
  const host = String(h ?? "").trim().replace(/\/+$/, "");
  return HOST_RE.test(host) ? host : null;
}

async function abrirPainel(idParam: string) {
  const id = parseInt(idParam, 10);
  if (isNaN(id)) throw new Error("ID inválido.");
  const painel = await painelAppPorId(id);
  if (!painel) throw new Error("Esse painel não tem servidores de lista (só Fun Play, Lazer Play e Core Player).");
  const token = await sessaoPainelApp(painel);
  return { painel, token };
}

/** Reconta e relê (a contagem do painel não se atualiza sozinha depois de migrar/cadastrar). */
async function recontarTodos(painel: PainelApp, token: string): Promise<AppAcessoServidor[]> {
  const lista = await listarServidores(painel.cfg, token);
  for (const s of lista) await recontarServidor(painel.cfg, token, Number(s.id)).catch(() => {});
  return listarServidores(painel.cfg, token);
}

function mensagemPainel(resp: unknown): string | null {
  return typeof resp === "string" && resp.trim() ? resp.trim() : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const { painel, token } = await abrirPainel((await params).id);
    const servidores = await recontarTodos(painel, token);
    return NextResponse.json({ painel: painel.nome, servidores });
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não deu pra ler os servidores do painel." }, { status: 422 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const corpo = await req.json().catch(() => ({}));
  const acao = corpo?.acao;
  const host = normalizarHost(corpo?.host);
  if (!host) return NextResponse.json({ erro: "Endereço inválido. Use o formato http://dominio.com" }, { status: 400 });

  try {
    const { painel, token } = await abrirPainel((await params).id);

    if (acao === "criar") {
      const name = String(corpo?.name ?? "").trim();
      const code = String(corpo?.code ?? "").trim();
      if (!name) return NextResponse.json({ erro: "Informe o nome do servidor." }, { status: 400 });
      const existentes = await listarServidores(painel.cfg, token);
      const igual = existentes.find((s) => s.host.replace(/\/+$/, "").toLowerCase() === host.toLowerCase());
      if (igual) return NextResponse.json({ erro: `Já existe o servidor "${igual.name}" com esse endereço.` }, { status: 409 });

      const resp = await criarServidor(painel.cfg, token, { host, name, code: code || undefined });
      await recontarTodos(painel, token).catch(() => []);
      await auditar(`Servidor de lista cadastrado no painel ${painel.nome}: ${name} (${host})`, null, { painel: painel.id, name, host, code: code || null });
      return NextResponse.json({ ok: true, mensagem: mensagemPainel(resp) });
    }

    if (acao === "migrar") {
      const id = Number(corpo?.id);
      const replace = corpo?.replace !== false;
      if (corpo?.confirmado !== true) return NextResponse.json({ erro: "Confirme a migração." }, { status: 400 });
      const atual = (await listarServidores(painel.cfg, token)).find((s) => Number(s.id) === id);
      if (!atual) return NextResponse.json({ erro: "Servidor não encontrado no painel. Recarregue a lista." }, { status: 404 });
      if (atual.host.replace(/\/+$/, "").toLowerCase() === host.toLowerCase()) {
        return NextResponse.json({ erro: "O servidor já está com esse endereço." }, { status: 400 });
      }

      const resp = await migrarServidor(painel.cfg, token, { id, host, replace });
      const depois = (await recontarTodos(painel, token).catch(() => [])).find((s) => Number(s.id) === id) ?? null;
      await auditar(
        `Servidor ${atual.name} do painel ${painel.nome} migrado de ${atual.host} para ${host} (${replace ? "listas migradas junto" : "listas NÃO migradas"})`,
        { host: atual.host, device_count: atual.device_count },
        { host, replace, host_no_painel: depois?.host ?? null, device_count: depois?.device_count ?? null, resposta: mensagemPainel(resp) }
      );
      return NextResponse.json({ ok: true, mensagem: mensagemPainel(resp), servidor: depois });
    }

    return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "O painel recusou a operação." }, { status: 422 });
  }
}

async function auditar(descricao: string, antes: Record<string, unknown> | null, depois: Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await registrarAudit(client, { tipo: "servidor_app", id_cliente: null, descricao, dados_antes: antes, dados_depois: depois });
  } catch {
    // auditoria nunca derruba a operação (ela já aconteceu no painel)
  } finally {
    client.release();
  }
}
