---
name: agenda-whatsapp-google-people-api
description: Ideia pendente — agenda de contatos WhatsApp sincronizada via Google People API para busca por nome
metadata: 
  node_type: memory
  type: project
  originSessionId: 5d5fdf43-8fea-4133-a1a5-77e1d4972ed4
  modified: 2026-08-24T01:30:08.282Z
---

## Agenda de contatos WhatsApp — Google People API

**Objetivo:** Criar um arquivo local de agenda (`agenda-whatsapp.json`) com todos os contatos do Google sincronizados periodicamente, permitindo buscar contatos por nome e obter o número/JID para envio via Evolution API.

**Why:** A Evolution API `findContacts` só retorna contatos que já interagiram com a instância — deixa de fora boa parte da lista real. O Google Contacts tem todos os contatos do celular sincronizados.

**How to apply:** Implementar quando o usuário quiser evoluir a funcionalidade de envio de mensagens WhatsApp por nome de contato.

## O que falta para implementar

1. **Google Cloud Console** — habilitar a **People API** no projeto vinculado à credencial Google do n8n
2. **n8n** — ir em *Credentials → Google account* (`lUBEN5t6ZSKoVaFi`) e clicar em "Connect" para autorizar OAuth com escopo `contacts.readonly`
3. **Workflow n8n agendado** — busca paginada em `people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers` e salva resultado em arquivo local

## Alternativa de entrada sem Google Cloud

Exportar os contatos manualmente do Google Contacts como `.vcf` ou `.csv` uma vez, montar a agenda local e validar a busca — depois automatizar a atualização via API.

## Credenciais já disponíveis no n8n

- `Google account` — ID `lUBEN5t6ZSKoVaFi` — tipo `googleOAuth2Api` — **sem token** (nunca autorizado)
- Evolution API — instância `jsevolution` (apikey: ver [[reference-infraestrutura]], não fica na memória)
- Grupo Anotações — `120363205246915854@g.us` (para envio das informações ao Jonas)
