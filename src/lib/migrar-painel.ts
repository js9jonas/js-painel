import { pool } from "@/lib/db";
import { getAdapterPainel } from "@/lib/painel-adapters";

export type ResultadoMigracaoConta =
  | { ok: true; vencimento: string | null }
  | { ok: false; erro: string; status: number };

// Migra a conta pra outro painel do mesmo tipo (ex: CLUB antigo → CLUB novo): exclui da origem
// e recria no destino com o mesmo usuário/senha, mantendo telas/conteúdo adulto/rótulo.
// ⚠️ Se a exclusão na origem funcionar mas a criação no destino falhar, a conta fica só excluída
// (não existe em nenhum painel) — o erro retornado nesse caso inclui usuário/senha capturados
// pra permitir recriação manual imediata.
// Usada tanto pela rota dedicada (/api/contas/[id]/migrar-painel, escolha manual de destino)
// quanto pela rota de renovar (/api/paineis/servidores/[id]/renovar, destino vem de
// painel_servidores.migrar_para_id — ver reference_adapters_paineis_iptv/project_club_migracao_painel).
export async function migrarContaPainel(idConta: number, idPainelDestino: number): Promise<ResultadoMigracaoConta> {
  const { rows } = await pool.query<{ usuario: string; senha: string | null; rotulo: string | null; id_painel_servidor: number | null }>(
    `SELECT usuario, senha, rotulo, id_painel_servidor FROM public.contas WHERE id_conta = $1 AND removido_em IS NULL`,
    [idConta]
  );
  if (!rows.length) return { ok: false, erro: "Conta não encontrada.", status: 404 };

  const { usuario, senha: senhaBanco, rotulo: rotuloBanco, id_painel_servidor: idPainelOrigem } = rows[0];

  if (!idPainelOrigem) {
    return { ok: false, erro: "Conta sem painel de origem vinculado.", status: 422 };
  }
  if (idPainelOrigem === idPainelDestino) {
    return { ok: false, erro: "Painel de destino é igual ao de origem.", status: 422 };
  }

  // Exige sessão CLUB ativa nos dois lados ANTES do ponto de não-retorno (exclusão na origem).
  // Sem isso já aconteceu de a origem estar conectada, a exclusão suceder, e a criação no
  // destino falhar por sessão morta — deixando a conta órfã (não existe em nenhum painel), ver
  // docs/memoria/project_club_migracao_painel.md. getAdapterPainel() logo abaixo só confirma que
  // o painel existe e o tipo é suportado, não que a sessão está viva — por isso o check é feito
  // aqui, direto no banco. Escopo limitado a tipo='club': outros adapters usam token permanente
  // sem esse conceito de sessão expirável (ex: CENTRAL), então não devem ser bloqueados por isso.
  const { rows: sessoes } = await pool.query<{ id: number; tipo: string; session_cookie: string | null; session_expiry: Date | null }>(
    `SELECT id, tipo, session_cookie, session_expiry FROM public.painel_servidores WHERE id IN ($1, $2)`,
    [idPainelOrigem, idPainelDestino]
  );
  const MARGEM_SESSAO_MS = 5 * 60 * 1000; // mesma lógica de folga do keepalive — evita começar a migrar com a sessão prestes a cair no meio do processo
  for (const idAlvo of [idPainelOrigem, idPainelDestino]) {
    const painel = sessoes.find((s) => s.id === idAlvo);
    if (painel?.tipo !== "club") continue;
    const ativa = !!painel.session_cookie && !!painel.session_expiry
      && new Date(painel.session_expiry).getTime() - Date.now() > MARGEM_SESSAO_MS;
    if (!ativa) {
      return {
        ok: false,
        erro: `Painel CLUB ${idAlvo === idPainelOrigem ? "de origem" : "de destino"} (id ${idAlvo}) sem sessão ativa — migração abortada antes de excluir qualquer coisa. A renovação automática roda a cada 10min (ver club-keepalive.ts); tente novamente em alguns minutos.`,
        status: 409,
      };
    }
  }

  // Valida os dois adapters ANTES de mexer em qualquer coisa no painel
  let adapterOrigem, adapterDestino;
  try {
    adapterOrigem = await getAdapterPainel(idPainelOrigem);
    adapterDestino = await getAdapterPainel(idPainelDestino);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar painéis.";
    return { ok: false, erro: msg, status: 502 };
  }
  if (!adapterOrigem.deletarConta) {
    return { ok: false, erro: "Exclusão via API não suportada no painel de origem.", status: 422 };
  }
  if (!adapterDestino.criarConta) {
    return { ok: false, erro: "Criação via API não suportada no painel de destino.", status: 422 };
  }

  // Busca detalhes reais no painel de origem (senha atualizada, telas, conteúdo adulto) — o banco
  // local pode não ter tudo (ex: senha nunca importada, telas nunca sincronizadas).
  let detalhes = null;
  try {
    detalhes = adapterOrigem.obterDetalhes ? await adapterOrigem.obterDetalhes(usuario) : null;
  } catch { /* segue com o que tem no banco se a busca falhar */ }

  const senha = detalhes?.senha ?? senhaBanco;
  if (!senha) {
    return { ok: false, erro: "Conta sem senha conhecida (nem no banco, nem no painel) — importe a senha antes de migrar.", status: 422 };
  }
  const telas = detalhes?.telas ?? 1;
  const comAdultos = detalhes?.comAdultos ?? false;
  const rotulo = detalhes?.rotulo || rotuloBanco || "";

  // Ponto de não-retorno: exclui da origem
  try {
    await adapterOrigem.deletarConta(usuario);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir no painel de origem.";
    return { ok: false, erro: msg, status: 502 };
  }

  // Cria no destino
  try {
    const resultado = await adapterDestino.criarConta(usuario, senha, { meses: 1, telas, comAdultos, rotulo });
    if (!resultado.ok) {
      return {
        ok: false,
        erro: `Conta excluída da origem mas NÃO criada no destino: ${resultado.erro ?? "erro desconhecido"}. Usuário "${usuario}" / senha "${senha}" — recrie manualmente.`,
        status: 502,
      };
    }

    // contas.id_servidor é FK NOT NULL pra tabela legada public.servidores — precisa acompanhar
    // o painel novo, senão fica órfão apontando pro id_servidor do painel de origem (achado
    // 05/08/2026 testando a migração automática com celsogrom: o UPDATE só trocava
    // id_painel_servidor, deixando id_servidor desatualizado — mesmo bug já corrigido
    // manualmente antes pro Gilberto e as 5 primeiras contas, mas não replicado aqui).
    await pool.query(
      `UPDATE public.contas SET
         id_painel_servidor = $1,
         id_servidor = (SELECT id_servidor FROM public.painel_servidores WHERE id = $1),
         vencimento_real_painel = $2,
         status_conta = 'ok'
       WHERE id_conta = $3`,
      [idPainelDestino, resultado.vencimento ?? null, idConta]
    );

    return { ok: true, vencimento: resultado.vencimento ?? null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao criar no painel de destino.";
    return {
      ok: false,
      erro: `Conta excluída da origem mas NÃO criada no destino: ${msg}. Usuário "${usuario}" / senha "${senha}" — recrie manualmente.`,
      status: 502,
    };
  }
}
