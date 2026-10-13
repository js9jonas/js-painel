// Tipos de painel cujo adapter implementa gerarTeste() — ver src/lib/painel-adapters/*.ts.
// Arquivo sem dependências de servidor: usado também em componentes.
export const TIPOS_COM_TESTE = new Set(["club", "central", "uniplay", "now", "unitv", "liebe", "natv", "fast"]);

// Assinatura criada sozinha quando o cliente ainda não tem nenhuma em uso (teste pelo cadastro de app):
// mesmo padrão do "+ Assinatura" e do cadastro de cliente novo.
export const ASSINATURA_PADRAO = { id_pacote: "51", id_plano: "1", descricao: "1 Tela · Padrão mensal" };
