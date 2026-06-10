const BASE     = 'https://graph.facebook.com/v20.0'
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!
const TOKEN    = process.env.WHATSAPP_TOKEN!

export interface WaLabel {
  id:    string
  name:  string
  color: number
}

export async function findLabels(): Promise<WaLabel[]> {
  const res  = await fetch(`${BASE}/${PHONE_ID}/labels`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    next:    { revalidate: 0 },
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('[meta-labels] findLabels error:', data)
    return []
  }
  return (data.data ?? []) as WaLabel[]
}

export async function handleLabel(waId: string, labelId: string, action: 'add' | 'remove'): Promise<void> {
  const body = action === 'add'
    ? { add: [labelId] }
    : { remove: [labelId] }

  const res = await fetch(`${BASE}/${PHONE_ID}/contacts/${waId}/labels`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(JSON.stringify(data))
  }
}
