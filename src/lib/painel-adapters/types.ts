export interface ContaPainel {
  usuario: string;
  rotulo: string;
  vencimento: string | null; // ISO date YYYY-MM-DD
  status: "ok" | "vencida" | "bloqueada";
  // Só preenchido nos painéis cuja listagem em bulk já retorna a senha em texto puro
  // (FAST, UNIPLAY, NOW, UNITV, LIEBE). CLUB e CENTRAL exigem 1 chamada por conta.
  senha?: string | null;
}

export interface ResultadoRenovacao {
  ok: boolean;
  novoVencimento?: string;
  /** Renovação não feita de propósito (ex.: já estava renovada) — vai na mensagem da tela. */
  aviso?: string;
  comprovante?: string;
  erro?: string;
}

export interface ResultadoEdicao {
  ok: boolean;
  erro?: string;
}

export interface ResultadoTeste {
  ok: boolean;
  usuario?: string;
  senha?: string;
  expiracao?: string; // YYYY-MM-DD
  expiracaoHorario?: string; // HH:MM, quando disponível — só exibição, não é persistido (vencimento_real_painel é DATE)
  erro?: string;
}

export interface ResultadoCriacao {
  ok: boolean;
  vencimento?: string; // YYYY-MM-DD
  erro?: string;
}

export interface DetalhesConta {
  senha: string | null;
  telas: number;
  comAdultos: boolean;
  rotulo: string;
}

export interface PainelAdapter {
  listarContas(): Promise<ContaPainel[]>;
  renovar(usuario: string, meses: number): Promise<ResultadoRenovacao>;
  /**
   * Soma ao vencimento os dias que faltam até `dataAlvo` (AAAA-MM-DD) — usado quando o contrato acaba antes de
   * 1 mês. FAST e Central, pelo robô de navegador. `dias` = quantos foram somados (0 = já valia até lá).
   */
  adicionarDiasAte?(usuario: string, dataAlvo: string): Promise<ResultadoRenovacao & { antes?: string; dias?: number }>;
  getCreditos?(): Promise<number | null>;
  editarConta?(usuario: string, campos: { novoUsuario?: string; novaSenha?: string; novoRotulo?: string; novoPacote?: number }): Promise<ResultadoEdicao>;
  gerarTeste?(params: { comAdultos?: boolean; horas?: number; rotulo?: string }): Promise<ResultadoTeste>;
  recriarlinha?(usuario: string): Promise<ResultadoTeste>;
  deletarConta?(usuario: string): Promise<void>;
  // Cria conta paga (produção) com usuário/senha específicos — usado em migração entre painéis
  criarConta?(usuario: string, senha: string, params?: { meses?: number; telas?: number; comAdultos?: boolean; rotulo?: string }): Promise<ResultadoCriacao>;
  // Busca detalhes (senha, telas, conteúdo adulto, rótulo) direto no painel — usado pra migrar
  // uma conta preservando as mesmas características, quando o banco local não tem tudo salvo.
  obterDetalhes?(usuario: string): Promise<DetalhesConta | null>;
  // Operações longas que não devem correr junto ao sync diário
  importarSenhas?(prioridade?: Set<string>): Promise<Map<string, string | null>>;
}

export type SaveSession = (cookie: string, expiry?: Date) => Promise<void>;
export type SaveContaVencimento = (usuario: string, novoVenc: string) => Promise<void>;

export interface ServidorCredenciais {
  painel_url: string;
  painel_usuario: string;
  painel_senha: string;
  painel_tipo: string;
  session_cookie: string | null;
  session_expiry: Date | null;
  api_token: string | null;
  api_secret: string | null;
}
