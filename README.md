# JS Painel — Novas funcionalidades

## Arquivos novos (adicionar ao projeto)

src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← ATUALIZADO (nav + Planos + Pagamentos)
│   │   ├── planos/
│   │   │   └── page.tsx            ← NOVO
│   │   └── pagamentos/
│   │       └── page.tsx            ← NOVO
│   └── actions/
│       ├── clientes.ts             ← NOVO (updateCliente)
│       ├── contatos.ts             ← NOVO (addContato, updateContato, deleteContato)
│       ├── planos.ts               ← NOVO (createPlano, updatePlano)
│       └── pagamentos.ts           ← NOVO (updatePagamento, createPagamento)
├── lib/
│   ├── planos.ts                   ← NOVO
│   ├── pagamentos.ts               ← NOVO
│   └── contatos.ts                 ← NOVO
└── components/
    ├── clientes/
    │   ├── RowActions.tsx          ← ATUALIZADO (usa EditClienteModal)
    │   └── EditClienteModal.tsx    ← NOVO
    ├── planos/
    │   ├── PlanosClient.tsx        ← NOVO
    │   └── PlanoModal.tsx          ← NOVO
    ├── pagamentos/
    │   ├── PagamentosClient.tsx    ← NOVO
    │   └── PagamentoModal.tsx      ← NOVO
    └── contatos/
        └── ContatosManager.tsx     ← NOVO

---

## Patch manual em clientes/page.tsx

No arquivo src/app/(dashboard)/clientes/page.tsx, adicione a prop `nome`:

  <RowActions
    idCliente={c.id_cliente}
    nome={c.nome}                ← ADICIONAR ESTA LINHA
    telefone={c.telefone ?? null}
    observacao={c.observacao ?? null}
  />

---

## Como usar o ContatosManager na página de detalhe (/clientes/[id])

1. Importe no topo da page.tsx:
   import { getContatosByClienteId } from "@/lib/contatos";
   import ContatosManager from "@/components/contatos/ContatosManager";

2. Busque os contatos junto com os outros dados:
   const contatos = await getContatosByClienteId(id);

3. Adicione na seção desejada da página (é um Client Component):
   <ContatosManager
     idCliente={id}
     contatos={contatos}
     onSaved={() => router.refresh()}  ← se for Server Component, use revalidatePath
   />

   ⚠️ Como a page.tsx de detalhe é Server Component, envolva o ContatosManager
   num wrapper client component ou adicione "use client" + useRouter na page.
