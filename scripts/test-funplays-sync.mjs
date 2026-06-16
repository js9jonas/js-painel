// Script de teste direto do sync FunPlays (sem HTTP auth)
// Uso: node scripts/test-funplays-sync.mjs

import pg from 'pg';
import { URL } from 'url';

const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://postgres:87fec72605778bc4dd1a@168.231.98.162:5432/js'
});

const ID_PAINEL = 100;       // painel_servidores.id do FunPlays
const ID_APP_FUNPLAY = 3;    // apps.id_app = "Fun Play"
const API = 'https://api.funplays.app';

function extrairUsername(url) {
  try { return new URL(url).searchParams.get('username'); } catch { return null; }
}

function jwtValido(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.exp != null && Number(payload.exp) * 1000 - 2 * 60 * 1000 > Date.now();
  } catch { return false; }
}

async function apiFetch(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', authorization: token }
  });
  const data = await res.json();
  if (data.error) throw new Error(`API: ${data.message}`);
  return data.message;
}

async function getDispositivos(token) {
  const all = [];
  let page = 1;
  while (true) {
    const data = await apiFetch(token, `/reseller/devices?limit=100&page=${page}&sort=["id","DESC"]`);
    all.push(...data.rows);
    if (page >= data.pageCount) break;
    page++;
  }
  return all;
}

async function getPlaylists(token, deviceId) {
  const data = await apiFetch(token, `/reseller/playlist?deviceId=${deviceId}`);
  return Array.isArray(data) ? data : [];
}

async function main() {
  // Buscar credenciais
  const { rows } = await pool.query(
    `SELECT usuario, senha, session_cookie, session_expiry FROM public.painel_servidores WHERE id = $1`,
    [ID_PAINEL]
  );
  if (!rows.length) throw new Error('Painel não encontrado.');
  const creds = rows[0];

  let jwt = creds.session_cookie ?? '';
  if (!jwtValido(jwt)) {
    throw new Error('JWT expirado. Insira um novo token manualmente ou configure CAPSOLVER_API_KEY.');
  }
  console.log('✅ JWT válido, iniciando sync...\n');

  // Buscar devices
  console.log('📡 Buscando devices do FunPlays...');
  const devices = await getDispositivos(jwt);
  console.log(`   ${devices.length} devices encontrados\n`);

  const stats = { inseridos: 0, atualizados: 0, playlists: 0, playlists_vinculadas: 0 };

  for (let i = 0; i < devices.length; i++) {
    const dev = devices[i];
    if (i % 50 === 0) process.stdout.write(`   Processando ${i + 1}/${devices.length}...\r`);

    const validade = dev.activation_expired
      ? new Date(dev.activation_expired).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      : null;

    // Upsert aplicativos
    const { rows: existentes } = await pool.query(
      `SELECT id_app_registro FROM public.aplicativos WHERE mac = $1 AND id_painel_servidor = $2 LIMIT 1`,
      [dev.mac, ID_PAINEL]
    );

    let idAppRegistro;
    if (existentes.length > 0) {
      idAppRegistro = existentes[0].id_app_registro;
      await pool.query(
        `UPDATE public.aplicativos SET validade=$1, modelo=$2, chave=$3, atualizado_em=NOW() WHERE id_app_registro=$4`,
        [validade, dev.model ?? null, String(dev.id), idAppRegistro]
      );
      stats.atualizados++;
    } else {
      const { rows: ins } = await pool.query(
        `INSERT INTO public.aplicativos (id_app, mac, chave, validade, modelo, id_painel_servidor, status, data_cadastro, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,'ativa',NOW(),NOW()) RETURNING id_app_registro`,
        [ID_APP_FUNPLAY, dev.mac, String(dev.id), validade, dev.model ?? null, ID_PAINEL]
      );
      idAppRegistro = ins[0].id_app_registro;
      stats.inseridos++;
    }

    // Playlists
    let playlists = [];
    try { playlists = await getPlaylists(jwt, dev.id); } catch { continue; }

    for (const pl of playlists) {
      let idConta = null;
      const username = pl.url ? extrairUsername(pl.url) : null;
      if (username) {
        const { rows: c } = await pool.query(
          `SELECT id_conta FROM public.contas WHERE usuario=$1 AND removido_em IS NULL LIMIT 1`,
          [username]
        );
        idConta = c[0]?.id_conta ?? null;
        if (idConta) stats.playlists_vinculadas++;
      }

      await pool.query(
        `INSERT INTO public.aplicativo_playlists (id_app_registro, playlist_id_externo, nome, url, is_selected, expired_date, id_conta, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (id_app_registro, playlist_id_externo) DO UPDATE SET
           nome=EXCLUDED.nome, url=EXCLUDED.url, is_selected=EXCLUDED.is_selected,
           expired_date=EXCLUDED.expired_date, id_conta=EXCLUDED.id_conta, atualizado_em=NOW()`,
        [idAppRegistro, pl.id, pl.name ?? null, pl.url ?? null, pl.is_selected ?? false, pl.expired_date ?? null, idConta]
      );
      stats.playlists++;
    }
  }

  console.log('\n');
  console.log('✅ Sync concluído!');
  console.log(`   Devices: ${devices.length} total`);
  console.log(`   Aplicativos inseridos:  ${stats.inseridos}`);
  console.log(`   Aplicativos atualizados: ${stats.atualizados}`);
  console.log(`   Playlists sincronizadas: ${stats.playlists}`);
  console.log(`   Playlists vinculadas a contas: ${stats.playlists_vinculadas}`);
}

main().catch(e => { console.error('ERRO:', e.message); }).finally(() => pool.end());
