"use client";

// Abre (e baixa) um PDF vindo em base64 da Serpro — usado por qualquer
// tela de guia/declaração/recibo do Integra Contador (PGDAS-D, MIT, ...).
export function abrirPdfBase64(base64: string, nomeArquivo: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
