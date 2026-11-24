// Conhecimento da Serena (instruções da IA). Duas partes:
// 1) SIMPLES: adaptado da skill do Wellington "01-apuracao-simples-nacional"
//    (C:\Users\User\.claude\agents\01-apuracao-simples-nacional.md, 24/11/2026).
//    O sistema publicado não lê arquivos do computador — se a skill mudar,
//    copie a parte de regras para cá.
// 2) MANUAL: onde cada coisa fica no SOMA Gestão e como se resolve.

export const CONHECIMENTO_SIMPLES = `
## Regras do Simples Nacional (LC 123/2006, LC 155/2016, Resolução CGSN 140/2018)

Tabelas (vigência 2024-2026):
ANEXO III — Serviços (Fator R ≥ 28%): faixa 1 até 180.000 6,00% PD 0 | 2 até 360.000 11,20% PD 9.360 | 3 até 720.000 13,50% PD 17.640 | 4 até 1.800.000 16,00% PD 35.640 | 5 até 3.600.000 21,00% PD 125.640 | 6 até 4.800.000 33,00% PD 648.000
ANEXO V — Serviços (Fator R < 28%): 1 até 180.000 15,50% PD 0 | 2 até 360.000 18,00% PD 4.500 | 3 até 720.000 19,50% PD 9.900 | 4 até 1.800.000 20,50% PD 17.100 | 5 até 3.600.000 23,00% PD 62.100 | 6 até 4.800.000 30,50% PD 540.000
ANEXO IV — Construção, vigilância, limpeza (CPP por fora): 1 4,50% | 2 9,00% PD 8.100 | 3 10,20% PD 12.420 | 4 14,00% PD 39.780 | 5 22,00% PD 183.780 | 6 33,00% PD 828.000
Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) / RBT12. Nunca aplicar a nominal direto.
Limites: federal R$ 4.800.000/ano; sublimite ISS/ICMS R$ 3.600.000. DAS vence dia 20 do mês seguinte (agenda pode ajustar).

Fator R (medicina, odontologia, fisioterapia, fonoaudiologia, psicologia, engenharia, arquitetura, consultoria, TI, advocacia, contabilidade, marketing, perícia, despachante):
Fator R = folha 12 meses (salários + PRÓ-LABORE + 13º + INSS patronal/FGTS conforme a regra) / RBT12. ≥ 28% → Anexo III; < 28% → Anexo V.
Empresa com menos de 12 meses (CGSN 140 art. 22/26): proporcionalizar receita e folha — não comparar meses parciais.
Troca de anexo vale por competência, não retroage.

ISS retido pelo tomador: não mexe na base de cálculo; o ISS retido é informado no campo próprio do PGDAS-D e abatido. Esquecer o ISS retido gera DAS maior que o devido.
Exportação de serviço: alíquota efetiva sem ISS/PIS/COFINS. Sublimite estourado: ISS por fora, PGDAS-D com indicação.

Anti-padrões: RBT12 = 12 meses ANTERIORES ao período (não inclui o mês, não é acumulado do ano); não esquecer pró-labore no Fator R; não esquecer Fator R em serviço intelectual; não somar nota cancelada; não aceitar diferença com a prefeitura sem explicar.
Casos de borda: RBT12 acima de R$ 4,5 mi (alertar risco de estouro); troca de anexo entre meses (confirmar folha); atraso na transmissão gera multa (mín. R$ 50 ou 0,33%/dia até 20%).
`;

export const MANUAL_SOMA = `
## Manual do SOMA Gestão (onde está cada coisa e como se resolve)

Telas:
- Central do Simples: /admin/fechamento/simples?competencia=AAAA-MM — cálculo, conferência, aprovação, transmissão, DAS.
- Empresa: /admin/empresas/{companyId}/dados-fiscais (regime, "sujeita ao Fator R", data de abertura, município, CMC, grupo do WhatsApp), /certificado, /rbt12 (receita manual de meses sem nota no sistema, ex.: empresa vinda de outro escritório), /fator-r (folha por mês), /fechamento, /impostos.
- Folha em lote: /admin/fechamento/folha (PDF do Resumo Geral do sistema de folha de todas as empresas) — alimenta o Fator R.
- Notas: a Rotina de Fechamento (Automação › Etapa 1, ou "Buscar notas" na Serena) baixa as notas emitidas/recebidas da base nacional (ADN) pela procuração.
- Conferência com a Prefeitura de Petrópolis: botão "Conferir prefeitura" (consulta o faturamento declarado na prefeitura). Rio: ainda sem conferência automática no Simples (só base nacional).

Motivos da conferência e o que fazer:
- SEM_RECEITA: confirmar com o histórico; se a empresa costuma faturar, pode haver nota fora da base nacional → buscar notas de novo / conferir prefeitura.
- VARIACAO_ALTA / VARIACAO_BAIXA: explicar pelo histórico e pelas notas do mês (nota grande pontual, mês sem atendimento).
- PREFEITURA_NAO_CONFERIDA: rodar "Conferir prefeitura" (Petrópolis).
- PREFEITURA_DIVERGENTE: comparar notas do mês (canceladas, competência retroativa, nota emitida fora do Emissor Nacional) — corrigir a fonte, não o valor.
- PREFEITURA_SEM_ACESSO: falta login/CMC da prefeitura no cadastro (Dados fiscais).
- FOLHA_AUSENTE / FOLHA_INCOMPLETA: importar a folha do mês em Fechamento › Folha (ou lançar em Empresa › Fator R).
- FATOR_R_BORDA: Fator R perto de 28% — conferir folha e pró-labore dos 12 meses antes de transmitir.
- ANEXO_V: Fator R abaixo de 28% — confirmar se a empresa é mesmo do Fator R e se a folha está completa.
- RBT12 estimado: faltam meses de receita no sistema — lançar receita manual em Empresa › RBT12 (ou é empresa nova: proporcionalização correta).
- RETENCAO_ZEROU_DAS: conferir as notas com retenção (ISS retido/IR/CSRF) — pode haver retenção lançada errada.
- SUBLIMITE / SUBLIMITE_PERTO / TETO_SIMPLES: avisar o sócio; análise de regime.
- Certificado vencido ou ausente (Rio): Empresa › Certificado — sem ele não há conferência na Nota Carioca nem busca própria.
- Sem grupo do WhatsApp: Dados fiscais › grupo do Digisac — sem ele a Serena não manda mensagem.

O que a Serena pode e não pode fazer:
- Pode: consultar dados, recomendar aprovar, apontar a causa e a correção com o link da tela.
- Não pode: alterar cadastro, transmitir PGDAS, enviar mensagem a cliente — isso é sempre de uma pessoa.
`;
