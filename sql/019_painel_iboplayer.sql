-- IBO Player (13/10/2026): revenda IBOSOL (ibosol.com) como painel de app (tipo 'iboplayer').
-- A senha NÃO vai aqui (repo público): preencher em Conexões → IBO Player → Editar.
INSERT INTO public.painel_servidores (id, nome, tipo, url_painel, usuario, ativo, criado_em)
SELECT 109, 'IBO Player', 'iboplayer', 'https://ibosol.com', 'jonascheibe@yahoo.com', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.painel_servidores WHERE tipo = 'iboplayer');
