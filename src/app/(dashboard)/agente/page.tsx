// src/app/(dashboard)/agente/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AgentChat from './AgentChat'

export const metadata = { title: 'Agente IA — JS Painel' }

export default async function AgentePage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || role !== 'admin') {
    redirect('/dashboard')
  }
  return <AgentChat />
}
