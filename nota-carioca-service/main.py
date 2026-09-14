"""
nota-carioca-service — busca/emissão de guia de ISS no Nota Carioca
(notacarioca.rio.gov.br) via certificado A1, como serviço HTTP interno.

Serviço separado do nfse-engine (backend/) de propósito: é o único lugar
do projeto que precisa de um Chromium real (Playwright) — dependência de
build/runtime bem mais pesada que o resto do projeto, isolada aqui pra
não arriscar o nfse-engine (que já emite NFS-e em produção) numa falha de
build ou pico de memória do Chromium. Ver nota_carioca_client.py pro
porquê de precisar de um navegador de verdade em vez de requests puro.

Stateless: recebe o certificado em bytes a cada requisição, igual ao
nfse-engine — o frontend descriptografa o certificado guardado no
Supabase antes de chamar este serviço.
"""

from __future__ import annotations

import base64

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import Response

from auth import exigir_token_interno
from nota_carioca_client import ClienteNotaCarioca, ErroNotaCarioca
from schemas import GuiaIssNotaCariocaRequest

app = FastAPI(title="nota-carioca-service", docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    return {"status": "ok"}


def _resposta_guia_pdf(pdf_bytes: bytes, valores: dict) -> Response:
    """
    Repassa os valores extraídos da tela de confirmação como headers,
    mesmo padrão do backend/main.py pro ISS de Petrópolis — o frontend só
    relay-a esses headers, nunca reabre o PDF pra extrair nada (o PDF é
    imagem, ver docstring de nota_carioca_client.py).
    """
    headers = {"X-Regime": valores["regime"]}
    if valores["regime"] == "FIXO":
        headers["X-Quantidade-Profissionais"] = str(valores["quantidade_profissionais"])
    else:
        headers["X-Valor-Servicos"] = f"{valores['valor_servicos']:.2f}"
        headers["X-Base-Calculo"] = f"{valores['base_calculo']:.2f}"
    if valores.get("valor_iss") is not None:
        headers["X-Valor-Iss"] = f"{valores['valor_iss']:.2f}"
    if valores.get("valor_total") is not None:
        headers["X-Valor-Total"] = f"{valores['valor_total']:.2f}"
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@app.post("/guia-iss", dependencies=[Depends(exigir_token_interno)])
def buscar_guia_iss(req: GuiaIssNotaCariocaRequest):
    pfx_bytes = base64.b64decode(req.certificado.pfx_base64)
    try:
        with ClienteNotaCarioca(pfx_bytes, req.certificado.senha) as cliente:
            pdf_bytes, valores = cliente.buscar_guia_iss(req.competencia)
    except ErroNotaCarioca as e:
        raise HTTPException(status_code=422, detail=str(e))

    return _resposta_guia_pdf(pdf_bytes, valores)
