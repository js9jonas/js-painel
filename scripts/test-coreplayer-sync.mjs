// Teste direto do sync CorePlayer — sem precisar do Next.js
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=").map((p) => p.trim()))
    .filter(([k]) => k === "DATABASE_URL")
);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

const ID_PAINEL = 102;
const ID_APP = 31; // Core Player

const ORIGIN_HEADERS = { origin: "https://reseller.coreplayer.io", referer: "https://reseller.coreplayer.io/" };

async function apiFetch(token, path) {
  const res = await fetch(`https://api.coreplayer.io${path}`, {
    headers: { authorization: token, "Content-Type": "application/json", ...ORIGIN_HEADERS },
  });
  const data = await res.json();
  if (data.error) throw new Error(`CorePlayer API: ${JSON.stringify(data)}`);
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

async function login(email, senha) {
  const res = await fetch("https://api.coreplayer.io/reseller/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ORIGIN_HEADERS },
    body: JSON.stringify({ email, password: senha }),
  });
  const data = await res.json();
  if (!data.message) throw new Error(`Login falhou: ${JSON.stringify(data)}`);
  return data.message;
}

function jwtValido(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.exp && payload.exp * 1000 - 120000 > Date.now();
  } catch { return false; }
}

async function main() {
  const { rows } = await pool.query(
    `SELECT usuario, senha, session_cookie FROM public.painel_servidores WHERE id = $1`,
    [ID_PAINEL]
  );
  if (!rows.length) throw new Error("Painel 102 não encontrado.");
  const { usuario, senha, session_cookie } = rows[0];

  let jwt = session_cookie ?? "";
  if (!jwtValido(jwt)) {
    console.log("JWT expirado, fazendo login...");
    jwt = await login(usuario, senha);
    const expiry = new Date(Date.now() + 3600 * 1000);
    await pool.query(
      `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
      [jwt, expiry, ID_PAINEL]
    );
    console.log("Login OK, JWT salvo.");
  } else {
    console.log("Reutilizando JWT existente.");
  }

  const devices = await getDispositivos(jwt);
  console.log(`\n${devices.length} devices encontrados.`);

  const stats = { inseridos: 0, atualizados: 0, vinculados: 0 };

  for (const dev of devices) {
    const { rows: existentes } = await pool.query(
      `SELECT id_app_registro, id_cliente FROM public.aplicativos
       WHERE mac = $1 AND id_painel_servidor = $2 LIMIT 1`,
      [dev.mac, ID_PAINEL]
    );

    const validade = dev.activation_expired
      ? new Date(dev.activation_expired).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
      : null;

    let idAppRegistro;
    if (existentes.length > 0) {
      idAppRegistro = existentes[0].id_app_registro;
      await pool.query(
        `UPDATE public.aplicativos SET validade = $1, modelo = $2, chave = $3, atualizado_em = NOW() WHERE id_app_registro = $4`,
        [validade, dev.model ?? null, String(dev.id), idAppRegistro]
      );
      stats.atualizados++;
    } else {
      const { rows: ins } = await pool.query(
        `INSERT INTO public.aplicativos
           (id_app, mac, chave, validade, modelo, id_painel_servidor, status, data_cadastro, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, 'ativa', NOW(), NOW())
         RETURNING id_app_registro`,
        [ID_APP, dev.mac, String(dev.id), validade, dev.model ?? null, ID_PAINEL]
      );
      idAppRegistro = ins[0].id_app_registro;
      stats.inseridos++;
    }

    const jaVinculado = existentes[0]?.id_cliente;
    if (!jaVinculado && dev.device_note?.comment) {
      const { rows: clienteRows } = await pool.query(
        `SELECT id_cliente FROM public.clientes WHERE LOWER(TRIM(nome)) = LOWER(TRIM($1)) LIMIT 2`,
        [dev.device_note.comment]
      );
      if (clienteRows.length === 1) {
        await pool.query(
          `UPDATE public.aplicativos SET id_cliente = $1 WHERE id_app_registro = $2`,
          [clienteRows[0].id_cliente, idAppRegistro]
        );
        stats.vinculados++;
        console.log(`  ✅ Vinculado "${dev.mac}" → cliente "${dev.device_note.comment}"`);
      } else if (clienteRows.length > 1) {
        console.log(`  ⚠️ Ambíguo "${dev.device_note.comment}" — ${clienteRows.length} clientes encontrados.`);
      } else {
        console.log(`  ○ Sem match para "${dev.device_note.comment}"`);
      }
    }
  }

  console.log(`\nResultado: ${stats.inseridos} inseridos · ${stats.atualizados} atualizados · ${stats.vinculados} vinculados`);
  await pool.end();
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
