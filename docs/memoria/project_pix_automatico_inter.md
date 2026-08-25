---
name: project-pix-automatico-inter
description: "Pix Automático (Banco Inter) para renovação recorrente — ❌ removido do projeto js-painel em 22/07/2026 a pedido do Jonas (não só pausado). Ver seção final antes de reconsiderar retomar."
metadata: 
  node_type: memory
  type: project
  originSessionId: e82f1935-7469-410e-8ef0-8a549b04f5ba
  modified: 2026-07-23T01:28:24.912Z
---

## ❌ Removido do projeto (22/07/2026)

Jonas pediu pra remover tudo — código incluído — desde que não afetasse nada que já funciona. Confirmado antes de remover que **nada disso tinha sido commitado no git nem aplicado no banco** (tabelas `pix_recorrencias`/`whatsapp_estado_conversa` e coluna `clientes.cpf_cnpj` não existem), então foi uma limpeza limpa de working tree, sem rollback nenhum necessário:

- Revertido via `git checkout`: `src/lib/auto-resposta-suporte.ts` (volta a mandar a chave PIX manual, comportamento original) e `src/proxy.ts` (removida a whitelist de `/api/inter/webhook-rec`)
- Apagados: `sql/004_pix_automatico.sql` (+rollback), `src/lib/inter/` inteiro, `src/lib/pix-automatico.ts`, `src/app/api/inter/`, `src/app/api/debug/inter-teste/`
- Removidas do `.env.local`: `INTER_CERT_BASE64`, `INTER_KEY_BASE64`, `INTER_WEBHOOK_TOKEN` (mantido `INTERNAL_API_TOKEN` — usado por outras rotas, não é específico do Pix)
- **Não mexido:** `undici` em `package.json` (tinha sido commitado num commit não relacionado de upgrade do Next.js/drizzle, não era exclusivo do Pix — confirmado via `git log -S`), `next-env.d.ts` (auto-gerado)

Se for retomar no futuro, o histórico abaixo (achado técnico da Jornada 1 inviável, recomendação de ir pra Jornada 2/QR Code) continua válido como ponto de partida — só que **todo o código precisa ser reescrito do zero**, nada disso existe mais no working tree.

---

## Objetivo

Substituir o botão "Automático mensal" (hoje placeholder em `auto-resposta-suporte.ts`, só manda a chave PIX manual) por débito recorrente de verdade via **Pix Automático** do Banco Inter — cliente autoriza uma vez, cobrança mensal acontece sozinha.

Plano completo (contexto, decisões técnicas, todos os arquivos) está salvo em `/home/jonas/.claude/plans/cozy-sleeping-hanrahan.md`.

**Escopo desta etapa** (decidido com o Jonas, 08/07/2026): só convite + acompanhar aprovação via webhook. Cron de cobrança mensal automática fica pra depois. Sem notificação automática de "aprovado" no MVP (não há template Meta aprovado pra isso). Teste ponta a ponta planejado com a própria chave Pix do Jonas no cliente de teste "JS Contas" (id 2573, tel 555194515880) antes de qualquer cliente real.

## ⚠️ Achado crítico (08/07/2026) — muda a abordagem

**Jornada 1 (convite via API pedindo só a chave Pix) é tecnicamente inviável.** Testei contra a API real do Inter (`consultarChavePix` numa rota de debug) e confirmei:
- **Não existe endpoint de consulta de chave Pix (DICT) pro lado recebedor** — confirmado tanto pelo 404 real do Inter quanto por discussões da comunidade Efí: o Bacen não expõe essa consulta por segurança (chave pode mudar de dono a qualquer momento).
- O schema oficial do Bacen (`SolicRecBase.destinatario`, lido direto do `openapi.yaml` do repo `bacen/pix-api`) **exige** `conta` + `ispbParticipante` (+ CPF/CNPJ) — não aceita uma chave Pix crua.
- Ou seja: pra criar o convite (Jornada 1) seria preciso já saber de antemão agência/conta/banco do cliente — inviável pedir isso por WhatsApp de forma simples. Jornada 1 é pensada pra empresas que já têm esse dado (concessionárias migrando débito automático antigo já cadastrado), não pro caso do Jonas.

**Caminho recomendado (não implementado ainda, aguardando decisão do Jonas — parado em 08/07/2026 a pedido dele pra "pausar e revisar"):** migrar pra **Jornada 2 (QR Code)** — gerar QR de recorrência via `POST /pix/v2/rec` (com `loc`), mandar como imagem no WhatsApp, cliente escaneia com o app do banco dele (que resolve os dados bancários sozinho, sem o Jonas precisar saber nada de antemão). Elimina a necessidade da tabela `whatsapp_estado_conversa`/pergunta em texto livre pra esse fluxo específico. Ainda não verificado no sandbox como o Inter expõe o QR (imagem pronta vs. payload que precisa virar imagem).

