import { pool } from "@/lib/db";
import { enviarTextoWhatsapp, registrarMensagemWhatsapp } from "@/lib/whatsapp-envio";

interface EnvioResultado {
  enviado: boolean;
  motivo?: string;
  telefone?: string;
}

export async function enviarDadosAcessoIptv(idCliente: string, texto: string): Promise<EnvioResultado> {
  const telefoneAtivo = await pool.query(
    `SELECT ct.telefone
     FROM public.contatos ct
     JOIN public.whatsapp_mensagens wm
       ON wm.telefone = ct.telefone AND wm.origem = 'cliente' AND wm.recebida_em >= NOW() - INTERVAL '24 hours'
     WHERE ct.id_cliente = $1::bigint
     ORDER BY wm.recebida_em DESC
     LIMIT 1`,
    [idCliente]
  );

  if (!telefoneAtivo.rows[0]) {
    return { enviado: false, motivo: "Nenhuma mensagem recebida deste cliente nas últimas 24h" };
  }

  const telefone = telefoneAtivo.rows[0].telefone;

  const msgId = await enviarTextoWhatsapp(telefone, texto);
  await registrarMensagemWhatsapp(msgId, telefone, texto, { source: "dados-iptv" });

  if (!msgId) return { enviado: false, motivo: "Falha ao enviar mensagem via WhatsApp" };
  return { enviado: true, telefone };
}
