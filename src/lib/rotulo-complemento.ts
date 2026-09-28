// Extrai do rótulo da conta (painel IPTV) só o que difere do nome do cliente, pra sub-linha do
// balão de conta (ContasCards). Ex.: cliente "João Alves", rótulo "João Alves - quarto" → "quarto".
//
// Regra (simulada nas 1.530 contas ativas em 28/09/2026 — 67% sem sub-linha, 26% prefixo, 5% diff, 2% outra pessoa):
// 1. Rótulo vazio ou igual ao nome → null.
// 2. Rótulo começa com o nome completo (palavra por palavra, sem acento/caixa) → o resto.
// 3. Senão, remove as palavras que "são do nome" — iguais, com 1–2 letras de diferença (erro de
//    digitação: Riberio/Ribeiro) ou apelido que começa igual (Grazi/Graziele) — e conectores (de, da…).
// 4. Nenhuma palavra em comum com o nome → é outra pessoa → rótulo inteiro.

const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    anterior = atual
  }
  return anterior[b.length]
}

function limparBordas(s: string): string {
  let t = s.trim().replace(/^[\s\-–—:,;/|.]+/, '').replace(/[\s\-–—:,;/|]+$/, '')
  if (t.startsWith('(') && t.endsWith(')')) t = t.slice(1, -1).trim()
  const abre = (t.match(/\(/g) ?? []).length
  const fecha = (t.match(/\)/g) ?? []).length
  if (fecha > abre && t.endsWith(')')) t = t.slice(0, -1)
  if (abre > fecha && t.startsWith('(')) t = t.slice(1)
  return t.replace(/[\s\-–—:,;/|]+$/, '').trim()
}

type Palavra = { texto: string; fim: number; norm: string }

function palavras(s: string): Palavra[] {
  return [...s.matchAll(/\S+/g)].map((m) => ({ texto: m[0], fim: (m.index ?? 0) + m[0].length, norm: normalizar(m[0]) }))
}

export function complementoRotulo(rotulo: string | null | undefined, nomeCliente: string | null | undefined): string | null {
  const r = (rotulo ?? '').trim()
  if (!r) return null
  const doRotulo = palavras(r).filter((p) => p.norm)
  const doNome = palavras(nomeCliente ?? '').map((p) => p.norm).filter(Boolean)
  if (doNome.length === 0) return r

  // 1–2. igual ao nome, ou nome completo como prefixo
  if (doNome.length <= doRotulo.length && doNome.every((n, i) => doRotulo[i].norm === n)) {
    if (doNome.length === doRotulo.length) return null
    return limparBordas(r.slice(doRotulo[doNome.length - 1].fim)) || null
  }

  // 3–4. diferença palavra a palavra, tolerante a erro de digitação e apelido
  const ehDoNome = (x: string) =>
    doNome.some(
      (n) =>
        n === x ||
        (x.length >= 4 && n.length >= 4 && distancia(x, n) <= (Math.min(x.length, n.length) >= 7 ? 2 : 1)) ||
        (x.length >= 4 && n.startsWith(x)),
    )
  const todas = r.split(/\s+/)
  const emComum = todas.filter((t) => normalizar(t) && ehDoNome(normalizar(t))).length
  if (emComum === 0) return r
  const resto = todas.filter((t) => {
    const x = normalizar(t)
    return !x || (!CONECTORES.has(x) && !ehDoNome(x))
  })
  return limparBordas(resto.join(' ')) || null
}
