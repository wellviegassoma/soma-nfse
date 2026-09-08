# Importação de "Contas Recebidas" / "Contas Pagas" do Nibo (planilha)

Ferramenta usada uma vez pra trazer o histórico real da SOMA (~7.100
agendamentos, 2023–2026, 100% já liquidados) das exportações em Excel do Nibo
para o módulo Financeiro. Mantida aqui como referência — não é código do
produto, não roda em CI, não é chamada por nenhuma rota.

Diferença em relação à migração via API (`lib/nibo/importar.ts`, fase F6):
aquela traz só agendamentos em aberto e não traz histórico de pagamento (sem
saber a conta bancária de cada baixa, o saldo sairia errado). Esta planilha
tem a coluna "Banco", então dá pra reconstruir a baixa de verdade — cada linha
já sai com o lançamento na conta certa, na data real de pagamento.

## Uso

```bash
python preparar.py          # só lê a planilha e o banco, gera plano.json
python gravar.py --dry      # monta tudo, mostra contagens, não grava nada
python gravar.py --commit   # grava de verdade, em lotes, idempotente
```

`preparar.py` tem os caminhos dos arquivos `.xlsx` e o `COMPANY_ID` fixos no
topo — ajustar ali pra reusar em outra empresa/arquivo.

## ⚠️ Nunca versionar a saída

`plano.json` e `relatorio.txt` (gerados por `preparar.py`) contêm **nome e
CPF/CNPJ de centenas de clientes e fornecedores reais** — já estão no
`.gitignore` do projeto, mas confira antes de um `git add -A` apressado.

## O que a importação faz

- Agrupa linhas com o mesmo `Id` (o Nibo divide uma transação em várias linhas
  quando há rateio de categoria) num agendamento só, com N linhas de rateio.
- Casa banco/categoria/contato existentes por nome normalizado (sem acento,
  minúsculo); cria o que não existir. Categoria que colide com uma de sistema
  (juros, multas, descontos) aponta pro nome de sistema em vez de duplicar.
- Categoria usada nos dois sentidos na planilha (ex.: "Clinica Medica" em
  recebidas e pagas) fica com a natureza do lado de maior valor movimentado —
  é só metadado, o Painel calcula o sinal pelo tipo do agendamento, não pela
  natureza da categoria.
- Cada agendamento carrega `nibo_id = "planilha:<TIPO>:<REC|PAG>:<Id>"`, único
  por empresa — reexecutar não duplica.

## Achado que valeu registrar

Depois de gravar, o saldo consolidado da tela apareceu **R$ 646.949,23** em
vez do **-R$ 2.273,77** esperado. Não era erro da importação: era o
PostgREST cortando a leitura de `fin_lancamentos` em 1000 linhas por padrão,
sem avisar — bug real no código do módulo Financeiro (várias páginas liam
essas tabelas sem paginar), só visível agora que uma empresa passou de 1000
lançamentos de verdade. Corrigido em `lib/supabase-paginacao.ts`; ver README
principal do projeto, seção da correção.
