/**
 * Worker de arquivamento de mídias do WhatsApp → disco local
 *
 * - Busca mensagens com mídia sem media_url no banco
 * - Baixa o arquivo da Meta Cloud API
 * - Grava em ARQUIVO_MIDIA_ROOT/{YYYY-MM}/{tipo}/
 * - Atualiza media_url e media_local_path no banco
 *
 * Uso:
 *   node scripts/arquivar-midias.mjs           # processa pendentes (max 50)
 *   node scripts/arquivar-midias.mjs --dry-run  # só conta, não arquiva
 *   node scripts/arquivar-midias.mjs --batch 20 # processa N por vez
 */

import pkg from 'pg';
import https from 'https';
import fs from 'fs';
import path from 'path';

const { Pool } = pkg;

// ─── Config ────────────────────────────────────────────────────────────────

const DB_URL   = process.env.DATABASE_URL || 'postgresql://postgres:87fec72605778bc4dd1a@168.231.98.162:5432/js';
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
if (!WA_TOKEN) throw new Error('WHATSAPP_TOKEN não definida');

const MIDIA_ROOT = process.env.WHATSAPP_MIDIA_ROOT || '/app/whatsapp-midias';
const META_GRAPH_VERSION = 'v20.0';

const TIPO_EXTENSAO = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/mp4': 'm4a',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'application/pdf': 'pdf', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/gif': 'gif',
};

const TIPO_PASTA = {
  image: 'imagens', audio: 'audios', video: 'videos',
  document: 'documentos', sticker: 'stickers',
};

// ─── Args ───────────────────────────────────────────────────────────────────

const DRY_RUN  = process.argv.includes('--dry-run');
const batchArg = process.argv.indexOf('--batch');
const BATCH    = batchArg !== -1 ? parseInt(process.argv[batchArg + 1]) : 50;

// ─── Meta API ────────────────────────────────────────────────────────────────

async function obterUrlMidia(mediaId) {
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${mediaId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  return data; // { url, mime_type, sha256, file_size }
}

function downloadParaArquivo(url, destino) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download falhou: ${res.statusCode}`));
        return;
      }
      const arquivo = fs.createWriteStream(destino);
      res.pipe(arquivo);
      arquivo.on('finish', () => arquivo.close(resolve));
      arquivo.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Banco ───────────────────────────────────────────────────────────────────

async function buscarPendentes(pool, limit) {
  const { rows } = await pool.query(`
    SELECT id, wa_msg_id, conteudo, tipo, media_mime, nome_arquivo, origem, criado_em
    FROM whatsapp_mensagens
    WHERE tipo IN ('image', 'audio', 'video', 'document', 'sticker')
      AND conteudo ~ '^[0-9]+$'
      AND media_url IS NULL
    ORDER BY criado_em DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

async function marcarArquivada(pool, id, localPath) {
  await pool.query(`
    UPDATE whatsapp_mensagens
    SET media_url = $1, media_local_path = $1, media_arquivada_em = NOW()
    WHERE id = $2
  `, [localPath, id]);
}

async function marcarErro(pool, id, motivo) {
  await pool.query(`
    UPDATE whatsapp_mensagens
    SET media_url = $1, media_arquivada_em = NOW()
    WHERE id = $2
  `, [`ERRO: ${motivo.substring(0, 200)}`, id]);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Contagem geral
  const { rows: [{ total, expiradas }] } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE tipo IN ('image','audio','video','document','sticker') AND conteudo ~ '^[0-9]+$' AND media_url IS NULL) as total,
      COUNT(*) FILTER (WHERE tipo IN ('image','audio','video','document','sticker') AND conteudo ~ '^[0-9]+$' AND media_url IS NULL AND criado_em < NOW() - INTERVAL '30 days') as expiradas
    FROM whatsapp_mensagens
  `);

  console.log(`\n📊 Mídias pendentes: ${total} (${expiradas} provavelmente expiradas >30 dias)\n`);

  if (DRY_RUN) {
    console.log('Modo dry-run — nenhum arquivo será processado.');
    await pool.end();
    return;
  }

  const pendentes = await buscarPendentes(pool, BATCH);
  console.log(`🔄 Processando ${pendentes.length} mídias (lote de ${BATCH})...\n`);

  let ok = 0, erros = 0;

  for (const msg of pendentes) {
    const mediaId = msg.conteudo;
    const anoMes  = new Date(msg.criado_em).toISOString().substring(0, 7); // YYYY-MM
    const tipo    = msg.tipo;
    const origem  = msg.origem === 'cliente' ? 'recebida' : 'enviada';

    process.stdout.write(`  [${msg.id}] ${tipo} ${origem} ${anoMes} ... `);

    try {
      // 1. Obter URL temporária da Meta
      const meta     = await obterUrlMidia(mediaId);
      const mimeType = meta.mime_type || msg.media_mime || 'application/octet-stream';
      const ext      = TIPO_EXTENSAO[mimeType] || mimeType.split('/')[1] || 'bin';
      const nomeBase = msg.nome_arquivo || `${msg.wa_msg_id || msg.id}`;
      const nomeArquivo = nomeBase.endsWith(`.${ext}`) ? nomeBase : `${nomeBase}.${ext}`;

      // 2. Pasta de destino local
      const pastaRelativa = path.join(anoMes, TIPO_PASTA[tipo] || tipo);
      const pastaAbsoluta = path.join(MIDIA_ROOT, pastaRelativa);
      fs.mkdirSync(pastaAbsoluta, { recursive: true });

      // 3. Download direto pro disco
      const caminhoRelativo  = path.join(pastaRelativa, nomeArquivo);
      const caminhoAbsoluto  = path.join(MIDIA_ROOT, caminhoRelativo);
      await downloadParaArquivo(meta.url, caminhoAbsoluto);

      // 4. Atualizar banco
      await marcarArquivada(pool, msg.id, caminhoRelativo);

      console.log(`✅ ${nomeArquivo}`);
      ok++;
    } catch (err) {
      const motivo = err.message || String(err);
      const expirou = motivo.includes('2069') || motivo.includes('unsupported') || motivo.includes('does not exist');
      console.log(`❌ ${expirou ? '[expirado]' : '[erro]'} ${motivo.substring(0, 80)}`);
      await marcarErro(pool, msg.id, motivo);
      erros++;
    }

    // 1.2s entre requests = ~50/min, dentro do limite da Meta Business API
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\n✅ Arquivados: ${ok}  ❌ Erros: ${erros}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
