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


@app.post("/guia-iss", dependencies=[Depends(exigir_token_interno)])
def buscar_guia_iss(req: GuiaIssNotaCariocaRequest):
    pfx_bytes = base64.b64decode(req.certificado.pfx_base64)
    try:
        with ClienteNotaCarioca(pfx_bytes, req.certificado.senha) as cliente:
            pdf_bytes = cliente.buscar_guia_iss(req.competencia)
    except ErroNotaCarioca as e:
        raise HTTPException(status_code=422, detail=str(e))

    return Response(content=pdf_bytes, media_type="application/pdf")
