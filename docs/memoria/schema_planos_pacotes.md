---
name: schema-planos-pacotes
description: Estrutura definitiva de planos e pacotes do js-painel após migração de 08/06/2026
metadata: 
  node_type: memory
  type: project
  originSessionId: 72536f4a-5593-446c-896d-bc089f992a7f
---

## Tabela `public.planos`

Schema: `id_plano, tipo, telas, meses, valor, descricao`

### Tipos existentes (após migração 08/06/2026)

| Tipo | Telas | Períodos (meses) | Observação |
|---|---|---|---|
| Padrão | 1–4 | 1, 3, 6, 12 | 16 planos |
| Padrão | 5 | 1 | R$125 fixo (id=31) |
| Padrão | 6 | 1 | R$150 fixo (id=32) |
| Promo | 1–4 | 1, 3, 6, 12 | 16 planos |
| Especial | 1–4 | 1, 3, 6, 12 | 16 planos |
| VIP | 1–4 | 1, 3, 6, 12 | 16 planos |
| Slim | 1–4 | 1, 3, 6, 12 | 16 planos |
| Cortesia | 1–4 | 1 (mensal) | valor=0 |

Total: 86 planos. Telas 5 e 6 têm preço único (R$25/tela) sem distinção de tipo ou período.

### Tabela de valores (1–4 telas)

| Telas | Padrão | Promo | Especial | VIP | Slim |
|---|---|---|---|---|---|
| 1T mensal | 35,00 | 34,90 | 30,00 | 25,00 | 20,00 |
| 1T trimestral | 90,00 | 89,90 | 80,00 | 75,00 | 60,00 |
| 1T semestral | 170,00 | 169,90 | 160,00 | 150,00 | 120,00 |
| 1T anual | 297,00 | 296,90 | 240,00 | 300,00 | 240,00 |
| 2T mensal | 60,00 | 59,90 | 50,00 | 40,00 | 40,00 |
| 2T trimestral | 170,00 | 169,90 | 150,00 | 150,00 | 120,00 |
| 2T semestral | 330,00 | 329,90 | 300,00 | 300,00 | 240,00 |
| 2T anual | 590,00 | 589,90 | 600,00 | 600,00 | 480,00 |
| 3T mensal | 85,00 | 84,90 | 75,00 | 70,00 | 60,00 |
| 3T trimestral | 225,00 | 224,90 | 225,00 | 210,00 | 180,00 |
| 3T semestral | 430,00 | 429,90 | 550,00 | 420,00 | 360,00 |
| 3T anual | 810,00 | 809,90 | 1100,00 | 840,00 | 720,00 |
| 4T mensal | 100,00 | 99,90 | 100,00 | 100,00 | 80,00 |
| 4T trimestral | 300,00 | 299,90 | 300,00 | 300,00 | 240,00 |
| 4T semestral | 590,00 | 589,90 | 590,00 | 590,00 | 480,00 |
| 4T anual | 1180,00 | 1179,80 | 1180,00 | 1180,00 | 960,00 |

## Tabela `public.pacote`

Schema: `id_pacote, contrato, telas` (sem `consumo_servidor` — tabela deletada em 08/06/2026)

6 pacotes ativos: 1 Tela, 2 Telas, 3 Telas, 4 Telas, 5 Telas, 6 Telas.

**Why:** Migração consolidou de ~50 pacotes por nome de servidor para 6 por quantidade de telas, e de 37 planos heterogêneos para 6 tipos padronizados.

**How to apply:** Ao sugerir plano/pacote para uma assinatura, usar apenas esses 6 tipos e as telas como critério. Telas 5+ têm preço único independente de tipo/período.
