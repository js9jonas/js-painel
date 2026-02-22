// src/app/(dashboard)/layout.tsx
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white shadow-sm sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Link href="/dashboard" className="font-bold text-zinc-900 text-base tracking-tight">
            JS Painel
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all"
            >
              📊 Dashboard
            </Link>
            <Link
              href="/clientes"
              className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all"
            >
              👥 Clientes
            </Link>
            <Link
              href="/aplicativos"
              className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all"
            >
              📱 Aplicativos
            </Link>
            <Link
              href="/planos"
              className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all"
            >
              📋 Planos
            </Link>
            <Link
              href="/pagamentos"
              className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all"
            >
              💰 Pagamentos
            </Link>
            <Link
              href="/alertas"
              className="rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 font-medium transition-all"
            >
              🚨 Alertas
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
