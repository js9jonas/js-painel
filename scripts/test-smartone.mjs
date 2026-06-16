// Script ad-hoc de validação manual — não faz parte do build.
import {
  loginSmartOne,
  getDispositivos,
  getPlaylistsDispositivo,
  getCreditosDisponiveis,
} from "../src/lib/painel-adapters/smartone.ts";

const EMAIL = "js9jonas@gmail.com";
const SENHA = "821920";

(async () => {
  console.log("Login...");
  const { token, expiry } = await loginSmartOne(EMAIL, SENHA);
  console.log("Cookie obtido, expiry:", expiry);

  console.log("\nCréditos (giftcodes Unused):");
  const creditos = await getCreditosDisponiveis(token);
  console.log(creditos);

  console.log("\nDispositivos (1a página apenas, para teste rápido)...");
  const todos = await getDispositivos(token);
  console.log("Total devices:", todos.length);
  console.log("Amostra (3 primeiros):", todos.slice(0, 3));

  const comPlaylist = todos.find((d) => d.mac === "E8:AA:CB:26:17:80") ?? todos[0];
  console.log("\nPlaylist do device", comPlaylist.mac, "(id", comPlaylist.id, ")...");
  const playlists = await getPlaylistsDispositivo(token, comPlaylist.id);
  console.log(playlists);
})().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
