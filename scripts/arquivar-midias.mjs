/**
 * Worker de arquivamento de mídias do WhatsApp → Google Drive
 *
 * - Busca mensagens com mídia sem media_url no banco
 * - Baixa o arquivo da Meta Cloud API
 * - Sobe para o Google Drive em WhatsApp Mídias/{YYYY-MM}/{tipo}/
 * - Atualiza media_url e media_drive_id no banco
 *
 * Uso:
 *   node scripts/arquivar-midias.mjs           # processa pendentes (max 50)
 *   node scripts/arquivar-midias.mjs --dry-run  # só conta, não arquiva
 *   node scripts/arquivar-midias.mjs --batch 20 # processa N por vez
 */

import { google } from 'googleapis';
import pkg from 'pg';
import https from 'https';
import { Readable } from 'stream';

const { Pool } = pkg;

// ─── Config ────────────────────────────────────────────────────────────────

const DB_URL   = process.env.DATABASE_URL || 'postgresql://postgres:87fec72605778bc4dd1a@168.231.98.162:5432/js';
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
if (!WA_TOKEN) throw new Error('WHATSAPP_TOKEN não definida');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_DRIVE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN)
  throw new Error('GOOGLE_DRIVE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN não definidas');

const DRIVE_PASTA_RAIZ = 'WhatsApp Mídias';
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

// ─── Google Drive ────────────────────────────────────────────────────────────

function criarDriveClient() {
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

const pastaCache = new Map(); // path → id

async function obterOuCriarPasta(drive, nome, parentId) {
  const cacheKey = `${parentId}/${nome}`;
  if (pastaCache.has(cacheKey)) return pastaCache.get(cacheKey);

  const res = await drive.files.list({
    q: `name='${nome}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let id;
  if (res.data.files.length > 0) {
    id = res.data.files[0].id;
  } else {
    const created = await drive.files.create({
      requestBody: { name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    id = created.data.id;
    console.log(`  📁 Pasta criada: ${nome}`);
  }

  pastaCache.set(cacheKey, id);
  return id;
}

async function obterPastaRaiz(drive) {
  const cacheKey = `root/${DRIVE_PASTA_RAIZ}`;
  if (pastaCache.has(cacheKey)) return pastaCache.get(cacheKey);

  const res = await drive.files.list({
    q: `name='${DRIVE_PASTA_RAIZ}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
    fields: 'files(id)',
  });

  let id;
  if (res.data.files.length > 0) {
    id = res.data.files[0].id;
  } else {
    const created = await drive.files.create({
      requestBody: { name: DRIVE_PASTA_RAIZ, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    id = created.data.id;
    console.log(`  📁 Pasta raiz criada: ${DRIVE_PASTA_RAIZ}`);
  }

  pastaCache.set(cacheKey, id);
  return id;
}

async function obterPastaDestino(drive, anoMes, tipo) {
  const raizId    = await obterPastaRaiz(drive);
  const mesId     = await obterOuCriarPasta(drive, anoMes, raizId);
  const tipoId    = await obterOuCriarPasta(drive, TIPO_PASTA[tipo] || tipo, mesId);
  return tipoId;
}

async function uploadParaDrive(drive, { nomeArquivo, mimeType, stream, pastaId }) {
  const res = await drive.files.create({
    requestBody: { name: nomeArquivo, parents: [pastaId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  });
  return { driveId: res.data.id, url: res.data.webViewLink };
}

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

function downloadStream(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download falhou: ${res.statusCode}`));
        return;
      }
      resolve(res); // readable stream
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

async function marcarArquivada(pool, id, driveId, url) {
  await pool.query(`
    UPDATE whatsapp_mensagens
    SET media_url = $1, media_drive_id = $2, media_arquivada_em = NOW()
    WHERE id = $3
  `, [url, driveId, id]);
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
  const pool  = new Pool({ connectionString: DB_URL });
  const drive = criarDriveClient();

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

      // 2. Stream do arquivo
      const stream = await downloadStream(meta.url);

      // 3. Pasta de destino no Drive
      const pastaId = await obterPastaDestino(drive, anoMes, tipo);

      // 4. Upload
      const { driveId, url } = await uploadParaDrive(drive, {
        nomeArquivo, mimeType, stream, pastaId,
      });

      // 5. Atualizar banco
      await marcarArquivada(pool, msg.id, driveId, url);

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
