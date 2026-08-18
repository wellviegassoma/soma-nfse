# backend — nfse-engine

API interna (FastAPI) com a lógica fiscal de emissão de NFS-e Nacional.
**Portada quase sem alteração** do `nfse-engine` legado (repo irmão, no
mesmo diretório pai) — mesmo código já validado contra notas reais
aceitas pelo Sefin Nacional. Ver `docs/spec.md` na raiz do monorepo para
o histórico dessa decisão (por que portar em vez de reescrever).

**Não é um serviço público.** Sem domínio exposto — só alcançável pela
rede privada do Railway a partir do frontend, e mesmo assim exige o
header `X-Internal-Token` em toda requisição (ver `auth.py`). Stateless:
não tem banco de dados próprio, recebe tudo (dados do prestador, do
tomador, do serviço, e o certificado digital em bytes) a cada chamada —
o frontend descriptografa o certificado guardado no Supabase e manda os
bytes aqui, ele nunca é gravado em disco além de um arquivo temporário
de curtíssima duração (sempre apagado, mesmo em erro — ver
`certificado_temp.py`).

## Módulos portados sem alteração de lógica

`dps_builder.py`, `xml_signer.py`, `sefin_nacional_client.py`,
`validadores.py`, `certificado_temp.py`, `auth.py`, `schemas.py` —
cópia byte a byte do original. `emissor.py` e `certificado.py` têm 1
ajuste de import cada (adaptação à estrutura de arquivos daqui, sem
mudar lógica).

## Ainda não portado (fica pra Fase D — histórico/PDF/logs)

Busca de notas por NSU, geração de DANFSe/relatório em PDF, e os lookups
auxiliares (`municipios_ibge.py`, `codigos_atividade.py`) — todos vivem
no `nfse-engine` legado e podem ser portados do mesmo jeito quando
chegar a vez.

**Não há endpoint de cancelamento.** O legado também não tinha essa
lógica implementada e validada contra o Sefin Nacional — mesmo princípio
de não inventar regra fiscal nova sem validação real.

## Endpoints

Todos exigem o header `X-Internal-Token: <NFSE_ENGINE_INTERNAL_TOKEN>`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/notas/emitir` | Monta, assina e envia uma DPS ao Sefin Nacional |
| POST | `/parametros-municipio` | Consulta alíquotas/regras do município (Sefin Nacional) |

## Rodando localmente

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
set NFSE_ENGINE_INTERNAL_TOKEN=um-valor-qualquer-para-teste
uvicorn main:app --reload
```

## Validação

`xml_signer.py`/`dps_builder.py` são cópia exata do original (confirmado
com `diff` no momento da migração) — o risco real de portar não é a
lógica ter mudado, é o ambiente novo (Python/lxml/cryptography em
versões diferentes) se comportar diferente. Antes de emitir a primeira
nota real, valide em `ambiente=producao_restrita` com um certificado
real de teste, seguindo o mesmo processo já usado no legado (comparar
contra uma nota real aceita).
