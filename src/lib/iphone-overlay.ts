import sharp from "sharp";
import fs from "fs";
import path from "path";

const ASSETS_DIR = path.join(process.cwd(), "src", "assets", "whatsapp-iphone");
const BASE_LIMPA = path.join(ASSETS_DIR, "enter-playlist-base.png");
const FONTE = path.join(ASSETS_DIR, "LiberationSans-Bold.ttf");
const FONT_FAMILY = "IPTVDataFontEmbutida";
const FONT_SIZE = 31;

// Coordenadas calibradas por varredura de pixel em enter-playlist-base.png (1280x591).
// Recalibrar se a imagem-base for substituída.
const CAMPOS = [
  { chave: "playlistName", top: 110, height: 70 },
  { chave: "usuario", top: 197, height: 70 },
  { chave: "senha", top: 284, height: 70 },
  { chave: "url", top: 371, height: 70 },
] as const;
const TEXTO_LEFT = 568 + 18;

let fonteBase64Cache: string | null = null;
function carregarFonteBase64(): string {
  if (!fonteBase64Cache) {
    fonteBase64Cache = fs.readFileSync(FONTE).toString("base64");
  }
  return fonteBase64Cache;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DadosIphone = {
  playlistName: string;
  usuario: string;
  senha: string;
  url: string;
};

export async function gerarImagemDadosIphone(dados: DadosIphone): Promise<Buffer> {
  const fonteBase64 = carregarFonteBase64();

  const textos = CAMPOS.map((c) => {
    const baseline = c.top + c.height / 2 + FONT_SIZE * 0.35;
    const valor = escapeXml(dados[c.chave]);
    return `<text x="${TEXTO_LEFT}" y="${baseline}" class="campo">${valor}</text>`;
  }).join("\n");

  const svg = `
<svg width="1280" height="591" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style type="text/css">
      @font-face {
        font-family: '${FONT_FAMILY}';
        src: url(data:font/ttf;base64,${fonteBase64}) format('truetype');
      }
      .campo { font-family: '${FONT_FAMILY}'; font-size: ${FONT_SIZE}px; fill: #2b1338; }
    </style>
  </defs>
  ${textos}
</svg>`;

  return sharp(BASE_LIMPA)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export function lerAssetEstatico(nome: "logo-app.png" | "choose-playlist-type.png" | "parental-control.png"): Buffer {
  return fs.readFileSync(path.join(ASSETS_DIR, nome));
}
