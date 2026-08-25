---
name: project-iptv-panel-types
description: Distinção arquitetural entre painéis de app (MAC) e painéis de servidor (lista M3U) — fundamental para os adapters
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c8e4595-9821-4192-a611-31849bbc8404
---

## Dois tipos de painel IPTV

### App panels (gerenciam o player/aplicativo)
Cadastram o MAC do dispositivo do cliente e controlam o acesso ao app.
Não fornecem conteúdo — apenas liberam o aplicativo para rodar com uma lista associada.

- FunPlays (`reseller.funplays.app`)
- LazerPlay (`reseller.lazerplay.io`)
- SmartOne (`smartone-iptv.com`)

**Operações do adapter:** `registrarMAC`, `renovarMAC`, `verificarMAC`, `removerMAC`

### Content panels (fornecem a lista M3U)
Gerenciam usuários com login/senha ou URL de lista. Aqui está o conteúdo real (canais, VOD, séries).

- SearchDefense (`searchdefense.top`) — via `gesapioffice.com`
- Uniplay, Club, Central, Fast, Now, Unitv (já parcialmente implementados no js-painel)
- ibosol (`ibosol.com`) — `backend.ibosol.com`
- dashboard.bz (`pdcapi.io`)
- painelcliente.com
- painel.fun (`api.controle.fit`)
- revenda.watch (`panel-web.revenda.watch`)

**Operações do adapter:** `criarUsuario`, `renovarUsuario`, `getListaURL`, `verificarCredenciais`

## Exemplo de fluxo completo

João tem pacote Uniplay, usa FunPlays com MAC xx:xx:xx:

```
1. App panel (FunPlays): registrar MAC xx:xx:xx → libera o app por X dias
2. Content panel (Uniplay/SearchDefense): criar usuário → gera lista M3U
3. App panel: associar lista M3U do step 2 ao MAC do step 1
4. js-painel banco: salvar login, senha, URL lista, MAC, vencimento
```

## Estado dos adapters no js-painel

- **Content panels já parcialmente implementados**: CLUB, CENTRAL, FAST, UNIPLAY, NOW, UNITV (`iptv_panel_adapters.md`)
- **App panels — a implementar**: FunPlays, LazerPlay, SmartOne
- **Content panels novos — a implementar**: SearchDefense, ibosol, dashboard.bz, painelcliente, painel.fun, revenda.watch

## Ordem de implementação recomendada

1. SearchDefense (content, sem captcha, mais simples)
2. FunPlays (app panel, reCAPTCHA via 2captcha)
3. LazerPlay (aproveita 100% do adapter FunPlays)
4. ibosol (content, REST limpo)
5. painel.fun (content, Turnstile)
6. dashboard.bz (content, dois passos)
7. SmartOne (app panel, cookie/session)
8. painelcliente.com (content, cookie/session)
9. revenda.watch (content, Playwright headless)

## Processo de mapeamento de adapter

Para construir um adapter completo de qualquer painel, o processo é:
1. Jonas executa a ação real no painel (ex: cadastrar um MAC com lista)
2. Playwright monitora os requests em tempo real via `browser_network_requests`
3. Se Jonas não souber descrever onde clicar, tirar screenshot via Playwright e identificar o elemento visualmente
4. Capturar: endpoint, método, payload, headers, resposta
5. Repetir para cada operação relevante (criar, renovar, buscar, remover)
6. Montar a interface TypeScript com os dados reais

**Lembrete:** Quando Jonas não souber descrever onde clicar ou manusear no painel, usar `browser_take_screenshot` + `browser_snapshot` para identificar o elemento e guiá-lo com precisão.

## Why
**How to apply:** Ao criar um adapter, identificar se é app panel (MAC) ou content panel (lista). A interface TypeScript é diferente para cada tipo. Os adapters de conteúdo já existem parcialmente — priorizar expandir esses antes de criar os app panel adapters do zero.
