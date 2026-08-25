import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdf.js) carrega um worker (.mjs) do próprio pacote em
  // tempo de execução — empacotado pelo Turbopack, esse arquivo não fica
  // disponível no chunk final e a leitura de PDF falha com "Setting up
  // fake worker failed". Marcando como externo, roda via require normal
  // do Node direto de node_modules, onde o worker está do lado do módulo.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
