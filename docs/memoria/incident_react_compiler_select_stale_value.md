---
name: incident_react_compiler_select_stale_value
description: "<Select> (Radix) em modal de edição abria sem nenhuma opção marcada mesmo com o valor certo em `form` — React Compiler memoizando o JSX do Select com valor desatualizado por causa do padrão setState-dentro-de-useEffect; corrigido derivando o estado inicial direto da prop + key no call site (03/09/2026)"
metadata:
  node_type: memory
  type: reference
---

# Incidente: `<Select>` do Radix "esquece" o valor pré-selecionado em modal de edição

**Sintoma reportado (03/09/2026):** no modal "Editar painel" de `/conexoes`, o campo
"Servidor vinculado" sempre voltava pra "— Nenhum —" ao reabrir o modal, mesmo depois
de selecionar um servidor e salvar. Investigando, o campo "Tipo" (que tem valor desde
sempre) também aparecia em branco/sem opção marcada ao abrir o dropdown.

## Descartado durante a investigação

- **Server Action / SQL**: revisada parâmetro a parâmetro, `UPDATE ... id_servidor = $12`
  bate certinho. Testado com UPDATE direto via `dbtunnel` — persiste e não reverte.
- **Coluna/schema do banco**: `painel_servidores.id_servidor` (bigint, FK nullable pra
  `servidores.id_servidor`) — estrutura correta, sem trigger nenhuma mexendo nela.
- **Deploy desatualizado**: baixados os chunks JS reais de produção
  (`/_next/static/chunks/*.js`, públicos, sem precisar de login) e comparados com o
  source — bate 1:1 com o `HEAD` do repo, inclusive o sentinela `__vazio__` do
  `select.tsx` novo (pós-migração pra Radix, commit `a5c3a15`).
- **Payload SSR**: confirmado via `document.documentElement.outerHTML.match(/id_servidor/)`
  no Console — o valor certo (`"4"` pro painel NOW, por exemplo) chega no HTML da página.
  Ou seja, o dado trafega certo do banco até o navegador.

## Causa raiz

O `PainelServidorModal.tsx` inicializava o form vazio (`useState({...VAZIO})`) e
sincronizava os dados do `painel` recebido via prop pra dentro do state com um
`useEffect(() => { setForm({...}) }, [painel])` — o antipadrão clássico de "derivar
state a partir de props via effect" (o próprio ESLint do projeto já sinaliza isso como
erro: `react-hooks/set-state-in-effect`, rodando `npx eslint` no arquivo).

Com o **React Compiler** ligado (`next.config.js: reactCompiler: true`,
`babel-plugin-react-compiler@1.0.0`, confirmado pelos marcadores
`react.memo_cache_sentinel` no bundle minificado de produção), esse padrão faz o
Compiler memoizar o JSX do `<Select>` com base num ciclo de render que não é
invalidado corretamente quando o valor muda *fora* do fluxo normal (a atualização vem
de um `setState` disparado de dentro de um efeito, não de uma mudança direta de
estado/prop no render). Resultado: o elemento `<Select value={form.tipo} .../>`
renderizado ficava com um valor desatualizado (o `VAZIO` inicial), mesmo com
`form.tipo`/`form.id_servidor` já corretos por trás — sem nenhum erro no console,
porque não é uma exceção, é só uma memoização que não foi invalidada.

Campos de texto simples (`<input value={form.nome}>`) não sofriam o mesmo problema —
só os dois `<Select>` do modal (Tipo, Servidor vinculado) mostravam o sintoma.

## Fix (03/09/2026)

- **`PainelServidorModal.tsx`**: removido o `useEffect` de sincronização. O `form`
  agora nasce já correto via inicializador preguiçoso do `useState`
  (`useState(() => formInicial(painel))`), que deriva o objeto direto da prop `painel`
  no mount — sem passar por um ciclo extra de "state vazio → effect → setState".
