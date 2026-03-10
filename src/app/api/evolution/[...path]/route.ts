import { NextRequest, NextResponse } from "next/server"

const EVOLUTION_URL = process.env.NEXT_PUBLIC_EVOLUTION_URL!
const EVOLUTION_KEY = process.env.NEXT_PUBLIC_EVOLUTION_KEY!

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(path, "GET")
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(path, "POST", await req.text())
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(path, "DELETE")
}

async function proxy(path: string[], method: string, body?: string) {
  const url = `${EVOLUTION_URL}/${path.join("/")}`
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
    body: body || undefined,
  })
  const data = await res.json()
  return NextResponse.json(data)
}