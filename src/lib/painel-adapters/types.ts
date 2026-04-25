export interface ContaPainel {
  usuario: string;
  rotulo: string;
  vencimento: string | null; // ISO date YYYY-MM-DD
  status: "ok" | "vencida" | "bloqueada";
}

export interface ResultadoRenovacao {
  ok: boolean;
  novoVencimento?: string;
  comprovante?: string;
  erro?: string;
}

export interface PainelAdapter {
  listarContas(): Promise<ContaPainel[]>;
  renovar(usuario: string, meses: number): Promise<ResultadoRenovacao>;
}

export interface ServidorCredenciais {
  painel_url: string;
  painel_usuario: string;
  painel_senha: string;
  painel_tipo: string;
  session_cookie: string | null;
  session_expiry: Date | null;
}
