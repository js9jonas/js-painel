// src/components/auth/UserMenu.tsx
import { auth, signOut } from "@/auth"
import Image from "next/image"

export default async function UserMenu() {
  const session = await auth()
  if (!session?.user) return null

  const { name, email, image, role } = session.user as {
    name?: string | null
    email?: string | null
    image?: string | null
    role: "admin" | "basico"
  }

  return (
    <div className="flex items-center gap-3">
      {/* Badge de role */}
      <span
        className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          role === "admin"
            ? "bg-zinc-900 text-white"
            : "bg-zinc-100 text-zinc-600"
        }`}
      >
        {role === "admin" ? "Admin" : "Básico"}
      </span>

      {/* Info do usuário */}
      <div className="hidden sm:block text-right">
        <p className="text-xs font-medium text-zinc-900 leading-tight">{name}</p>
        <p className="text-xs text-zinc-400 leading-tight">{email}</p>
      </div>

      {/* Avatar */}
      {image ? (
        <Image
          src={image}
          alt={name ?? "Avatar"}
          width={32}
          height={32}
          className="rounded-full ring-2 ring-zinc-200"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600">
          {name?.[0]?.toUpperCase() ?? "U"}
        </div>
      )}

      {/* Logout */}
      <form
        action={async () => {
          "use server"
          await signOut({ redirectTo: "/login" })
        }}
      >
        <button
          type="submit"
          className="h-8 px-3 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-colors"
        >
          Sair
        </button>
      </form>
    </div>
  )
}