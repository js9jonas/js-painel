"use server";

import { buscarTelefoneJanela24h } from "@/lib/dados-acesso-iptv";
import { enviarImagemWhatsapp, enviarTextoWhatsapp, registrarMensagemWhatsapp } from "@/lib/whatsapp-envio";
import { lerAssetEstaticoAndroid } from "@/lib/android-assets";

const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.pro.popplayer";
const SOURCE = "dados-android";

export type ResultadoEnvioAndroid = {
  enviado: boolean;
  motivo?: string;
  telefone?: string;
};

// Não sincroniza dado de acesso nenhum — diferente dos outros formatos (xciptv/xtream/iPhone),
// o cadastro no popplayer.pro é manual (sem automação, ver docs/memoria): a mensagem só orienta
// o cliente a instalar o app e mandar foto do código, e o cadastro em si é feito depois por fora.
export async function enviarDadosAcessoAndroid(idCliente: string): Promise<ResultadoEnvioAndroid> {
  const telefone = await buscarTelefoneJanela24h(idCliente);
  if (!telefone) {
    return { enviado: false, motivo: "Nenhuma mensagem recebida deste cliente nas últimas 24h" };
  }

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

  await enviarTexto("Para acessar sua assinatura no Android, você pode usar esse aplicativo 📲👇");

  await enviarImagem(
    lerAssetEstaticoAndroid("pop-player-logo.png"),
    `📥 Baixe o *POP Player Pro* na Play Store:\n${PLAY_STORE_LINK}`
  );

  await enviarTexto(
    "Assim que abrir o app, toque no ícone *Playlists* 📂 e me envie uma foto do código do app 📸. Em seguida faço o seu cadastro ✅"
  );

  return { enviado: true, telefone };
}
