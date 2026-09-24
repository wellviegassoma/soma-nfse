# Importação do board Trello "Onboarding – Novos Clientes | SOMA"

Ferramenta usada uma vez pra trazer os ~50 prospects ativos do Trello pro
módulo Comercial do soma-nfse. Mantida aqui como referência — não é código
do produto, não roda em CI, não é chamada por nenhuma rota.

## Uso

```bash
# 1) Gerar uma API key + token em https://trello.com/app-key (escopo leitura basta)
export TRELLO_KEY=...
export TRELLO_TOKEN=...

# 2) Ler o board, gerar plano.json + relatorio.txt (não grava nada)
python preparar.py

# 3) Conferir relatorio.txt e uma amostra de prospects em plano.json contra
#    os cards reais do board antes de gravar

python gravar.py --dry      # mostra contagens, não grava nada
python gravar.py --commit   # grava de verdade
```

## O que a importação faz

- Lê as listas e os cards abertos (`filter=open`) do board, com checklists e
  anexos completos.
- Mapeia cada lista do Trello pra uma etapa de `comercial_etapas` via
  `ALIAS_ETAPA` em `preparar.py` — um card numa lista sem mapeamento vira
  "problema" e não é importado (nunca adivinha etapa).
- Copia os checklists do card pra `comercial_prospect_checklist` como
  snapshot — usa o estado real (marcado/desmarcado) de cada item do Trello,
  que pode divergir dos 72 itens do template seed (ver
  `20260925200000_fase_an_comercial_fundacao.sql`).
- Extrai o valor de "Honorários SOMA: R$ X" da descrição do card por regex
  (melhor esforço — se não achar, fica em branco pra preencher depois).
- Baixa cada anexo do Trello (exige `TRELLO_KEY`/`TRELLO_TOKEN` também em
  `gravar.py`) e reenvia pro Vercel Blob chamando
  `frontend/scripts/upload-blob-cli.mjs` (reaproveita o `put()` oficial do
  `@vercel/blob`, não reimplementa o contrato REST do Blob em Python).
- Cada prospect criado grava o id do card do Trello dentro de
  `comercial_prospect_atividade.metadata` (evento `SISTEMA`) — reexecutar
  `gravar.py --commit` não duplica, mesmo com o mesmo `plano.json`.

## ⚠️ Nunca versionar a saída

`plano.json`, `relatorio.txt` e `gravacao_log.txt` contêm nome e descrição
de prospects reais (potencialmente PII) — já estão no `.gitignore` do
projeto, mas confira antes de um `git add -A` apressado.

## Depois de gravar

Comparar 3–5 prospects importados contra o card original do Trello
(descrição, anexos abrem, checklist bate) antes de considerar a importação
concluída — ver seção "Verificação" do plano do módulo Comercial.
