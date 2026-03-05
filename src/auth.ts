// src/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { pool } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt", // sessão em cookie criptografado, sem tabelas no banco
  },
  callbacks: {
    // Só permite login se o e-mail estiver cadastrado na tabela users
    async signIn({ profile }) {
      if (!profile?.email) return false
      const result = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [profile.email]
      )
      return result.rows.length > 0
    },

    // Injeta id e role no token JWT
    async jwt({ token, profile }) {
      if (profile?.email) {
        const result = await pool.query(
          "SELECT id, role FROM users WHERE email = $1",
          [profile.email]
        )
        if (result.rows.length > 0) {
          token.id = result.rows[0].id
          token.role = result.rows[0].role
        }
      }
      return token
    },

    // Expõe id e role na sessão acessível pelos componentes
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as "admin" | "basico"
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})