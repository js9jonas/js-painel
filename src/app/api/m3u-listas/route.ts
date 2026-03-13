// src/app/api/m3u-listas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { testarLista } from '@/lib/m3u-tester'

// GET /api/m3u-listas
export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT
        l.id,
        l.nome,
        l.url_m3u,
        l.tipo,
        l.host,
        l.usuario,
        l.porta,
        l.ativo,
        l.indexar_conteudo,
        l.intervalo_teste_min,
        l.criado_em,
        l.ultimo_teste_em,
        t.status           AS ultimo_status,
        t.ping_ms,
        t.jitter_ms,
        t.perda_pacotes_pct,
        t.ttfb_ms,
        t.velocidade_kbps,
        t.tempo_download_ms,
        t.tamanho_lista_kb,
        t.http_status,
        t.erro_mensagem,
        s.total_canais,
        s.total_filmes,
        s.total_series,
        s.total_geral,
        s.capturado_em     AS snapshot_em,
        ROUND(
          100.0 * COUNT(t24.id) FILTER (WHERE t24.status = 'online')
               / NULLIF(COUNT(t24.id), 0), 1
        ) AS uptime_24h
      FROM m3u_listas l
      LEFT JOIN LATERAL (
        SELECT * FROM m3u_testes
        WHERE lista_id = l.id
        ORDER BY testado_em DESC
        LIMIT 1
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT * FROM m3u_snapshots
        WHERE lista_id = l.id
        ORDER BY capturado_em DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN m3u_testes t24
        ON t24.lista_id = l.id
        AND t24.testado_em >= NOW() - INTERVAL '24 hours'
      GROUP BY l.id, t.status, t.ping_ms, t.jitter_ms, t.perda_pacotes_pct,
               t.ttfb_ms, t.velocidade_kbps, t.tempo_download_ms,
               t.tamanho_lista_kb, t.http_status, t.erro_mensagem,
               s.total_canais, s.total_filmes, s.total_series,
               s.total_geral, s.capturado_em
      ORDER BY l.ativo DESC, l.nome ASC
    `)

    return NextResponse.json(rows)
  } catch (err) {
    console.error('[m3u-listas] GET error:', err)
    return NextResponse.json({ error: 'Erro ao buscar listas' }, { status: 500 })
  }
}

// POST /api/m3u-listas
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      nome,
      url_m3u,
      tipo = 'url',
      host,
      usuario,
      senha,
      porta,
      ativo = true,
      indexar_conteudo = false,
      intervalo_teste_min = 15,
    } = body

    if (!nome?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    if (tipo === 'url' && !url_m3u?.trim()) {
      return NextResponse.json({ error: 'URL da lista é obrigatória' }, { status: 400 })
    }
    if (tipo === 'xtream' && (!host || !usuario || !senha)) {
      return NextResponse.json(
        { error: 'Host, usuário e senha são obrigatórios para Xtream Codes' },
        { status: 400 }
      )
    }

    // monta a URL do M3U para xtream automaticamente
    const url_final =
      tipo === 'xtream'
        ? `${host}/get.php?username=${usuario}&password=${senha}&type=m3u_plus&output=ts`
        : url_m3u.trim()

    const { rows } = await pool.query(
      `INSERT INTO m3u_listas
        (nome, url_m3u, tipo, host, usuario, senha, porta,
         ativo, indexar_conteudo, intervalo_teste_min)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        nome.trim(),
        url_final,
        tipo,
        host || null,
        usuario || null,
        senha || null,
        porta || null,
        ativo,
        indexar_conteudo,
        intervalo_teste_min,
      ]
    )

    const novaLista = rows[0]

    testarLista(novaLista.id).catch(err =>
      console.error(`[m3u-listas] Erro no teste inicial da lista ${novaLista.id}:`, err)
    )

    return NextResponse.json(novaLista, { status: 201 })
  } catch (err) {
    console.error('[m3u-listas] POST error:', err)
    return NextResponse.json({ error: 'Erro ao cadastrar lista' }, { status: 500 })
  }
}