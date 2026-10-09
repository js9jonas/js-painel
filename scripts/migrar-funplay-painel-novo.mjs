// Migração ÚNICA dos aparelhos FunPlay do painel antigo (id 100) pro novo (id 106) — 08/10/2026.
// Ver docs/memoria/project_funplay_dois_paineis.md.
//
// Uso (daqui do PC, com o túnel do banco aberto):
//   node --env-file=.env.local scripts/migrar-funplay-painel-novo.mjs listar        # só mostra, não mexe em nada
//   node --env-file=.env.local scripts/migrar-funplay-painel-novo.mjs testar 2      # migra 2 (com cliente e playlist) e confere tudo
//   node --env-file=.env.local scripts/migrar-funplay-painel-novo.mjs tudo          # migra o resto, devagar
//
// Por aparelho COM VALIDADE no antigo: validate_mac + add_existing_device { mac, key } no NOVO
// (chave real lida AO VIVO do antigo) → comentário = nome do cliente (ou o comentário do antigo).
// Endpoints capturados no painel em 08/10/2026. Para no 1º erro inesperado (nada é desfeito
// sozinho — o que já migrou fica migrado, que é o objetivo). Depois: sync no /conexoes.
import pg from 'pg';

const API = 'https://api.funplays.app';
const SITE = 'https://reseller.funplays.app';
const RECAPTCHA = '6LcS2BYsAAAAALlg6fQnrKJLBTheTQbiyy6hUbnz';
const ID_ANTIGO = 100;
const ID_NOVO = 106;
const PAUSA_MS = 1500; // entre aparelhos: sem pressa, pra não acionar limite do FunPlay

const [modo = 'listar', qtdArg] = process.argv.slice(2);
if (!['listar', 'testar', 'tudo'].includes(modo)) {
  console.error('Modo: listar | testar [N] | tudo');
  process.exit(1);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hoje = new Date();

async function captcha() {
  const clientKey = process.env.CAPSOLVER_API_KEY;
  if (!clientKey) throw new Error('CAPSOLVER_API_KEY não definida');
  const t = await (await fetch('https://api.capsolver.com/createTask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey, task: { type: 'ReCaptchaV2EnterpriseTaskProxyless', websiteURL: SITE, websiteKey: RECAPTCHA } }),
  })).json();
  if (t.errorId) throw new Error(`CapSolver: ${t.errorDescription}`);
  for (let i = 0; i < 30; i++) {
    await espera(4000);
    const r = await (await fetch('https://api.capsolver.com/getTaskResult', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientKey, taskId: t.taskId }),
    })).json();
    if (r.status === 'ready') return r.solution.gRecaptchaResponse;
    if (r.errorId) throw new Error(`CapSolver: ${r.errorDescription}`);
  }
  throw new Error('reCAPTCHA não resolvido');
}

async function api(jwt, caminho, opcoes = {}) {
  const res = await fetch(API + caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', authorization: jwt, ...(opcoes.headers ?? {}) },
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok || corpo.error) throw new Error(`${caminho} → ${res.status} ${JSON.stringify(corpo.message ?? corpo).slice(0, 200)}`);
  return corpo.message;
}

async function login(db, idPainel) {
  const { rows: [p] } = await db.query('SELECT nome, usuario, senha FROM public.painel_servidores WHERE id = $1', [idPainel]);
  const res = await fetch(API + '/reseller/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: p.usuario, password: p.senha, token: await captcha() }),
  });
  const corpo = await res.json();
  if (corpo.error || !corpo.message) throw new Error(`login ${p.nome} falhou: ${JSON.stringify(corpo.message ?? corpo)}`);
  return corpo.message;
}

