/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // impit usa módulo nativo Rust (NAPI) — não pode ser empacotado pelo webpack
  serverExternalPackages: ["impit"],
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