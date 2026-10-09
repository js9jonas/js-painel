# Intenção: ativações e cadastros de clientes 100% dentro do js-painel — registrado 08/10/2026

📋 Sem data. Pedido do Jonas: fazer as **ativações de aplicativos (FunPlay/LazerPlay…) e o cadastro de novos clientes
inteiramente pelo js-painel**, pra centralizar o trabalho (hoje ele alterna entre o site do painel de revenda e o
js-painel).

## O que o Jonas já sabe do fluxo atual (ponto de partida)
- **Aparelho recém-instalado**: ele usa uma **página de cadastro** e só consegue colocar o aparelho no painel via
  **ativação** (não via "add existing device").
- **"Add existing device" NÃO funciona em aparelho no período grátis (7 dias)** — só pra aparelho já pago/ativado
  antes. (Por isso a migração de 08/10 anota falhas em vez de parar no modo `vencidos`.)
- Ativar = `POST /reseller/activate` (já existe no adapter: `ativarDispositivo` em `appacesso.ts`, usado por
  `renovar`). Comentário = `PUT /reseller/device/comment`; mover = `POST /reseller/add_existing_device {mac,key}`;
  checar = `GET /reseller/validate_mac` (endpoints capturados 08/10 — `project_funplay_dois_paineis.md`).

## A levantar antes de implementar (não assumir — capturar no painel com o Jonas operando)
- Qual é a "página de cadastro" do aparelho novo e o que ela faz por trás (endpoint, se pede captcha).
- Formato exato do `/reseller/activate` (pacotes `/reseller/packages`, `activation_packages`), custo em créditos,
  e o que acontece com aparelho em período grátis.
- Fluxo desejado na tela: cliente novo → aparelho (MAC/chave, inclusive da leitura de imagem do /chat) → ativar →
  comentário = nome → vínculo no js-painel, tudo num lugar só. Ações com custo real: confirmação explícita
  (regra: nunca gastar crédito em teste sem perguntar).
