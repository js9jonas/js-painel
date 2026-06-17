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
  comprovante?: string;
  erro?: string;
}

export interface ResultadoEdicao {
  ok: boolean;
  erro?: string;
}

export interface PainelAdapter {
  listarContas(): Promise<ContaPainel[]>;
  renovar(usuario: string, meses: number): Promise<ResultadoRenovacao>;
  getCreditos?(): Promise<number | null>;
  editarConta?(usuario: string, campos: { novoUsuario?: string; novaSenha?: string; novoRotulo?: string }): Promise<ResultadoEdicao>;
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
