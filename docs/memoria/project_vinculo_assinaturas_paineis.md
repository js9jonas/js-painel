---
name: project-vinculo-assinaturas-paineis
description: Bloqueador para automação dos adapters — vincular contas dos painéis externos às assinaturas do js-painel
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c8e4595-9821-4192-a611-31849bbc8404
---

## Problema

As assinaturas no banco (`public.assinaturas`) não têm referência às contas nos painéis externos (FunPlays, LazerPlay, SearchDefense, etc.). Sem esse vínculo, automações de renovação, verificação e sincronização são impossíveis — não se sabe qual conta renovar em qual painel.

**Why:** Jonas iniciou um levantamento manual mas o processo foi dispersado por ser muito manual e tedioso. Precisa de ferramenta para fazer o cruzamento de forma eficiente e travar os vínculos confirmados.

## O que precisa existir no banco

Nova tabela `public.painel_contas`:

```sql
CREATE TABLE public.painel_contas (
  id              SERIAL PRIMARY KEY,
  id_assinatura   BIGINT REFERENCES assinaturas(id_assinatura),
  painel          TEXT NOT NULL,  -- 'funplays', 'lazerplay', 'searchdefense', etc.
  id_externo      TEXT,           -- ID da conta no painel externo
  mac             TEXT,           -- para app panels (FunPlays, LazerPlay, SmartOne)
  login           TEXT,           -- para content panels
  senha           TEXT,
  lista_url       TEXT,
  status          TEXT DEFAULT 'pendente',  -- 'pendente', 'confirmado', 'bloqueado'
  confirmado_em   TIMESTAMP,
  criado_em       TIMESTAMP DEFAULT NOW(),
  atualizado_em   TIMESTAMP DEFAULT NOW()
);
```

## Estratégia de cruzamento automático

**Chave primária: data de vencimento. Chave secundária: similaridade de nome.**

A data de vencimento já reduz o universo para pouquíssimos candidatos por painel. O nome confirma.

### Passos
1. Adapter puxa todos os usuários do painel → grava em `painel_staging` (login, senha, nome_painel, vencimento)
2. Query cruza `painel_staging.vencimento = assinaturas.venc_contas`
3. Dentro do mesmo vencimento, usa `pg_trgm similarity(clientes.nome, staging.nome_painel)`
4. Score ≥ 0.7 → vincula automaticamente (`status = 'confirmado'`)
5. Score 0.3–0.7 → fila de revisão manual com sugestão pré-preenchida
6. Sem match → fila de revisão manual sem sugestão

### Query de cruzamento
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

SELECT
  a.id_assinatura,
  c.nome                              AS nome_local,
  s.login                             AS login_painel,
  s.nome_painel,
  s.vencimento,
  similarity(c.nome, s.nome_painel)   AS score
FROM painel_staging s
JOIN assinaturas a  ON a.venc_contas = s.vencimento::date
JOIN clientes c     ON c.id_cliente  = a.id_cliente
WHERE similarity(c.nome, s.nome_painel) > 0.3
ORDER BY s.vencimento, score DESC;
```

Estimativa: ~99% dos vínculos resolvidos automaticamente ou com uma confirmação rápida.

## Interface sugerida no js-painel

Página `/admin/vinculacao-paineis`:
- Lista assinaturas sem vínculo (`status = 'pendente'`)
- Ao lado, busca no painel externo por similaridade (nome, MAC, vencimento)
- Botão "Confirmar vínculo" → seta status para `bloqueado`
- Botão "Criar novo" → cadastra no painel se não existir

## ✅ Implementado em 02/06/2026

Não foi criada tabela nova — `contas.id_assinatura` (bigint, nullable) já existia e foi usada.

**Página:** `/conexoes/vinculacao` (IPTV → Vinculação no nav)
- Match automático: vencimento exato + similaridade pg_trgm + pacote.contrato ILIKE painel.nome
- Auto-vincular: score ≥ 70% em um clique
- Sugestão inline confirmável; busca manual por nome
- Nomes sugeridos e vinculados são hiperlinks para `/clientes/[id]`

**Página clientes/[id]:** badge `🔗 NomePainel` ao lado do pacote; subrow com usuario/senha da conta vinculada.

**Bug timezone corrigido (02/06/2026):** adapters usavam `.toISOString().slice(0,10)` → adiantava 1 dia para timestamps BRT 23:59:59. Corrigido para `.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })` em UNIPLAY, CLUB, CENTRAL, FAST.

## ✅ Desvincular e Adicionar conta em clientes/[id] (04/06/2026)

- **Botão ×** em cada conta vinculada — confirmação inline, desvíncula e registra no audit log
- **Botão "+ Conta"** em cada assinatura — abre modal com:
  - Seletor de painel (todos os painel_servidores ativos)
  - Campo de busca: filtra contas livres (`id_assinatura IS NULL`) por `usuario`, `rotulo` ou `observacao`
  - Botão "Vincular" por conta — remove da lista local imediatamente, salva vínculo no banco
- **Audit log:** novos tipos `vinculo_conta` (badge verde) e `desvinculo_conta` (badge laranja) em `HistoricoAudit`
- **Arquivos:** `src/app/actions/contasVinculo.ts`, `DesvincularContaButton.tsx`, `AdicionarContaModal.tsx`
- **Comportamento sync:** quando sync remove conta do painel, faz soft-delete (`removido_em`) mas preserva `id_assinatura` — conta some da UI mas vínculo fica no banco (intencional, para casos de sync falsa ou conta reativada)

## How to apply

Para renovação automática via adapter, verificar se `contas.id_assinatura` está preenchido. Após re-sincronizar painéis (pós-fix de timezone), rodar auto-vincular na página de vinculação.
