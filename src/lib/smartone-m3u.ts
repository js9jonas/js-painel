// SmartOne exige host/porta/usuário/senha separados no formulário de edição do
// painel (endpoint próprio dele, não aceita um link único) — mas pra ficar visualmente
// idêntico ao FunPlays/LazerPlay/CorePlayer (que usam um link m3u só), tratamos isso
// como um único campo "link m3u" na UI e desmontamos aqui na hora de falar com o
// endpoint do SmartOne. Porta é sempre 80 (padrão dos servidores) — deixou de ser um
// dado que o usuário digita, e nem aparece no link exibido (fica só no campo enviado
// pro adapter, que é quem realmente precisa dela).
const PORTA_PADRAO_SMARTONE = "80";

export function montarLinkM3uSmartOne(host: string, usuario: string, senha: string): string {
  if (!host) return "";
  return `${host}/get.php?username=${encodeURIComponent(usuario)}&password=${encodeURIComponent(senha)}&type=m3u_plus&output=ts`;
}

export function desmontarLinkM3uSmartOne(link: string): { host: string; port: string; usuario: string; senha: string } {
  try {
    const u = new URL(link.trim());
    return {
      host: `${u.protocol}//${u.hostname}`,
      port: PORTA_PADRAO_SMARTONE,
      usuario: u.searchParams.get("username") ?? "",
      senha: u.searchParams.get("password") ?? "",
    };
  } catch {
    return { host: "", port: PORTA_PADRAO_SMARTONE, usuario: "", senha: "" };
  }
}
