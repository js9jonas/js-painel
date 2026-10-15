import type { MetadataRoute } from "next";

// Instalação como app no celular (Chrome → "Instalar app"). Servido em /manifest.webmanifest,
// liberado sem login no src/proxy.ts junto com /icons/ — o Chrome lê antes do login.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JS Painel",
    short_name: "JS Painel",
    description: "Painel de clientes da JS Sistemas",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a3fd8",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Chat", url: "/chat" },
      { name: "Alertas", url: "/alertas" },
    ],
  };
}
