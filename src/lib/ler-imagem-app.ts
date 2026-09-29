import Anthropic from '@anthropic-ai/sdk'
import { pool } from '@/lib/db'
import { downloadFromMeta, downloadFromLocal, downloadFromDrive } from '@/lib/midia-whatsapp'

// Leitura sob demanda (botão no /chat) de print/foto de tela de app IPTV: extrai MAC, chave e
// outros dados de ativação visíveis. Substitui o processamento automático de toda imagem no n8n.

const client = new Anthropic()

const MODELO = 'claude-opus-5-5'
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type TipoImagem = typeof TIPOS_ACEITOS[number]
// Limite da API por imagem em base64 é 5 MB; WhatsApp costuma mandar bem menos que isso
const MAX_BYTES = 5 * 1024 * 1024
const REGEX_MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/

export type CadastroExistente = {
  id_app_registro: number
  id_app: number | null
  nome_app: string | null
  id_cliente: number | null
  nome_cliente: string | null
  status: string | null
  validade: string | null
  /** true quando o registro é do mesmo cliente da conversa */
  do_contato: boolean
}

export type LeituraImagem = {
  /** Nome do catálogo quando a IA reconheceu o app; senão, como está escrito na tela */
  app: string | null
  /** id em public.apps quando o app bate com o catálogo */
  id_app: number | null
  /** MAC, ou e-mail de login nos apps que usam e-mail+senha (Clouddy) — mesmo campo do cadastro */
  mac: string | null
  /** true quando o MAC lido não tem o formato XX:XX:XX:XX:XX:XX — conferir na imagem (e-mail não conta) */
  mac_suspeito: boolean
  chave: string | null
  /** AAAA-MM-DD, quando a tela mostra validade/expiração */
  validade: string | null
  outros: { rotulo: string; valor: string }[]
  observacao: string | null
  /** Registros não removidos em public.aplicativos com esse MAC/e-mail, em qualquer app */
  cadastros: CadastroExistente[]
  /** id do cliente dono do telefone da conversa (null se o contato não está vinculado) */
  id_cliente_conversa: number | null
  /** Dados suficientes pra cadastrar: app do catálogo + MAC válido + nenhum cadastro desse MAC nesse app */
  pode_cadastrar: boolean
}

const SYSTEM = `Você lê imagens enviadas por clientes de IPTV no WhatsApp: prints ou fotos da tela da TV/celular mostrando um aplicativo (IBO Player, Clouddy, SmartOne, Duplex, FunPlay, LazerPlay, POP Player etc.), normalmente na tela de ativação.

Extraia os dados exatamente como aparecem na imagem, sem inventar nada:
- app: nome do aplicativo, se estiver visível ou claramente identificável pela tela.
- id_app: o id do aplicativo na lista de aplicativos cadastrados enviada junto com a imagem, se for um deles; senão null.
- mac: o endereço MAC ou "Device ID"/"ID do dispositivo" no formato de MAC. Um MAC só tem dígitos 0-9 e letras A-F, então leia "O" como 0. Devolva em maiúsculas separado por ":" (ex.: 1A:2B:3C:4D:5E:6F). Em apps que ativam por e-mail e senha (como o Clouddy), coloque o e-mail de login aqui.
- chave: a chave do dispositivo ("Device Key", "Key", "Chave", "PIN", "Código") exatamente como mostrada; em apps de e-mail e senha, a senha. Atenção a 0/O, 1/I/l, 5/S e 8/B.
- validade: a data de validade/expiração da licença, se aparecer, no formato AAAA-MM-DD; senão null.
- outros: outros dados de acesso visíveis que ajudem a cadastrar o dispositivo (usuário, e-mail, senha, código de ativação, URL do servidor), com o rótulo como aparece na tela.
- observacao: uma frase curta só quando algo impedir uma leitura confiável (imagem desfocada, reflexo, dado cortado) ou quando a imagem não for uma tela de app. Caso contrário, null.

Campo não visível ou ilegível: null (ou lista vazia em "outros"). Nunca complete dados que não dá pra ler.`

