import { createDriveAuth } from '@/lib/google-drive'
import fs from 'fs/promises'
import path from 'path'

// Download de mídia do WhatsApp compartilhado entre transcrição de áudio e leitura de imagem.
// Três origens: Meta (só enquanto a mídia não expira), disco local (bind mount) e Drive (legado).

const WA_TOKEN   = process.env.WHATSAPP_TOKEN!
const MIDIA_ROOT = process.env.WHATSAPP_MIDIA_ROOT || '/app/whatsapp-midias'

export async function downloadFromMeta(mediaId: string): Promise<Buffer> {
  const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  })
  if (!metaRes.ok) throw new Error(`Meta ${metaRes.status}`)
  const { url } = await metaRes.json() as { url?: string }
  if (!url) throw new Error('URL não retornada pela Meta')

  const res = await fetch(url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
  if (!res.ok) throw new Error(`Download ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function downloadFromLocal(localPath: string): Promise<Buffer> {
  return fs.readFile(path.join(MIDIA_ROOT, localPath))
}

export async function downloadFromDrive(driveId: string): Promise<Buffer> {
  const driveAuth = createDriveAuth()
  if (!driveAuth) throw new Error('Credenciais Drive não configuradas')
  const token = await driveAuth.getAccessToken()
  if (!token) throw new Error('Token Drive inválido')

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
