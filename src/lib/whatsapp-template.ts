const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

type EnviarTemplateResultado = { ok: true; msgId: string } | { ok: false; error: string }

export async function enviarTemplateWhatsapp(
  telefone: string,
  templateName: string,
  parametros: string[]
): Promise<EnviarTemplateResultado> {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: 'pt_BR' },
  }

  if (parametros.length > 0) {
    template.components = [
      {
        type: 'body',
        parameters: parametros.map((texto) => ({ type: 'text', text: texto })),
      },
    ]
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'template',
      template,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('[WhatsappTemplate] Erro ao enviar template:', data)
    return { ok: false, error: data.error?.message ?? 'Erro ao enviar template' }
  }

  const msgId = data.messages?.[0]?.id
  if (!msgId) return { ok: false, error: 'Resposta sem message_id' }
  return { ok: true, msgId }
}
