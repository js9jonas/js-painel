// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "admin" | "basico"
    } & DefaultSession["user"]
  }

  interface User {
    role?: "admin" | "basico"
  }
}