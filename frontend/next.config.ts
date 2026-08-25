import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdf.js) carrega um worker (.mjs) do próprio pacote em
  // tempo de execução — empacotado pelo Turbopack, esse arquivo não fica
  // disponível no chunk final e a leitura de PDF falha com "Setting up
  // fake worker failed". Marcando como externo, roda via require normal
  // do Node direto de node_modules, onde o worker está do lado do módulo.
  serverExternalPackages: ["pdf-parse"],
  // O import do worker é dinâmico (calculado em runtime pelo pdf.js), e o
  // rastreador de arquivos do Vercel (baseado em análise estática) não
  // enxerga isso — sem essa inclusão explícita, o arquivo do worker some
  // no deploy (funciona local, quebra em produção com "server error").
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/pdf-parse/**/*.mjs",
      "./node_modules/pdfjs-dist/**/*.mjs",
      // pdf-parse usa @napi-rs/canvas em Node pra dar polyfill de
      // DOMMatrix/ImageData/Path2D (pdf.js precisa disso mesmo só pra
      // extrair texto, não só pra renderizar) — o binário nativo é
      // carregado com `require()` condicional em process.platform/arch,
      // que o rastreador de arquivos do Vercel não segue: sem isso aqui,
      // o require falha silenciosamente, o DOMMatrix nunca é definido, e
      // quebra mais adiante com "DOMMatrix is not defined".
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-musl/**/*",
      "./node_modules/@napi-rs/canvas-linux-arm64-gnu/**/*",
      "./node_modules/@napi-rs/canvas-linux-arm64-musl/**/*",
    ],
  },
};

export default nextConfig;
