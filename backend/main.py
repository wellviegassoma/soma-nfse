"""
nfse-engine — motor fiscal de NFS-e Nacional como serviço HTTP interno.

Stateless: não tem banco próprio, recebe tudo (dados do prestador, do
tomador, do serviço e o certificado em bytes) a cada requisição, vindo do
frontend (soma-nfse/frontend, que descriptografa o certificado guardado
no Supabase antes de chamar este serviço). Só o frontend fala com este
serviço — sem domínio público, e toda rota exige o header
X-Internal-Token (ver auth.py).

A lógica fiscal (dps_builder, xml_signer, sefin_nacional_client,
certificado, validadores) foi portada quase sem alteração do nfse-engine
original (mesmo código já validado contra notas reais aceitas) — ver
docs/spec.md na raiz do monorepo para o histórico dessa decisão.

Rotas ainda não portadas (dependem de módulos que ficam pra Fase D —
histórico/PDF/logs): /notas/buscar, /notas/danfse, /relatorios/faturamento,
/municipios, /cep, /cnpj, /codigos-tributacao-nacional, /codigos-nbs.
"""

from __future__ import annotations

import base64

from dotenv import load_dotenv

load_dotenv()  # só facilita rodar localmente com backend/.env — em produção
# (Railway) as variáveis já vêm injetadas no processo, load_dotenv() não faz nada.

from fastapi import Depends, FastAPI, HTTPException

import emissor
from auth import exigir_token_interno
from certificado import carregar_certificado_pfx, limpar_certificado_temporario
from certificado_temp import certificado_temporario
from schemas import EmitirNotaRequest, EmitirNotaResponse, ParametrosServicoRequest
from sefin_nacional_client import ClienteSefinNacional, ErroSefinNacional

app = FastAPI(title="nfse-engine", docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/notas/emitir", response_model=EmitirNotaResponse, dependencies=[Depends(exigir_token_interno)])
def emitir_nota(req: EmitirNotaRequest):
    pfx_bytes = base64.b64decode(req.certificado.pfx_base64)
    prestador = emissor.DadosPrestadorEmissao(
        codigo_municipio_ibge=req.prestador.codigo_municipio_ibge,
        cnpj=req.prestador.cnpj,
        ambiente=req.prestador.ambiente,
        inscricao_municipal=req.prestador.inscricao_municipal,
        telefone_emissor=req.prestador.telefone_emissor,
        email_emissor=req.prestador.email_emissor,
        opcao_simples_nacional=req.prestador.opcao_simples_nacional,
        regime_apuracao_simples=req.prestador.regime_apuracao_simples,
        regime_especial_tributacao=req.prestador.regime_especial_tributacao,
        serie_dps=req.prestador.serie_dps,
    )
    try:
        with certificado_temporario(pfx_bytes) as caminho_pfx:
            resultado = emissor.emitir_nota(
                prestador=prestador,
                caminho_pfx_local=caminho_pfx,
                senha_certificado=req.certificado.senha,
                tomador_documento=req.tomador_documento,
                tomador_nome=req.tomador_nome,
                codigo_tributacao_nacional=req.codigo_tributacao_nacional,
                descricao_servico=req.descricao_servico,
                valor_servico=req.valor_servico,
                numero_dps=req.numero_dps,
                data_competencia=req.data_competencia,
                codigo_tributacao_municipal=req.codigo_tributacao_municipal,
                tomador_email=req.tomador_email,
                tomador_cep=req.tomador_cep,
                tomador_logradouro=req.tomador_logradouro,
                tomador_numero=req.tomador_numero,
                tomador_complemento=req.tomador_complemento,
                tomador_bairro=req.tomador_bairro,
                tomador_codigo_municipio=req.tomador_codigo_municipio,
                codigo_nbs=req.codigo_nbs,
                tipo_retencao_issqn=req.tipo_retencao_issqn,
                aliquota_issqn_informada=req.aliquota_issqn_informada,
                cst_pis_cofins=req.cst_pis_cofins,
                valor_bc_pis_cofins=req.valor_bc_pis_cofins,
                aliquota_pis=req.aliquota_pis,
                aliquota_cofins=req.aliquota_cofins,
                valor_pis_proprio=req.valor_pis_proprio,
                valor_cofins_proprio=req.valor_cofins_proprio,
                tipo_retencao_pis_cofins=req.tipo_retencao_pis_cofins,
                percentual_total_tributos_federal=req.percentual_total_tributos_federal,
                percentual_total_tributos_estadual=req.percentual_total_tributos_estadual,
                percentual_total_tributos_municipal=req.percentual_total_tributos_municipal,
                percentual_total_tributos_simples=req.percentual_total_tributos_simples,
                valor_retido_inss=req.valor_retido_inss,
                valor_retido_irrf=req.valor_retido_irrf,
                valor_retido_contribuicoes_sociais=req.valor_retido_contribuicoes_sociais,
            )
    except emissor.ErroEmissao as e:
        raise HTTPException(status_code=422, detail=str(e))

    return EmitirNotaResponse(
        sucesso=resultado.sucesso,
        numero_dps=resultado.numero_dps,
        id_dps=resultado.id_dps,
        xml_dps_assinado=resultado.xml_dps_assinado,
        chave_acesso=resultado.chave_acesso,
        xml_nfse=resultado.xml_nfse,
        erros=resultado.erros,
    )


@app.post("/parametros-municipio", dependencies=[Depends(exigir_token_interno)])
def consultar_parametros_servico(req: ParametrosServicoRequest):
    pfx_bytes = base64.b64decode(req.certificado.pfx_base64)
    try:
        with certificado_temporario(pfx_bytes) as caminho_pfx:
            cert_path, key_path = carregar_certificado_pfx(caminho_pfx, req.certificado.senha)
            try:
                with ClienteSefinNacional(cert_path, key_path, ambiente=req.ambiente) as sefin:
                    return sefin.consultar_parametros_servico(req.codigo_municipio, req.codigo_servico)
            finally:
                limpar_certificado_temporario(cert_path, key_path)
    except ErroSefinNacional as e:
        raise HTTPException(status_code=422, detail=str(e))
