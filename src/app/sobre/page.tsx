import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "JS Sistemas — Gestão de Assinaturas IPTV",
  description: "JS Sistemas oferece serviços de gestão de assinaturas IPTV e suporte ao cliente via WhatsApp Business API.",
}

export default function Sobre() {
  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Lajeado — RS, Brasil
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>
            JS Sistemas
          </h1>
          <p style={{ fontSize: 17, color: "#374151", margin: 0, lineHeight: 1.6 }}>
            Gestão de assinaturas e atendimento ao cliente para serviços IPTV,
            com automação via WhatsApp Business API oficial da Meta.
          </p>
        </div>

        <div style={{ lineHeight: 1.7, color: "#374151" }}>

          <Section title="Sobre a empresa">
            <p>
              A <strong>JS Sistemas</strong>, representada por Jonas Eduardo Scheibe, é uma empresa
              brasileira especializada em gestão de assinaturas de serviços IPTV e suporte ao cliente.
            </p>
            <p style={{ marginTop: 12 }}>
              Atuamos com uma base de mais de 1.100 clientes ativos, oferecendo uma plataforma própria
              de gerenciamento, renovações automatizadas e comunicação direta via WhatsApp Business.
            </p>
          </Section>

          <Section title="Nossos serviços">
            <ul>
              <li>Gestão de assinaturas e planos IPTV</li>
              <li>Notificações automáticas de vencimento e renovação via WhatsApp</li>
              <li>Atendimento ao cliente via WhatsApp Business API</li>
              <li>Painel de controle para gerenciamento de clientes e pagamentos</li>
            </ul>
          </Section>

          <Section title="Tecnologia">
            <p>
              Utilizamos a <strong>WhatsApp Business API oficial da Meta (Cloud API)</strong> para
              todas as comunicações com nossos clientes, garantindo segurança, confiabilidade e
              conformidade com as políticas da plataforma.
            </p>
            <p style={{ marginTop: 12 }}>
              Nossa plataforma de gestão é desenvolvida internamente, com foco em automação de
              processos e qualidade no atendimento.
            </p>
          </Section>

          <Section title="Contato">
            <div style={{ margin: "12px 0", padding: "14px 18px", background: "#f3f4f6", borderRadius: 8, fontSize: 14 }}>
              <p style={{ margin: "0 0 4px" }}><strong>JS Sistemas</strong></p>
              <p style={{ margin: "0 0 4px" }}>Responsável: Jonas Eduardo Scheibe</p>
              <p style={{ margin: "0 0 4px" }}>CNPJ: 40.877.286/0001-06</p>
              <p style={{ margin: "0 0 4px" }}>Lajeado — RS, Brasil</p>
              <p style={{ margin: "0 0 4px" }}>Telefone: +55 51 9868-3468</p>
              <p style={{ margin: 0 }}>
                E-mail:{" "}
                <a href="mailto:jonascheibe@hotmail.com" style={{ color: "#2563eb" }}>
                  jonascheibe@hotmail.com
                </a>
              </p>
            </div>
          </Section>

          <div style={{ marginTop: 32, fontSize: 14 }}>
            <a href="/privacidade" style={{ color: "#2563eb", textDecoration: "none" }}>
              Política de Privacidade
            </a>
          </div>

        </div>
      </main>

      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "20px 24px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
        © {new Date().getFullYear()} JS Sistemas · Lajeado — RS, Brasil
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, color: "#111827", margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #e5e7eb" }}>
        {title}
      </h2>
      <div style={{ fontSize: 15 }}>
        {children}
      </div>
    </section>
  )
}