async function todos(jwt) {
  const lista = [];
  for (let pg_ = 1; pg_ < 500; pg_++) {
    const d = await api(jwt, `/reseller/devices?limit=100&pagination=1&page=${pg_}&sort=["id","DESC"]`);
    lista.push(...(d.rows ?? []));
    if (pg_ >= d.pageCount) break;
  }
  return lista;
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  console.log('Login nos dois painéis…');
  const [jwtAntigo, jwtNovo] = [await login(db, ID_ANTIGO), await login(db, ID_NOVO)];
  const [antigo, novo] = [await todos(jwtAntigo), await todos(jwtNovo)];
  const noNovo = new Set(novo.map((d) => d.mac.toUpperCase()));

  const comValidade = antigo.filter((d) => d.activation_expired && new Date(d.activation_expired) > hoje && !noNovo.has(d.mac.toUpperCase()));
  const { rows: banco } = await db.query(
    `SELECT UPPER(ap.mac) mac, cl.nome, (SELECT count(*)::int FROM public.aplicativo_playlists pl WHERE pl.id_app_registro = ap.id_app_registro) playlists
     FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     WHERE ap.id_app = 3 AND ap.removido_em IS NULL AND UPPER(ap.mac) = ANY($1)`,
    [comValidade.map((d) => d.mac.toUpperCase())],
  );
  const info = new Map(banco.map((b) => [b.mac, b]));
  const itens = comValidade
    .map((d) => ({ dev: d, cliente: info.get(d.mac.toUpperCase())?.nome ?? null, playlists: info.get(d.mac.toUpperCase())?.playlists ?? 0 }))
    .sort((a, b) => Date.parse(a.dev.activation_expired) - Date.parse(b.dev.activation_expired));

  console.log(`\nPainel antigo: ${antigo.length} aparelhos · ${antigo.length - comValidade.length} fora (vencidos ou já no novo) · ${itens.length} A MIGRAR`);
  console.log(`  com cliente no js-painel: ${itens.filter((i) => i.cliente).length} · sem cliente: ${itens.filter((i) => !i.cliente).length} · sem chave: ${itens.filter((i) => !i.dev.key).length} · com playlist no banco: ${itens.filter((i) => i.playlists > 0).length}`);
  console.log(`Painel novo hoje: ${novo.length} aparelhos`);

  if (modo === 'listar') {
    console.log('\nPrimeiros 15 (validade mais próxima):');
    for (const i of itens.slice(0, 15)) {
      console.log(`  ${i.dev.mac}  chave ${i.dev.key ?? '—'}  validade ${i.dev.activation_expired.slice(0, 10)}  ${i.cliente ?? `(sem cliente; comentário: ${i.dev.device_note?.comment ?? 'N/A'})`}${i.playlists ? ` · ${i.playlists} playlist(s)` : ''}`);
    }
    process.exit(0);
  }

  // testar: N com cliente E playlist (pra conferir se a playlist vai junto); tudo: o resto.
  const fila = modo === 'testar'
    ? itens.filter((i) => i.cliente && i.playlists > 0 && i.dev.key).slice(0, Number(qtdArg) || 2)
    : itens;
  console.log(`\nMigrando ${fila.length}…`);
  let ok = 0;
  for (const [n, i] of fila.entries()) {
    const { dev } = i;
    if (!dev.key) {
      console.log(`  [${n + 1}/${fila.length}] ${dev.mac} PULADO: sem chave no painel antigo`);
      continue;
    }
    const plAntes = modo === 'testar' ? (await api(jwtAntigo, `/reseller/playlist?deviceId=${dev.id}`)).length : null;
    await api(jwtNovo, `/reseller/validate_mac?mac=${encodeURIComponent(dev.mac)}`);
    await api(jwtNovo, '/reseller/add_existing_device', { method: 'POST', body: JSON.stringify({ mac: dev.mac, key: String(dev.key) }) });
    const comentario = (i.cliente ?? dev.device_note?.comment ?? '').trim();
    if (comentario && comentario.toUpperCase() !== 'N/A') {
      await api(jwtNovo, '/reseller/device/comment', { method: 'PUT', body: JSON.stringify({ comment: comentario.slice(0, 100), id: dev.id }) });
    }
    ok++;
    console.log(`  [${n + 1}/${fila.length}] ${dev.mac} ✔ ${comentario || '(sem comentário)'} · validade ${dev.activation_expired.slice(0, 10)}`);

    if (modo === 'testar') {
      // Confere: está no novo com a mesma validade e o comentário, saiu do antigo, playlists.
      const novoAgora = (await todos(jwtNovo)).find((d) => d.mac.toUpperCase() === dev.mac.toUpperCase());
      const aindaNoAntigo = (await todos(jwtAntigo)).some((d) => d.mac.toUpperCase() === dev.mac.toUpperCase());
      const plDepois = novoAgora ? (await api(jwtNovo, `/reseller/playlist?deviceId=${novoAgora.id}`)).length : null;
      console.log(`      no novo: ${novoAgora ? 'sim' : 'NÃO'} · mesmo número interno: ${novoAgora?.id === dev.id} · validade ${novoAgora?.activation_expired?.slice(0, 10)} (antes ${dev.activation_expired.slice(0, 10)}) · comentário "${novoAgora?.device_note?.comment ?? 'N/A'}" · ainda no antigo: ${aindaNoAntigo} · playlists ${plAntes} → ${plDepois}`);
    }
    await espera(PAUSA_MS);
  }
  console.log(`\nFim: ${ok} migrado(s). Agora rode o sync de um card FunPlay no /conexoes.`);
} catch (e) {
  console.error(`\nPAROU: ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
