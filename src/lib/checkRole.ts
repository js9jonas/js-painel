// src/lib/checkRole.ts
// Use essa função nas Server Actions que exigem papel de admin

import { auth } from "@/auth"

export async function requireAdmin() {
  const session = await auth()

  if (!session?.user) {
    throw new Error("Não autenticado")
  }

  const role = (session.user as { role?: string }).role
  if (role !== "admin") {
    throw new Error("Acesso negado — requer perfil admin")
  }

  return session
}

export async function requireAuth() {
  const session = await auth()

  if (!session?.user) {
    throw new Error("Não autenticado")
  }

  return session
}