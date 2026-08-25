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
    "/*": ["./node_modules/pdf-parse/**/*.mjs", "./node_modules/pdfjs-dist/**/*.mjs"],
  },
};

export default nextConfig;
