---
name: incident_select_nativo_linux_click_drag
description: "<select> nativo no Linux/Chrome do Jonas usa modelo GTK de clicar-e-arrastar — clique rápido abre e já 'seleciona' item errado no mouseup; trocado por componente próprio (Radix) em todo o app (31/08/2026)"
metadata:
  node_type: memory
  type: reference
---

# Incidente: `<select>` nativo "seleciona sozinho" no Linux

**Sintoma reportado (31/08/2026):** no modal de editar assinatura, ao clicar no campo Status pra abrir as opções, a lista fechava imediatamente selecionando um item, como se o próprio clique de abrir já tivesse escolhido algo antes de a lista aparecer.

## Causa raiz

Não era bug de nenhum componente específico — era comportamento **nativo do navegador no Linux**. O Chrome (via GTK) implementa o `<select>` nativo com o modelo de combobox do GTK: **clicar-e-arrastar-e-soltar** escolhe a opção (igual um menu nativo do SO), diferente do modelo Windows/Mac de **clique pra abrir + clique separado pra escolher**. Um clique rápido (aperta e solta sem arrastar) no Linux abre e já interpreta o mouseup como "escolher a opção sob o cursor", fechando a lista instantaneamente.

Confirmado com o Jonas: o problema acontecia em **vários selects/modais**, não só nesse — ou seja, era sistêmico (qualquer `<select>` nativo do app), não um bug isolado de código.

## Correção (31/08/2026)

Trocado o `<select>` nativo por um componente próprio em **todo o app** (16 arquivos, 29 selects) — `src/components/ui/select.tsx`, usando `@radix-ui/react-select` (adicionado como dependência nova). Esse componente é renderizado inteiramente em JS (não delega ao combobox nativo do SO), então o modelo de interação é sempre clique-pra-abrir + clique-pra-escolher, igual em qualquer SO/navegador.

**API do componente** — pensada pra ser um drop-in do `<select>` controlado que já existia em todo lugar:

```tsx
<Select
  value={status}
  onChange={setStatus}
  className={selectClass}
  options={STATUS_OPTIONS.map((s) => ({ value: s, label: ... }))}
/>
```

- `value`/`onChange` = modo controlado (a maioria dos casos).
- `defaultValue` (sem `value`) = modo não-controlado, pra selects dentro de `<form method="GET">` que dependem de submissão nativa do navegador (ex: filtro de `/pagamentos`, campo `pageSize`) — o Radix cria um `<select>` nativo oculto espelhando o valor quando `name` é passado, então `FormData`/GET continuam funcionando.
- `value=""` continua significando "nenhum selecionado" / "— Nenhum —", igual o `<select>` nativo — internamente troca por um sentinela (`__vazio__`) porque o Radix não aceita `SelectItem` com `value=""`. Isso é transparente pra quem usa o componente.
- `onBlur`/`onKeyDown` são repassados pro trigger — necessário pro caso de edição inline em `PagamentosClient.tsx` (salva no blur, Enter confirma, Escape cancela). No Enter, o call site precisa chamar `e.preventDefault()` antes da própria lógica, senão o Radix intercepta e abre o dropdown em vez de deixar o Enter "vazar" pro handler customizado.

**Visual:** o trigger herda a mesma classe (`rounded-xl border-zinc-300 ...`) que os `<select>` nativos já usavam — sem mudança visual pretendida. Exceção conhecida: `player/page.tsx` usa paleta `dark:` (gray, não zinc) pro trigger (funciona via merge de classes), mas o painel de opções do componente (`SelectPrimitive.Content`) é fixo claro (bg-white) — se o Jonas usar essa página com o SO em dark mode, o painel de opções abre claro mesmo com o trigger escuro. Cosmético, não afeta a correção do clique. Ajustar se incomodar na prática.

## Se aparecer de novo

Se um novo `<select>` nativo for adicionado ao app no futuro (novo modal, nova página), vai ter o mesmo problema no Linux — usar `<Select>` de `@/components/ui/select` desde o início, não `<select>` puro.
