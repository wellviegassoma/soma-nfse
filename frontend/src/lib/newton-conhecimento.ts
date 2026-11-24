// Conhecimento do Newton (Lucro Presumido). Regras condensadas das skills
// irpj-csll e pis-cofins do Wellington + o que a prova de outubro/2026
// mostrou na carteira da SOMA. Mudou a regra ⇒ atualizar aqui.

export const CONHECIMENTO_PRESUMIDO = `REGRAS DO LUCRO PRESUMIDO (prestadores de serviço, maioria da saúde):
PIS/COFINS cumulativos: PIS 0,65% e COFINS 3% sobre a receita bruta do mês (notas emitidas, sem as canceladas). Sempre mensais. DARF 8109 (PIS) e 2172 (COFINS), vencimento dia 25 do mês seguinte.
IRPJ: 15% sobre a base presumida — 32% da receita de serviços em geral; 8% da receita de serviços hospitalares equiparados. Adicional de 10% sobre a base que passar de R$ 60.000 no trimestre (R$ 20.000/mês na apuração mensal). DARF 2089.
CSLL: 9% sobre a base presumida — 32% em geral; 12% nos serviços hospitalares equiparados. DARF 2372.
Apuração trimestral (fecha em março, junho, setembro e dezembro; paga até o último dia útil do mês seguinte, quota única ou 3 quotas). Empresa marcada "apuração mensal" recolhe todo mês.
Equiparação hospitalar (Lei 9.249/95, art. 15 §1º III "a"; IN RFB 1.700/2017 art. 33): só para sociedade empresária que cumpre as normas da Anvisa, e só sobre a receita dos serviços hospitalares, de auxílio diagnóstico e terapia, patologia clínica, imagenologia, anatomia patológica, citopatologia, medicina nuclear e análises clínicas. Consulta médica simples NÃO entra (STJ, REsp 1.116.399). É decidida NOTA A NOTA no sistema; empresa marcada sem nenhuma nota marcada no trimestre está errada (cálculo vai a 32%).
Retenções sofridas (a empresa é a prestadora): IRRF 1,5% (cód. 1708) abate o IRPJ do período; PIS/COFINS/CSLL retidos 4,65% (cód. 5952) abatem cada tributo na proporção 0,65/3/1. Retenção maior que o devido gera crédito (PER/DCOMP ou compensação) — decisão da equipe. ISS retido não mexe nos federais.
Declaração: os débitos entram no MIT (encerrar a apuração), que alimenta a DCTFWeb; transmitida a DCTFWeb, sai a guia (DARF único, que também traz as contribuições da folha do eSocial).
Anti-padrões: equiparação aplicada na receita toda; esquecer o adicional do IRPJ; esquecer as retenções; receita diferente da prefeitura sem explicação; filial fora da apuração (MIT e DCTFWeb são pela raiz do CNPJ — a filial soma na matriz); empresa com receita e sem DCTFWeb no mês.
O que a prova de outubro/2026 mostrou na carteira: a analista anterior declarava a equiparação "de cabeça" sem marcar notas; houve PIS/COFINS de setembro não declarados; e a retenção de PIS/COFINS/CSLL só existe na base a partir de setembro/2026.`;

export const MANUAL_NEWTON = `MANUAL DO SOMA GESTÃO PARA O LUCRO PRESUMIDO (telas, troque {id} pelo id da empresa):
- Empresa: /admin/empresas/{id}/dados-fiscais (regime, "apuração mensal do IRPJ/CSLL", "equiparação hospitalar", município, CMC), /admin/empresas/{id}/impostos (cálculo do mês, MIT e DCTFWeb de uma empresa), /admin/empresas/{id}/fechamento?competencia=AAAA-MM (lista das notas do mês, onde se marca a equiparação hospitalar nota a nota).
- Busca de notas: botão "Buscar todas" na tela do Newton (base nacional/ADN e prefeitura).
- Prefeitura de Petrópolis: botão "Conferir prefeitura" (compara o faturamento declarado no ISS com as notas).
- ISS: Central ISS Petrópolis /admin/fechamento/iss-petropolis e Central ISS Rio /admin/fechamento/iss-rio (o ISS do Presumido é guia municipal, fora do DARF).
- Retenções: Central da Reinf /admin/fechamento/reinf.
- MIT em lote: /admin/fechamento/mit (o Newton usa a mesma declaração).
- Critério da SOMA: transmitir só depois da aprovação de alguém da equipe; mensagens ao cliente só com clique.`;
