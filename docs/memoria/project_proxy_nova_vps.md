---
name: project-proxy-nova-vps
description: Lembrete para testar necessidade do proxy Webshare após migração para novo servidor VPS
metadata: 
  node_type: memory
  type: project
  originSessionId: a66a19e8-cd7e-4d99-8519-23bfdc44cd26
---

## Situação atual

O IP da VPS Hostinger (`168.231.98.162`) é bloqueado por `pdcapi.io` (CLUB) e `gesapioffice.com` (UNIPLAY), tornando o proxy Webshare residencial ($3,50/mês) obrigatório para os adapters js-painel.

## Lembrete — na migração para nova VPS

Quando Jonas migrar para um novo servidor (upgrade de infra), testar se o novo IP também é bloqueado pelos painéis IPTV **antes** de configurar o proxy.

Passos a executar no novo ambiente:
```bash
# Teste direto sem proxy — se retornar 2xx/4xx, o IP não está bloqueado
curl https://pdcapi.io/ -o /dev/null -w "%{http_code}" -s
curl https://gesapioffice.com/api/ -o /dev/null -w "%{http_code}" -s
```

Se ambos passarem sem proxy → remover `UNIPLAY_PROXY_URL` do Easypanel e cancelar Webshare.  
Se bloqueados → manter proxy ou avaliar troca de provedor.

**Why:** O bloqueio é por IP de datacenter, não por provedor específico. Um novo servidor em provedor diferente (Hetzner, DigitalOcean, etc.) pode ter IP não listado nas blacklists desses painéis.  
**How to apply:** Verificar sempre que trocar de VPS, antes de configurar qualquer proxy externo.
