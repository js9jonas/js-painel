-- Cadastra o POP Player (popplayer.pro) no catálogo de aplicativos.
-- Sem adapter/sync automático: popplayer.pro fica atrás de Cloudflare Bot Management
-- (Managed Challenge) que bloqueia qualquer cliente HTTP, mesmo Chrome real via
-- Playwright/CDP — só a navegação humana de verdade passa. Testado e descartado
-- em 30/08/2026 (ver docs/memoria). Gerenciamento de dispositivos é manual, direto
-- em popplayer.pro/meuplayer.
INSERT INTO public.apps (nome_app, exige_licenca, observacao, url_referencia)
VALUES (
  'POP Player',
  false,
  'Sem sincronização automática no js-painel (popplayer.pro fica atrás de proteção Cloudflare que bloqueia acesso automatizado). Gerenciar dispositivos direto em popplayer.pro/meuplayer. Contrato: uso ilimitado de dispositivos por R$35/mês.',
  'https://popplayer.pro/meuplayer'
);
