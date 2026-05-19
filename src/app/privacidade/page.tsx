import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de Privacidade — JS Sistemas",
  description: "Política de privacidade do aplicativo de gerenciamento de clientes via WhatsApp da JS Sistemas.",
}

export default function PoliticaPrivacidade() {
  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8, fontWeight: 500 }}>JS Sistemas</p>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
            Política de Privacidade
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            Última atualização: maio de 2026
          </p>
        </div>

        <div style={{ lineHeight: 1.7, color: "#374151" }}>

          {/* Introdução */}
          <p style={{ marginBottom: 24 }}>
            A <strong>JS Sistemas</strong>, representada por Jonas Eduardo Scheibe, sediada em Cruzeiro do Sul – RS, Brasil,
            é responsável pelo tratamento dos dados pessoais coletados por meio deste aplicativo de gerenciamento
            de clientes via <strong>WhatsApp Business API</strong>.
          </p>
          <p style={{ marginBottom: 32 }}>
            Esta Política de Privacidade descreve quais dados coletamos, como os utilizamos, como os protegemos
            e quais são os seus direitos como titular dos dados, em conformidade com a
            Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>

          <Section title="1. Dados coletados">
            <p>Coletamos apenas os dados necessários para a prestação dos nossos serviços:</p>
            <ul>
              <li><strong>Nome completo</strong> — para identificação do cliente</li>
              <li><strong>Número de telefone (WhatsApp)</strong> — para envio de notificações e atendimento</li>
              <li><strong>Dados do plano contratado</strong> — tipo de plano, data de vencimento e status de pagamento</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              Não coletamos dados sensíveis, financeiros (como dados de cartão), documentos de identidade
              ou qualquer informação além das listadas acima.
            </p>
          </Section>

          <Section title="2. Finalidade do uso dos dados">
            <p>Os dados coletados são utilizados exclusivamente para:</p>
            <ul>
              <li>Envio de notificações automáticas via WhatsApp (avisos de vencimento, confirmações de renovação e suporte)</li>
              <li>Gerenciamento interno dos planos e assinaturas dos clientes</li>
              <li>Atendimento a solicitações e dúvidas dos clientes</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              Nenhum dado é utilizado para fins publicitários, comerciais com terceiros ou qualquer finalidade
              diferente das descritas acima.
            </p>
          </Section>

          <Section title="3. Compartilhamento de dados">
            <p>
              <strong>Não compartilhamos, vendemos ou cedemos seus dados pessoais a terceiros.</strong>
            </p>
            <p style={{ marginTop: 8 }}>
              Os dados são acessados exclusivamente pela equipe da JS Sistemas para as finalidades descritas
              nesta política. A comunicação com o WhatsApp é realizada por meio da <strong>Meta (WhatsApp Business API)</strong>,
              plataforma oficial, sujeita à própria política de privacidade da Meta Platforms, Inc.
            </p>
          </Section>

          <Section title="4. Armazenamento e segurança">
            <p>
              Os dados são armazenados em servidores privados com acesso restrito, protegidos por autenticação
              e controles de acesso. Adotamos práticas de segurança adequadas para proteger as informações
              contra acesso não autorizado, alteração, divulgação ou destruição.
            </p>
            <p style={{ marginTop: 8 }}>
              Os dados são retidos pelo tempo necessário à prestação dos serviços ou enquanto houver relação
              contratual ativa. Após o encerramento, os dados podem ser mantidos pelo prazo legal aplicável.
            </p>
          </Section>

          <Section title="5. Seus direitos (LGPD)">
            <p>Como titular dos seus dados, você tem direito a:</p>
            <ul>
              <li>Confirmar a existência de tratamento dos seus dados</li>
              <li>Acessar os dados que temos sobre você</li>
              <li>Solicitar a correção de dados incompletos ou incorretos</li>
              <li>Solicitar a exclusão dos dados, quando aplicável</li>
              <li>Revogar o consentimento para o uso dos dados</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              Para exercer qualquer um desses direitos, entre em contato pelo e-mail indicado abaixo.
            </p>
          </Section>

          <Section title="6. Contato">
            <p>
              Dúvidas, solicitações ou reclamações relacionadas a esta política podem ser enviadas para:
            </p>
            <div style={{ margin: "12px 0", padding: "14px 18px", background: "#f3f4f6", borderRadius: 8, fontSize: 14 }}>
              <p style={{ margin: "0 0 4px" }}><strong>JS Sistemas</strong></p>
              <p style={{ margin: "0 0 4px" }}>Responsável: Jonas Eduardo Scheibe</p>
              <p style={{ margin: "0 0 4px" }}>Cruzeiro do Sul – RS, Brasil</p>
              <p style={{ margin: 0 }}>E-mail: <a href="mailto:jonascheibe@hotmail.com" style={{ color: "#2563eb" }}>jonascheibe@hotmail.com</a></p>
            </div>
          </Section>

          <Section title="7. Alterações nesta política">
            <p>
              Esta política pode ser atualizada periodicamente. A versão mais recente estará sempre disponível
              nesta página, com a data de atualização indicada no topo.
            </p>
          </Section>

        </div>
      </main>

      {/* Rodapé */}
      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "20px 24px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
        © {new Date().getFullYear()} JS Sistemas · Cruzeiro do Sul – RS, Brasil
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
