import Link from "next/link"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">JS Painel</Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/dashboard">📊 Dashboard</Link>
              <Link href="/clientes">👥 Clientes</Link>
              <Link className="hover:text-foreground" href="/clientes">Clientes</Link>
              <Link className="hover:text-foreground" href="/licencas">Licenças</Link>
              <Link className="hover:text-foreground" href="/pagamentos">Pagamentos</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
