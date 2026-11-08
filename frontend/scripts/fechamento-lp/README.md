# Fechamento do Lucro Presumido: planilha única

Este script gera e atualiza a planilha `Fechamento Lucro Presumido AAAA.xlsx`, com todas as empresas do Lucro Presumido. A planilha tem as abas Painel, Fechamento, Empresa (ficha anual), Contabilização, Empresas (parâmetros) e Tabelas.

## Todo mês

1. Busque todas as notas no sistema (Fechamento › Buscar todas agora).
2. Feche a planilha no Excel.
3. Dê dois cliques em `Documentos\ClaudeCode\fechamento-lp\Atualizar Fechamento LP.cmd`.
   O mesmo pode ser feito com `npm run fechamento:lp` na pasta `frontend`.

## O que vem do sistema

- **Receita:** notas emitidas e distribuídas do ano, separando a parte com equiparação hospitalar, que é marcada nota a nota.
- **Retenções nas notas:** IRRF, CSLL, PIS e COFINS (pelo `tpRetPisCofins` do XML) e ISS retido.
- **Cadastro da empresa:** tipo e alíquota do ISS, ISS fixo e apuração mensal ou trimestral do IRPJ/CSLL.

## O que é mantido ao atualizar

Tudo o que for digitado na planilha:

- vendas e outras receitas;
- receita lançada à mão;
- compensação e DARF pago por tributo;
- observação;
- parâmetros da aba Empresas (presunções, ISS, mensal ou trimestral).

Antes de atualizar, a versão anterior é copiada para `versoes-anteriores/`.

## Cálculo

Segue a planilha 122-LP e foi conferido com ela em 2026: o IRPJ e a CSLL devidos nos três primeiros trimestres batem centavo a centavo.

- **IRPJ e CSLL:**
  - A base soma serviços × 32%, hospitalar × 8% (CSLL: 12%), vendas × 8% (CSLL: 12%) e as outras receitas.
  - O IRPJ é 15%. Há adicional de 10% sobre a base acima de R$ 60 mil no trimestre, ou acima de R$ 20 mil no mês na apuração mensal.
  - A CSLL é 9%.
  - Na apuração trimestral, a guia sai no 3º mês do trimestre, já descontando as retenções do trimestre.
- **PIS e COFINS:** regime cumulativo, 0,65% e 3% sobre serviços mais vendas, menos o valor retido.
- **ISS:** (serviços − receita com ISS retido) × alíquota da empresa, ou o valor fixo mensal das sociedades uniprofissionais.
- **DARF mínimo:** valores abaixo de R$ 10 não geram guia e passam para o período seguinte.

O Excel instalado na máquina, acionado via PowerShell, recalcula a planilha e monta os gráficos.
