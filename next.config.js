/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // impit e @napi-rs/canvas usam módulo nativo Rust (NAPI) — não podem ser empacotados pelo webpack/turbopack
  serverExternalPackages: ["impit", "@napi-rs/canvas"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

module.exports = nextConfig;