- **`ConexoesClient.tsx`**: adicionado `key={modalServidor === "novo" ? "novo" : modalServidor.id}`
  no `<PainelServidorModal>`. Isso é o que garante que trocar de painel editado (ou
  alternar entre "editar" e "novo") force um componente **novo** — e portanto o
  inicializador preguiçoso rode de novo do zero — em vez de reaproveitar a mesma
  instância e depender de um effect pra "resetar" o form.

**Alternativa descartada:** suprimir com a diretiva `"use no memo"` no topo do arquivo
(tira o componente da memoização automática do Compiler). Funcionaria, mas só mascara
o sintoma nesse arquivo — o padrão setState-em-effect continuaria ali, o lint
continuaria reclamando, e qualquer outro componente com o mesmo padrão teria o mesmo
bug. A correção adotada resolve a causa, não só o sintoma.

## ✅ Validado em produção (03/09/2026)

Jonas deployou no Easypanel e confirmou: cadastro/edição dos campos Tipo e Servidor
vinculado voltou a funcionar normal em `/conexoes`. Aproveitou pra corrigir de vez os
vínculos que estavam pendentes (inclusive achou e preencheu um painel que também
estava sem URL do painel cadastrada, detectado só porque agora dava pra ver o form
populado corretamente).

## Segunda ocorrência: `EditarContaModal.tsx` (03/09/2026)

Ao trocar usuário/senha de uma conta CLUB pela UI, Jonas relatou "não deu certo" —
investigando junto com ele: a **primeira tentativa funcionou de verdade** no painel
(confirmado reproduzindo a chamada real do adapter direto, fora da UI — o CLUB aceitou
e trocou usuário/senha sem erro), mas a tela não refletiu a troca, então ele tentou de
novo — e a segunda tentativa falhou com "usuário não encontrado", porque o código
mandava `usuario: conta.usuario` (valor antigo, vindo da prop) como identificador de
busca no painel, e esse usuário já não existia mais lá (tinha acabado de ser renomeado
na primeira tentativa).

Causa: `EditarContaModal` também tinha `useState(vazio-ish) + useEffect(() => sync a
partir de conta, [open, conta])`, o mesmo antipadrão da causa raiz original. Diferença
aqui: o componente ficava **sempre montado** (visibilidade controlada por uma prop
`open`, não por render condicional), então o fix de "state inicial preguiçoso + key"
sozinho não bastava.

**Fix:** `ContaAcoesMenu.tsx` passou a montar `EditarContaModal` só enquanto aberto
(`{editarAberto && <EditarContaModal .../>}`, mesmo padrão do `MigrarPainelModal`
logo acima no mesmo arquivo) — `open`/`useEffect` saíram, state nasce direto da prop
via inicializador do `useState`. Além disso, o identificador usado pra localizar a
conta no painel (`usuario: conta.usuario` no body do POST) passou a vir de um state
local (`usuarioNoPainel`) que é atualizado pro valor novo assim que uma troca de
usuário é salva com sucesso — não depende mais do `router.refresh()` repropagar a prop
`conta` a tempo de uma tentativa seguinte. Resolve o "não deu certo, tentei de novo"
mesmo que o refresh do Next ainda não tenha chegado.

## Se aparecer de novo

Esse padrão (`useState(vazio)` + `useEffect(() => setForm(dadosDaProps), [prop])`)
existe em outros modais de edição do app que precisam popular um form a partir de um
registro existente — qualquer um com o mesmo padrão está potencialmente sujeito ao
mesmo bug sob o React Compiler, especialmente se usar `<Select>` do
`@/components/ui/select` pra mostrar um valor pré-selecionado, ou (como no caso do
`EditarContaModal`, segunda ocorrência acima) se algum campo derivado da prop for usado
como identificador/chave de busca numa chamada subsequente. **Ainda não mapeado
quais outros modais têm o padrão** — já são 2 achados de forma reativa (um por
teste manual, outro relatado pelo Jonas), nenhuma varredura sistemática ainda. Rodar
`npx eslint` no arquivo suspeito é o jeito mais rápido de
confirmar (`react-hooks/set-state-in-effect` acusa o padrão direto).
