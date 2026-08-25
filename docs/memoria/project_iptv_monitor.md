---
name: iptv-monitor-interesse
description: Interesse em construir ferramenta para monitorar listas IPTV e notificar quando streams caem — app local com ffprobe + banco central
type: project
---

Jonas quer construir uma ferramenta de monitoramento de listas IPTV: cadastra URLs de listas (M3U ou credenciais Xtream) e recebe notificação quando um servidor ou canal cai.

**Por que não usar solução web:** Testes via browser (página player do js-painel) mostraram resultado diferente do app real no celular. Browser tem CORS, não suporta MPEG-TS nativo, buffering diferente — não é confiável como indicador real de funcionamento.

**Arquitetura cogitada:**
- App/script local (ou rodando no VPS) que usa `ffprobe`/`ffmpeg` para testar os streams de verdade
- Faz verificação periódica (cron) e envia resultado ao banco central (js_bdjs)
- Sistema central (js-painel ou novo serviço) exibe status e dispara notificações via Evolution API/n8n quando algo cai

**Why:** diferença observada entre o que a página web mostrava e o que o aplicativo IPTV real (no celular) mostrava — os testes web não passaram confiança suficiente para uso operacional.

**How to apply:** quando Jonas trouxer esse projeto, sugerir `ffprobe` com timeout curto como verificador confiável, arquitetura de agente local que reporta ao banco, e não tentar resolver via player web.

---

## Ferramentas existentes para usar como base (pesquisado mai/2026)

**Motor de verificação (usar como dependência):**
- [`freearhey/iptv-checker`](https://github.com/freearhey/iptv-checker) — CLI Node.js, usa `ffprobe` internamente, verifica lista M3U em paralelo com timeout configurável. **Base recomendada para o verificador.**

**Referência de arquitetura de monitoramento contínuo:**
- [`Jeremias0618/IPTV-State-Monitor`](https://github.com/Jeremias0618/IPTV-State-Monitor) — PHP + MySQL + systemd; monitora Xtream Codes, detecta online/offline em tempo real, envia e-mail. Referência de fluxo.
- [`giyu51/iptv-channels-monitoring`](https://github.com/giyu51/iptv-channels-monitoring) — Python + FastAPI + VLC; rastreia estatísticas de canais.
- [`zhimin-dev/iptv-checker`](https://github.com/zhimin-dev/iptv-checker) — versão Docker com interface web.

**Referência de failover automático:**
- [Dispatcharr](https://www.thedougie.com/dispatcharr-watch-tv-from-any-iptv-provider-anywhere-and-keep-it-running-when-streams-fail/) — self-hosted, monitora buffering e troca de stream automaticamente.

**Estratégia recomendada:** usar `freearhey/iptv-checker` como motor (já resolve ffprobe), construir em volta: agendamento (cron/n8n), banco `js_bdjs`, notificação via Evolution API/WhatsApp. Diferencial = integração com stack já existente.

**Dispatcharr:** útil para consumo pessoal (assistir IPTV com failover automático), mas não serve como monitor proativo para revendedor — só detecta falha quando alguém está assistindo. Projeto independente, não substitui o monitor.

---

## Visão de integração com atendimento WhatsApp (mai/2026)

Jonas quer conectar o monitor de servidores diretamente ao fluxo de atendimento do WhatsApp:

**Fluxo quando servidor cai:**
1. Monitor detecta instabilidade no servidor X → grava incidente no banco
2. Cliente manda mensagem no WhatsApp com problema/dificuldade
3. Agente verifica no banco: o servidor desse cliente tem incidente ativo?
4. Se sim → responde automaticamente informando que há instabilidade conhecida no servidor
5. Registra que esse cliente chamou durante o incidente

**Fluxo quando servidor normaliza:**
1. Monitor detecta que servidor X voltou ao normal → fecha incidente no banco
2. Sistema dispara mensagens proativas para todos os clientes que chamaram durante o incidente, informando que o serviço normalizou

**Why:** evita que cliente receba resposta genérica quando a causa já é conhecida; fecha o loop de comunicação sem intervenção manual.

**How to apply:** ao construir o monitor, já projetar as tabelas pensando nesse fluxo — `incidentes_servidor` com `servidor_id`, `inicio`, `fim`, `status`; e `clientes_afetados_incidente` para rastrear quem chamou durante a queda.
