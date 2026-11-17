# Central Reinf (Fechamento)

Pedido de 17/11/2026: toda nota **recebida** (a empresa é tomadora) com retenção gera obrigação na EFD-Reinf. A Central fica em `/admin/fechamento/reinf` e lista essas notas por empresa e competência. Para cada nota, mostra o registro da Reinf e a natureza do rendimento. Gera relatório em PDF (impressão) e Excel.

## Retenção → registro

| Retenção na nota | Registro |
|---|---|
| IRRF, PIS, COFINS, CSLL de prestador PJ | R-4020 (natureza do grupo 15) |
| IRRF de prestador pessoa física | R-4010 (natureza 10002) |
| INSS/CP retido (cessão de mão de obra, empreitada) | R-2010 |
| ISS retido | fora da Reinf (municipal) |

Os fechamentos do mês são o R-2099 e o R-4099. O prazo é o dia 15 do mês seguinte.

## Leitura do XML (`lib/reinf-core.ts`)

- **NT 007/2026 (desde 09/02/2026):** `vRetCSLL` é a **soma** de PIS + COFINS + CSLL retidos, e `tpRetPisCofins` (0–9) indica quais foram retidos. `vPis` e `vCofins` são o débito próprio do prestador, não retenção. Exceção: o código legado `1`, em que são os valores retidos.
- A Reinf exige os tributos separados. O sistema rateia pelas alíquotas 0,65 / 3 / 1.
- **Nota sem `tpRetPisCofins` com `vRetCSLL`:** a combinação é deduzida pela alíquota efetiva. Caso real: Diego Campos, out/26, R$ 279 = 4,65% → PIS 39 + COFINS 180 + CSLL 60.
- **`vTotalRet` (Ambiente Nacional):** às vezes soma `vPis`/`vCofins` mesmo quando não foram retidos, e às vezes inclui o ISS. Só gera alerta quando não bate com nenhuma dessas formas.
- **Facebook:** nota com `vPis`/`vCofins`, sem tipo e sem total retido, **não tem retenção**. O relatório do outro sistema contava essa nota.
- **Alerta para prestador do Simples** (`opSimpNac` 2 ou 3) com retenção federal: normalmente a retenção é dispensada.

## Ajustes da equipe

- **Situação por empresa/mês** (`reinf_fechamentos`): pendente, enviado ou dispensado.
- **Por nota** (`reinf_notas_ajustes`):
  - natureza, quando a sugerida pelo `cTribNac` não serve;
  - mês do pagamento, porque R-4010/R-4020 seguem o pagamento (sem ajuste, vale a competência da nota);
  - ignorar.

## Migration

`20261117170000_fase_bn_central_reinf.sql` cria:
- a coluna gerada `notas_distribuidas.tem_retencao`;
- as duas tabelas acima.

## Conferência com out/2026

- **34 notas em 24 empresas**: 26 no R-4020 (R$ 4.833,34) e 10 de ISS retido (R$ 66,14).
- O relatório do outro sistema mostrava 34 notas em 23 empresas. Ele contava a nota do Facebook, que não tem retenção, e não separava o PIS/COFINS/CSLL somado.

## Fase 2 (não feita)

Gerar e transmitir os eventos da Reinf direto pelo sistema.
