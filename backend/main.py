from fastapi import FastAPI

app = FastAPI(title="SOMA NFSe Engine")


@app.get("/health")
def health():
    return {"status": "ok"}


# Fase C: POST /notas/emitir, POST /notas/{id}/cancelar — usando nfse_engine.service.NFSeService
