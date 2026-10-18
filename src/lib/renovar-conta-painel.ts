// src/lib/renovar-conta-painel.ts — renova 1 mês de uma conta IPTV no painel do fornecedor.
// Usado pela rota POST /api/paineis/servidores/[id]/renovar (botão Renovar e "Renovar via API" em
// /alertas) e pela renovação automática do Pix pelo link (src/lib/pix-renovacao.ts). Mesmo código
// nos dois caminhos: as travas dos adapters (FAST/Central: não renova conta com mais de 25 dias) e
// a migração de painel descontinuado valem pra todos.
import { getAdapterPainel } from "@/lib/painel-adapters";
import { pool } from "@/lib/db";
import { migrarContaPainel } from "@/lib/migrar-painel";
import { registrarAudit } from "@/lib/audit";

export type ResultadoContaPainel =
  | { ok: true; novoVencimento: string | null; mensagem: string; migrado?: boolean }
  | { ok: false; erro: string; status: number };

export async function renovarContaNoPainel(
  idPainel: number,
  usuario: string,
  opcoes: { usuarioAuditoria?: string } = {}
): Promise<ResultadoContaPainel> {
  // Painel marcado pra descontinuar (ex: CLUB antigo → CLUB novo, ver
  // project_club_migracao_painel): em vez de renovar aqui, migra pro painel de destino
  // automaticamente. Cobre o clique manual "Renovar via API" (/alertas), a renovação ao salvar
  // assinatura (RenovarAssinatura.tsx) e a renovação automática do Pix — todos passam por aqui.
  const { rows: painelRows } = await pool.query<{ migrar_para_id: number | null }>(
    `SELECT migrar_para_id FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  const migrarParaId = painelRows[0]?.migrar_para_id ?? null;

  if (migrarParaId) {
    const { rows: contaRows } = await pool.query<{ id_conta: number }>(
      `SELECT id_conta FROM public.contas WHERE id_painel_servidor = $1 AND usuario = $2 AND removido_em IS NULL LIMIT 1`,
      [idPainel, usuario]
    );
    const idConta = contaRows[0]?.id_conta;
    if (!idConta) {
      return { ok: false, erro: `Conta "${usuario}" não encontrada neste painel pra migrar.`, status: 404 };
    }

    const resultado = await migrarContaPainel(idConta, migrarParaId);
    if (!resultado.ok) {
      return { ok: false, erro: resultado.erro, status: resultado.status };
    }
    return {
      ok: true,
      migrado: true,
      novoVencimento: resultado.vencimento ?? null,
      mensagem: resultado.vencimento
        ? `Migrado pro painel novo — válido até ${resultado.vencimento.split("-").reverse().join("/")}`
        : "Migrado pro painel novo com sucesso.",
    };
  }

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainel);
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : "Adapter indisponível.", status: 400 };
  }

  try {
    const resultado = await adapter.renovar(usuario, 1);

    if (!resultado.ok) {
      return { ok: false, erro: resultado.erro ?? "Falha ao renovar.", status: 422 };
    }

    if (resultado.novoVencimento) {
      await pool.query(
        `UPDATE public.contas
         SET vencimento_real_painel = $1, status_conta = 'ok'
         WHERE id_painel_servidor = $2 AND usuario = $3`,
        [resultado.novoVencimento, idPainel, usuario]
      );
    }

    // Renovação no painel gasta crédito: vai pro histórico com usuário da sessão (regra do audit_log).
    // Sem isso, a 2ª renovação da Marta (ete21786, 17/10/2026) só apareceu pelo log do Traefik, sem a conta.
    if (!resultado.aviso) {
      const client = await pool.connect();
      try {
        const { rows: ct } = await client.query<{ id_cliente: string | null; id_assinatura: string | null }>(
          `SELECT a.id_cliente::text, ct.id_assinatura::text
             FROM public.contas ct LEFT JOIN public.assinaturas a ON a.id_assinatura = ct.id_assinatura
            WHERE ct.id_painel_servidor = $1 AND ct.usuario = $2 AND ct.removido_em IS NULL LIMIT 1`,
          [idPainel, usuario]
        );
        await registrarAudit(client, {
          tipo: "renovacao",
          id_cliente: ct[0]?.id_cliente ?? null,
          id_assinatura: ct[0]?.id_assinatura ?? null,
          descricao: `Conta ${usuario}: renovada 1 mês no painel`,
          dados_depois: { usuario, id_painel_servidor: idPainel, vencimento_painel: resultado.novoVencimento ?? null },
          usuario: opcoes.usuarioAuditoria,
        });
      } catch (e) {
        console.error("[renovar] falha ao gravar audit_log:", e instanceof Error ? e.message : e);
      } finally {
        client.release();
      }
    }

    return {
      ok: true,
      novoVencimento: resultado.novoVencimento ?? null,
      mensagem: resultado.aviso
        ? `${resultado.aviso}${resultado.novoVencimento ? ` Válido até ${resultado.novoVencimento.split("-").reverse().join("/")}.` : ""}`
        : resultado.novoVencimento
        ? `Renovado até ${resultado.novoVencimento.split("-").reverse().join("/")}`
        : "Renovação solicitada com sucesso.",
    };
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao renovar.", status: 422 };
  }
}