## O que já está implementado (não commitado, working tree do js-painel)

**Confirmado funcionando de verdade contra a API real do Inter:** autenticação OAuth2 + mTLS (`obterAccessToken()`) — testei via `POST /api/debug/inter-teste` e retornou sucesso.

Arquivos criados/modificados:
- `sql/004_pix_automatico.sql` + `_rollback.sql` — tabelas `pix_recorrencias`, `whatsapp_estado_conversa`, `clientes.cpf_cnpj`. **Ainda não aplicado no banco** (bloqueado pelo classifier de auto mode — precisa aprovação explícita do Jonas antes de rodar DDL em produção).
- `src/lib/inter/auth.ts` — OAuth2 client_credentials + `undici.Agent` mTLS (cert/key em `Buffer`, nunca em disco). **Funciona.**
- `src/lib/inter/client.ts` — `fetchInter()` wrapper com retry em 401, parsing seguro de resposta não-JSON.
- `src/lib/inter/pix-recorrencia.ts` — `consultarChavePix` (⚠️ endpoint inventado, **não existe** — precisa ser removido/substituído no redesenho pra Jornada 2), `criarRecorrencia`, `criarSolicitacaoConfirmacao` (⚠️ payload provavelmente certo pro schema geral do Bacen, mas o uso pretendido com chave crua não se aplica mais), `consultarRecorrencia`, `cancelarSolicitacao`.
- `src/lib/inter/types.ts` — tipos TS dos payloads.
- `src/lib/pix-automatico.ts` — orquestração do fluxo (pedir chave → resolver → criar rec/solicrec) — **precisa ser redesenhado pra Jornada 2** (gerar+enviar QR em vez de pedir texto).
- `src/lib/auto-resposta-suporte.ts` — branch `'Automático mensal'` alterado pra chamar `iniciarFluxoAutomaticoMensal`; `buscarClienteEPlano()` passou a retornar também `idCliente`/`idAssinatura`.
- `src/app/api/whatsapp/webhook/route.ts` — adicionado handler fire-and-forget `processarRespostaAguardando` pra mensagens `tipo === 'text'` (parte do design de Jornada 1, pode não ser mais necessário na Jornada 2).
- `src/app/api/inter/webhook-rec/[token]/route.ts` — webhook de status de recorrência. Design: **nunca confia no payload recebido**, sempre reconsulta `consultarRecorrencia(idRec)` autenticado antes de gravar no banco (mitigação pra falta de validação mTLS na borda, que exigiria configurar client-cert auth no Traefik/Easypanel — fora do alcance de só mexer em código).
- `src/proxy.ts` — rota `/api/inter/webhook-rec` adicionada à whitelist pública.
- `src/app/api/debug/inter-teste/route.ts` — rota de teste manual (protegida por `x-internal-token`), usada pra validar a auth. Deve ser reaproveitada/adaptada pros próximos testes.
- `package.json` — `undici` adicionado como dependency explícita (necessário pro `dispatcher` com client cert no `fetch`).
- `.env.local` — adicionados `INTER_CERT_BASE64`/`INTER_KEY_BASE64` (extraídos de `~/.playwright-mcp/Inter-API-Chave-e-Certificado.zip`), `INTER_WEBHOOK_TOKEN` (gerado), `INTERNAL_API_TOKEN` (gerado, só pra dev local — produção já deve ter o dela no Easypanel).

`npm run build` e `npx tsc --noEmit` passam limpos. Os 2 erros de lint em `webhook/route.ts` são pré-existentes (não relacionados a essa feature).

## Lacunas que ainda restam (independente da mudança pra Jornada 2)

1. Nome exato dos escopos OAuth2 do Inter pra Pix Automático (usei um guess em `auth.ts`, marcado com TODO — a autenticação funcionou mas não testei se o escopo cobre de fato `rec`/`solicrec`).
2. Payload exato do webhook do Inter (`recs`/nomes de campo) — não verificado.
3. Validação mTLS do webhook na borda (Traefik/Easypanel) — pendência de infra, não de código.

## Como retomar

Ler o plano completo em `/home/jonas/.claude/plans/cozy-sleeping-hanrahan.md` pro desenho original (Jornada 1), e este arquivo pro que já foi validado/invalidado. Próximo passo real: redesenhar `pix-automatico.ts` pra Jornada 2 (QR Code) e testar geração de QR contra o sandbox/produção do Inter antes de integrar no WhatsApp.
