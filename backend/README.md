# backend — NFSeEngine

API interna (FastAPI) que vai concentrar a lógica fiscal de emissão de NFS-e
(Fase C do roadmap — ver [`../docs/spec.md`](../docs/spec.md)). Hoje só tem o
scaffold: `nfse_engine/` com os módulos previstos (`builder`, `validator`,
`signer`, `client`, `parser`, `errors`) e a fachada `service.NFSeService`,
todos ainda `NotImplementedError`.

## Rodando localmente

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

## Por que ainda não tem lógica fiscal

Emitir NFS-e real exige montar XML conforme o schema DPS do Sefin Nacional,
assinar com XMLDSig/C14N e validar contra o Sefin — regras que só valem a
pena implementar quando há um certificado de teste e uma referência real para
comparar (nota aceita). Isso é trabalho da Fase C, depois que a Fase B
(cadastro fiscal, certificado, serviços, tomadores) estiver pronta no
frontend.
