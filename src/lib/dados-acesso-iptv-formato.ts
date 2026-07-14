type DadosConta = {
  usuario: string;
  senha: string | null;
  rotulo: string | null;
  nomePainel: string;
  hostStream: string | null;
};

export function montarLinkM3u({ hostStream, usuario, senha }: DadosConta): string {
  return `${hostStream}/get.php?username=${usuario}&password=${senha}&type=m3u_plus&output=ts`;
}

export function montarMensagemXciptv({ hostStream, usuario, senha }: DadosConta): string {
  return `*Dados de acesso:*\nURL: ${hostStream}\nUsuário: ${usuario}\nSenha: ${senha}`;
}

export function montarMensagemXtream({ hostStream, usuario, senha, rotulo, nomePainel }: DadosConta): string {
  const base = rotulo?.trim() || nomePainel;
  const nome = base.split(/\s+/)[0].toLowerCase();
  return `*Dados de acesso:*\nNome: ${nome}\nUsuário: ${usuario}\nSenha: ${senha}\nURL: ${hostStream}`;
}

export function montarMensagemUnitv({ usuario, senha }: DadosConta): string {
  return `*Dados de acesso UNITV*\nConta: ${usuario}\nSenha: ${senha}`;
}