const SCHEMA = {
  type: 'object',
  properties: {
    app: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    id_app: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    validade: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    mac: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    chave: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    outros: {
      type: 'array',
      items: {
        type: 'object',
        properties: { rotulo: { type: 'string' }, valor: { type: 'string' } },
        required: ['rotulo', 'valor'],
        additionalProperties: false,
      },
    },
    observacao: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['app', 'id_app', 'mac', 'chave', 'validade', 'outros', 'observacao'],
  additionalProperties: false,
}

async function baixarImagem(msgId: number): Promise<{ buffer: Buffer; tipo: TipoImagem }> {
  const { rows } = await pool.query(
    `SELECT tipo, conteudo, media_mime, media_drive_id, media_local_path
     FROM public.whatsapp_mensagens WHERE id = $1`,
    [msgId]
  )
  const msg = rows[0]
  if (!msg?.conteudo) throw new Error('Mensagem não encontrada')
  if (msg.tipo !== 'image') throw new Error('A mensagem não é uma imagem')

  const tipo = String(msg.media_mime ?? 'image/jpeg').split(';')[0].trim().toLowerCase()
  if (!TIPOS_ACEITOS.includes(tipo as TipoImagem)) throw new Error(`Formato de imagem não suportado: ${tipo}`)

  // Disco local primeiro (mídia da Meta expira em poucos dias), depois Meta, depois Drive (legado)
  const erros: string[] = []
  const tentativas: [string, () => Promise<Buffer>][] = []
  if (msg.media_local_path) tentativas.push(['Local', () => downloadFromLocal(msg.media_local_path)])
  tentativas.push(['Meta', () => downloadFromMeta(msg.conteudo)])
  if (msg.media_drive_id) tentativas.push(['Drive', () => downloadFromDrive(msg.media_drive_id)])

  for (const [origem, baixar] of tentativas) {
    try {
      const buffer = await baixar()
      if (buffer.length > MAX_BYTES) throw new Error(`imagem com ${(buffer.length / 1024 / 1024).toFixed(1)} MB (máx. 5 MB)`)
      return { buffer, tipo: tipo as TipoImagem }
    } catch (e) {
      erros.push(`${origem}: ${e instanceof Error ? e.message : e}`)
    }
  }
  throw new Error(`Imagem indisponível (${erros.join(' | ')})`)
}

type ResultadoLeitura = { ok: true; leitura: LeituraImagem } | { ok: false; error: string }

export async function lerImagemApp(msgId: number): Promise<ResultadoLeitura> {
  let imagem: { buffer: Buffer; tipo: TipoImagem }
  try {
    imagem = await baixarImagem(msgId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const catalogo = await carregarCatalogo()
  const extraido = await extrairDadosImagem(imagem.buffer, imagem.tipo, catalogo)
  if (!extraido.ok) return extraido
  return { ok: true, leitura: await vincularCadastros(extraido.leitura, msgId, catalogo) }
}

type AppCatalogo = { id_app: number; nome_app: string }

export async function carregarCatalogo(): Promise<AppCatalogo[]> {
  const { rows } = await pool.query<AppCatalogo>(
    `SELECT id_app::int AS id_app, nome_app FROM public.apps WHERE nome_app IS NOT NULL ORDER BY id_app`
  )
  return rows
}

// Cruza a leitura com o cadastro: nome do catálogo, registros com o mesmo MAC/e-mail (em qualquer
// app — o mesmo aparelho costuma ter mais de um app) e se cada um é do cliente desta conversa.
export async function vincularCadastros(leitura: LeituraImagem, msgId: number, catalogo: AppCatalogo[]): Promise<LeituraImagem> {
  const doCatalogo = catalogo.find((a) => a.id_app === leitura.id_app) ?? null
  const idApp = doCatalogo ? doCatalogo.id_app : null

  const { rows: contato } = await pool.query<{ id_cliente: number | null }>(
    `SELECT ct.id_cliente::int AS id_cliente
     FROM public.whatsapp_mensagens m
     JOIN public.contatos ct ON ct.telefone = m.telefone
     WHERE m.id = $1 LIMIT 1`,
    [msgId]
  )
  const idClienteConversa = contato[0]?.id_cliente ?? null

  let cadastros: CadastroExistente[] = []
  if (leitura.mac) {
    const { rows } = await pool.query(
      `SELECT ap.id_app_registro::int AS id_app_registro, ap.id_app::int AS id_app, a.nome_app,
              ap.id_cliente::int AS id_cliente, cl.nome AS nome_cliente, ap.status, ap.validade::text AS validade
       FROM public.aplicativos ap
       LEFT JOIN public.apps a ON a.id_app = ap.id_app
       LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
       WHERE UPPER(TRIM(ap.mac)) = UPPER($1) AND ap.removido_em IS NULL
       ORDER BY ap.data_cadastro DESC NULLS LAST`,
      [leitura.mac]
    )
    cadastros = rows.map((r) => ({
      ...r,
      do_contato: idClienteConversa != null && r.id_cliente === idClienteConversa,
    }))
  }

  const jaNoMesmoApp = idApp != null && cadastros.some((c) => c.id_app === idApp)
  return {
    ...leitura,
    app: doCatalogo?.nome_app ?? leitura.app,
    id_app: idApp,
    cadastros,
    id_cliente_conversa: idClienteConversa,
    pode_cadastrar: idApp != null && !!leitura.mac && !leitura.mac_suspeito && !jaNoMesmoApp,
  }
}

export async function extrairDadosImagem(buffer: Buffer, tipo: TipoImagem, catalogo: AppCatalogo[] = []): Promise<ResultadoLeitura> {
  const imagem = { buffer, tipo }
  let resposta: Anthropic.Beta.BetaMessage
  try {
    resposta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      // Fallback do lado do servidor se o modelo recusar; não existe nos tipos do SDK 0.78
      ...({ fallbacks: 'default' } as object),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imagem.tipo, data: imagem.buffer.toString('base64') } },
          {
            type: 'text',
            text: catalogo.length
              ? `Aplicativos cadastrados (id: nome):\n${catalogo.map((a) => `${a.id_app}: ${a.nome_app}`).join('\n')}\n\nExtraia os dados de ativação desta imagem.`
              : 'Extraia os dados de ativação desta imagem.',
          },
        ],
      }],
    })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: 'Limite de uso da IA atingido, tente de novo em instantes' }
    if (e instanceof Anthropic.APIError) return { ok: false, error: `IA ${e.status ?? ''}: ${e.message}` }
    return { ok: false, error: `Falha de conexão com a IA: ${e instanceof Error ? e.message : e}` }
  }

  if (resposta.stop_reason === 'refusal') return { ok: false, error: 'A IA recusou ler esta imagem' }
  if (resposta.stop_reason === 'max_tokens') return { ok: false, error: 'Resposta da IA cortada, tente de novo' }

  const texto = resposta.content.find((b) => b.type === 'text')
  if (!texto || texto.type !== 'text') return { ok: false, error: 'A IA não devolveu resultado' }

  let bruto: Pick<LeituraImagem, 'app' | 'id_app' | 'mac' | 'chave' | 'validade' | 'outros' | 'observacao'>
  try {
    bruto = JSON.parse(texto.text)
  } catch {
    return { ok: false, error: 'Resposta da IA em formato inválido' }
  }

  // E-mail (login do Clouddy) fica como está; MAC é normalizado pra maiúsculas com ":"
  const macBruto = bruto.mac?.trim() || null
  const ehEmail = !!macBruto && macBruto.includes('@')
  const mac = macBruto ? (ehEmail ? macBruto.toLowerCase() : macBruto.toUpperCase().replace(/-/g, ':')) : null
  const validade = bruto.validade && /^\d{4}-\d{2}-\d{2}$/.test(bruto.validade.trim()) ? bruto.validade.trim() : null
  return {
    ok: true,
    leitura: {
      app: bruto.app?.trim() || null,
      id_app: Number.isInteger(bruto.id_app) ? bruto.id_app : null,
      mac,
      mac_suspeito: mac != null && !ehEmail && !REGEX_MAC.test(mac),
      chave: bruto.chave?.trim() || null,
      validade,
      outros: Array.isArray(bruto.outros) ? bruto.outros.filter((o) => o?.valor?.trim()) : [],
      observacao: bruto.observacao?.trim() || null,
      // Preenchidos por vincularCadastros quando a leitura vem de uma mensagem
      cadastros: [],
      id_cliente_conversa: null,
      pode_cadastrar: false,
    },
  }
}
