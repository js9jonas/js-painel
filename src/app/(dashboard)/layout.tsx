// src/app/(dashboard)/layout.tsx
import Link from "next/link";
import UserMenu from "@/components/auth/UserMenu";
import NavDropdown from "@/components/NavDropdown";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white shadow-sm sticky top-0 z-30">
        {/* Container deslizante — tudo incluso, scrollbar oculta */}
        <div className="h-14 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex h-full items-center gap-1 px-4 min-w-max sm:px-6">
            <Link href="/dashboard" className="font-bold text-zinc-900 text-base tracking-tight px-2 mr-2 whitespace-nowrap">
              JS Painel
            </Link>
            <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all whitespace-nowrap">
              📊 Dashboard
            </Link>
            <Link href="/clientes" className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all whitespace-nowrap">
              👥 Clientes
            </Link>
            <Link href="/aplicativos" className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all whitespace-nowrap">
              📱 Aplicativos
            </Link>
            <Link href="/chat" className="rounded-lg px-3 py-2 text-sm text-green-600 hover:bg-green-50 hover:text-green-700 font-medium transition-all whitespace-nowrap">
              💬 Chat
            </Link>
            <Link href="/pagamentos" className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all whitespace-nowrap">
              💰 Pagamentos
            </Link>
            <Link href="/alertas" className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-medium transition-all whitespace-nowrap">
              🚨 Alertas
            </Link>
            <NavDropdown
              label="📡 IPTV"
              items={[
                { href: '/conexoes', label: '🔌 Conexões' },
                { href: '/conexoes/vinculacao', label: '🔗 Vinculação' },
                { href: '/teste-listas', label: '📡 Servidores' },
                { href: '/planos', label: '📋 Planos e Pacotes' },
                { href: '/player', label: '▶ Player' },
              ]}
            />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}