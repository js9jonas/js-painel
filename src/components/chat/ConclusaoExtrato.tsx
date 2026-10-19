'use client'
// Modo sombra da renovação conclusiva (etapa 3): embaixo do balão "RESUMO GERADO POR IA" no /chat, mostra o
// que o painel concluiu do Pix no extrato do Inter e se bate com o que foi registrado. Não renova nada.
// Lógica em src/lib/pix-extrato.ts (conclusaoDoComprovante).
import { useState } from 'react'
import type { ConclusaoComprovante } from '@/lib/pix-extrato'

const SITUACAO: Record<string, { icone: string; texto: string; cor: string }> = {
  conclusivo: { icone: '◎', texto: 'Conclusivo', cor: '#0284c7' },
  analisar: { icone: '?', texto: 'Analisar', cor: '#d97706' },
  link: { icone: '⚡', texto: 'Pago pelo link', cor: '#7c3aed' },
  pendente: { icone: '⏳', texto: 'Aguardando análise', cor: '#667781' },
}

function hora(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

const PERIODO: Record<number, string> = { 1: 'mensal', 3: 'trimestral', 6: 'semestral', 12: 'anual' }

export default function ConclusaoExtrato({ idMsg }: { idMsg: number }) {
  const [estado, setEstado] = useState<'fechado' | 'carregando' | 'erro' | 'ok'>('fechado')
  const [dados, setDados] = useState<ConclusaoComprovante | null>(null)

  async function abrir() {
    if (estado === 'ok') { setEstado('fechado'); return }
    setEstado('carregando')
    try {
      const r = await fetch(`/api/pix/extrato/comprovante?id_msg=${idMsg}`)
      if (!r.ok) throw new Error()
      setDados(await r.json())
      setEstado('ok')
    } catch {
      setEstado('erro')
    }
  }

  const pix = dados?.pix
  const sit = pix ? SITUACAO[pix.situacao] ?? SITUACAO.pendente : null

  return (
    <div style={{ marginTop: 6, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 5, fontSize: 12 }}>
      <button
        onClick={abrir}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#0284c7', fontSize: 12, fontWeight: 600 }}
      >
        {estado === 'carregando' ? '…' : estado === 'ok' ? '▴ Extrato' : '◎ Ver no extrato'}
      </button>
      {estado === 'erro' && <span style={{ color: '#dc2626', marginLeft: 6 }}>não consegui consultar</span>}
      {estado === 'ok' && dados && (
        <div style={{ marginTop: 4, color: '#3b4a54', lineHeight: 1.45 }}>
          {!pix && <div style={{ color: '#667781' }}>Pix não encontrado no extrato do Inter (outra conta, ou antes de 18/10).</div>}
          {pix && sit && (
            <>
              <div>
                Pix R$ {Number(pix.valor).toFixed(2).replace('.', ',')} de <b>{pix.nome ?? '—'}</b> · visto {hora(pix.visto_em)}
                {dados.outros > 0 && <span style={{ color: '#667781' }}> (+{dados.outros} com o mesmo valor perto)</span>}
              </div>
              <div style={{ color: sit.cor, fontWeight: 600 }}>
                {sit.icone} {sit.texto}
                {pix.situacao === 'conclusivo' && (
                  <span style={{ fontWeight: 400, color: '#3b4a54' }}>
                    : renovaria <b>{pix.cliente}</b>{pix.identificacao ? ` (${pix.identificacao})` : ''}
                    {pix.meses ? `, ${PERIODO[pix.meses] ?? `${pix.meses} meses`}` : ''}
                  </span>
                )}
                {pix.situacao !== 'conclusivo' && pix.motivo && (
                  <span style={{ fontWeight: 400, color: '#3b4a54' }}>: {pix.motivo}</span>
                )}
              </div>
              {dados.registrado ? (
                <div style={{ color: dados.confere === false ? '#dc2626' : '#16a34a' }}>
                  {dados.confere === false ? '✗' : '✓'} Registrado: {dados.registrado.cliente} (pagamento #{dados.registrado.id})
                  {dados.confere === false && ' — diferente da conclusão'}
                </div>
              ) : (
                <div style={{ color: '#667781' }}>Ainda sem pagamento registrado depois do Pix.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
