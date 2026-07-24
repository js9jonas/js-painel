"use server";

import { pool } from "@/lib/db";
import { buscarTelefoneJanela24h } from "@/lib/dados-acesso-iptv";
import { enviarImagemWhatsapp, enviarTextoWhatsapp, registrarMensagemWhatsapp } from "@/lib/whatsapp-envio";
import { gerarImagemDadosIphone, lerAssetEstatico } from "@/lib/iphone-overlay";

const APP_STORE_LINK = "https://apps.apple.com/br/app/smarters-player-lite/id1628995509";
const SOURCE = "dados-iphone";

export type ResultadoEnvioIphone = {
  enviado: boolean;
  motivo?: string;
  telefone?: string;
};

export async function enviarDadosAcessoIphone(idConta: string, idCliente: string): Promise<ResultadoEnvioIphone> {
  const { rows } = await pool.query(
    `SELECT c.usuario, c.senha, c.rotulo, ps.nome AS nome_painel, ps.host_stream
     FROM public.contas c
     JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
     WHERE c.id_conta = $1::bigint`,
    [idConta]
  );
  const conta = rows[0];
  if (!conta) return { enviado: false, motivo: "Conta não encontrada." };
  if (!conta.host_stream) return { enviado: false, motivo: "Painel sem URL de lista (host_stream) cadastrada." };

  const telefone = await buscarTelefoneJanela24h(idCliente);
  if (!telefone) {
    return { enviado: false, motivo: "Nenhuma mensagem recebida deste cliente nas últimas 24h" };
  }

  const base = (conta.rotulo?.trim() || conta.nome_painel) as string;
  const playlistName = base.split(/\s+/)[0].toLowerCase();
  const dados = { playlistName, usuario: conta.usuario, senha: conta.senha, url: conta.host_stream as string };

  async function enviarTexto(texto: string) {
    const msgId = await enviarTextoWhatsapp(telefone as string, texto);
    await registrarMensagemWhatsapp(msgId, telefone as string, texto, { source: SOURCE });
  }

  async function enviarImagem(buffer: Buffer, caption: string) {
    const resultado = await enviarImagemWhatsapp(telefone as string, buffer, caption);
    await registrarMensagemWhatsapp(resultado?.waMsgId ?? null, telefone as string, resultado?.mediaId ?? "", {
      source: SOURCE,
      tipo: "image",
    });
  }

  await enviarTexto("Para acessar sua assinatura no iPhone, você pode usar esse aplicativo 👇");

  await enviarImagem(
    lerAssetEstatico("logo-app.png"),
    `Smarters Player Lite — baixe pela App Store: ${APP_STORE_LINK}`
  );

  await enviarImagem(lerAssetEstatico("choose-playlist-type.png"), "Abra o app e toque em *XTREAM CODE*");

  await enviarTexto("Prontinho! Agora é só preencher os dados abaixo *exatamente como aparecem na imagem* 👇");

  const imagemDados = await gerarImagemDadosIphone(dados);
  await enviarImagem(imagemDados, "Depois de preencher, toque em *ADD PLAYLIST*");

  await enviarImagem(
    lerAssetEstatico("parental-control.png"),
    "Pode pedir uma senha de conteúdo adulto — coloque `0000` como padrão, ou toque em *Skip* pra pular"
  );

  return { enviado: true, telefone };
}
