-- IBO Player Pro (13/10/2026): painel de revenda cms.iboproapp.com como painel de app (tipo 'ibopro').
-- A senha NÃO vai aqui (repo público): preencher em Conexões → IBO Pro → Editar.
INSERT INTO public.painel_servidores (id, nome, tipo, url_painel, usuario, ativo, criado_em)
SELECT 108, 'IBO Pro', 'ibopro', 'https://cms.iboproapp.com', 'jonascheibe@yahoo.com', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.painel_servidores WHERE tipo = 'ibopro');
