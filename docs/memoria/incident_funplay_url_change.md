---
name: incident_funplay_url_change
description: Sinistro recorrente — FunPlay altera URLs de playlists para hosts reserverdns*.com durante sync; procedimento completo de detecção e correção via API
metadata: 
  node_type: memory
  type: reference
  originSessionId: dfbc22c1-c0b0-4886-a882-464dd23040e1
  modified: 2026-08-24T01:28:48.880Z
---

# Sinistro: FunPlay altera URLs de playlists (reserverdns*)

Incidente já ocorreu ao menos 2 vezes. O sistema interno do FunPlay, durante o sync automático dos devices (~22h50 no caso de 22/06/2026), substitui o host original das playlists por domínios `reserverdns*.com`. O host correto **varia por incidente** — confirmar com o usuário qual host restaurar antes de executar.

**Why:** O FunPlay usa redirecionamento DNS interno (CDN/failover) que eventualmente "vaza" para a URL salva no device, corrompendo a playlist registrada no painel.

**How to apply:** Ao detectar URLs com `reserverdns` no banco, executar o procedimento abaixo antes de qualquer outra ação. Confirmar o host de destino correto com o Jonas antes de executar.

---

## 1. Detecção — query de diagnóstico

Rodar via node-pg em `/home/jonas/js-painel` (ou `/home/jonas/js-financeiro`):

```sql
SELECT
  ap.id,
  ap.id_app_registro,
  ap.playlist_id_externo,
  ap.nome,
  ap.url,
  ap.id_conta,
  ps.tipo AS painel_tipo,
  ar.chave AS device_id,
  cl.nome AS cliente,
  ct.telefone,
  ap.atualizado_em
FROM aplicativo_playlists ap
JOIN aplicativos ar ON ar.id_app_registro = ap.id_app_registro
JOIN painel_servidores ps ON ps.id = ar.id_painel_servidor
LEFT JOIN contas co ON co.id_conta = ap.id_conta
LEFT JOIN assinaturas s ON s.id_assinatura = co.id_assinatura
LEFT JOIN clientes cl ON cl.id_cliente = s.id_cliente
LEFT JOIN contatos ct ON ct.id_cliente = cl.id_cliente AND ct.telefone IS NOT NULL
WHERE ap.url ILIKE '%reserverdns%'
ORDER BY ps.tipo, ap.id;
```

Variantes de host já vistas: `reserverdnsb7d76f90a8b944b88ae08b4d349114d0.com`, `reserverdns0564c24392c44a5fa94379f6f3281d7e.com`, `reserverdnse70f8b75876543fb89e29ac95b776b68.com`.

---

## 2. APIs de edição de playlist

### FunPlays (painel_servidores id=100)
- API base: `https://api.funplays.app`
- Auth: header `authorization: <token>` (sem "Bearer")
- Token em: `SELECT session_cookie, session_expiry FROM painel_servidores WHERE id = 100`
- PUT editar: `PUT /reseller/playlist` body: `{ id, deviceId, name, url, is_protected: false }`

### LazerPlay (painel_servidores id=101)
- API base: `https://api.appacesso.com`
- Auth: mesma estrutura (header `authorization: <token>`)
- Token em: `SELECT session_cookie, session_expiry FROM painel_servidores WHERE id = 101`
- PUT editar: `PUT /reseller/playlist` (mesmo endpoint)

Token JWT dura ~1h. Se expirado, chamar `loginFunPlays(usuario, senha)` ou `loginLazerPlay(usuario, senha)` dos adapters em `/home/jonas/js-painel/src/lib/painel-adapters/`.

---

## 3. Script de correção (Node.js — rodar de `/home/jonas/js-painel`)

