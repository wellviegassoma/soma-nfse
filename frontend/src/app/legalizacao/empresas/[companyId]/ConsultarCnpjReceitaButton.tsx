"use client";

import { useState } from "react";

// A Receita Federal exige resolver um captcha a cada consulta — não dá (e
// não deve) pra automatizar isso por trás dos panos. Esse botão só poupa o
// trabalho de digitar: copia o CNPJ e já abre a página oficial numa aba
// nova, pra colar, resolver o captcha e baixar o comprovante de verdade.
const RFB_CONSULTA_URL = "https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp";

export function ConsultarCnpjReceitaButton({ cnpj }: { cnpj: string | null }) {
  const [copiado, setCopiado] = useState(false);

  if (!cnpj) return null;

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(cnpj!);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de clipboard — segue e abre a página de qualquer jeito.
    }
    window.open(RFB_CONSULTA_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <button type="button" onClick={handleClick} className="text-xs text-brand underline">
      {copiado ? "CNPJ copiado — cole na Receita" : "Consultar CNPJ na Receita ↗"}
    </button>
  );
}