```js
const { Pool } = require("pg");
const DB = "postgresql://postgres:<SENHA_ATUAL>@localhost:5433/js"; // via dbtunnel, ver [[feedback-acesso-banco]]
const pool = new Pool({ connectionString: DB });

const HOST_CORRETO = "CONFIRMAR_COM_JONAS"; // ex: "bandeira5.info"

const API = {
  funplays: "https://api.funplays.app",
  lazerplay: "https://api.appacesso.com",
};

async function editarPlaylistAPI(apiBase, token, { id, deviceId, name, url }) {
  const res = await fetch(`${apiBase}/reseller/playlist`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", authorization: token },
    body: JSON.stringify({ id, deviceId, name, url, is_protected: false }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`API: ${data.message ?? JSON.stringify(data)}`);
}

async function main() {
  const { rows: paineis } = await pool.query(
    `SELECT id, tipo, session_cookie FROM public.painel_servidores WHERE id IN (100, 101)`
  );
  const tokens = {};
  for (const p of paineis) tokens[p.tipo] = p.session_cookie;

  const { rows: playlists } = await pool.query(`
    SELECT
      ap.id, ap.id_app_registro,
      ap.playlist_id_externo::int AS playlist_id_externo,
      ap.nome, ap.url,
      regexp_replace(ap.url, 'http://[^/]+(/.*)', 'http://${HOST_CORRETO}\\1') AS url_nova,
      ps.tipo AS painel_tipo,
      ar.chave::int AS device_id
    FROM aplicativo_playlists ap
    JOIN aplicativos ar ON ar.id_app_registro = ap.id_app_registro
    JOIN painel_servidores ps ON ps.id = ar.id_painel_servidor
    WHERE ap.url ILIKE '%reserverdns%'
    ORDER BY ps.tipo, ap.id
  `);

  console.log(`Total: ${playlists.length} playlists`);
  const duplicatas = [];

  for (const pl of playlists) {
    const apiBase = API[pl.painel_tipo];
    const token = tokens[pl.painel_tipo];
    try {
      await editarPlaylistAPI(apiBase, token, {
        id: pl.playlist_id_externo, deviceId: pl.device_id,
        name: pl.nome, url: pl.url_nova,
      });
      await pool.query(
        `UPDATE public.aplicativo_playlists SET url = $1, atualizado_em = NOW() WHERE id = $2`,
        [pl.url_nova, pl.id]
      );
      console.log(`[OK] id=${pl.id} ${pl.nome} → ${pl.url_nova}`);
    } catch (e) {
      if (e.message.includes("already exist")) {
        console.log(`[DUPLICATA] id=${pl.id} ${pl.nome} — device já tem essa URL`);
        duplicatas.push(pl);
      } else {
        console.log(`[ERRO] id=${pl.id} ${pl.nome}: ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Excluir duplicatas (device já tem url_nova, essa virou órfã)
  for (const pl of duplicatas) {
    try {
      const apiBase = API[pl.painel_tipo];
      const token = tokens[pl.painel_tipo];
      await fetch(`${apiBase}/reseller/playlist`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", authorization: token },
        body: JSON.stringify({ id: pl.playlist_id_externo, deviceId: pl.device_id }),
      });
      await pool.query(`DELETE FROM public.aplicativo_playlists WHERE id = $1`, [pl.id]);
      console.log(`[EXCLUÍDA] id=${pl.id} ${pl.nome}`);
    } catch (e) {
      console.log(`[ERRO DELETE] id=${pl.id}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
```

---

## 4. Padrão "Playlist already exist"

Quando o PUT retorna esse erro, significa que o device já tem uma playlist com a `url_nova` (ou o FunPlay criou uma internamente). A duplicata com `reserverdns` deve ser **excluída** (DELETE /reseller/playlist), não atualizada. O script acima já lida com isso automaticamente.

---

## 5. M3U lines no arquivo têm `\r` (CRLF)

As URLs do M3U do FunPlay têm terminação Windows (`\r\n`). Ao ler com grep/shell, fazer `tr -d '\r\n '` antes de usar a URL. Sem isso o curl retorna "Malformed input".

---

## 6. Como verificar se stream está ativo

```bash
# Baixar playlist
curl -s "http://<host>/get.php?username=<user>&password=<pass>&type=m3u_plus&output=ts" -o lista.m3u

# Contar entradas
grep -c '#EXTINF' lista.m3u

# Verificar conta via player_api
curl -s "http://<host>/player_api.php?username=<user>&password=<pass>"

# Testar stream (remover \r das URLs)
URL=$(grep -A1 'CANAIS COMPLETO' lista.m3u | grep '^http' | head -1 | tr -d '\r\n ')
curl -sL --max-time 8 -o /dev/null -w "%{http_code}" "$URL"
```
