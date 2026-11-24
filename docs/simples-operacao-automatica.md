# Simples Nacional sem analista dedicado — diagnóstico e plano (24/11/2026)

Objetivo do Wellington: a carteira de ~90 empresas do Simples que hoje é de uma analista passa a
ser feita pelo SOMA Gestão + IA já na competência **nov/2026** (DAS vence em 20/12/2026), sem
"faz uma parte e não faz outra".

## 1. A rotina mensal de uma empresa do Simples (o que precisa ser feito)

| # | Etapa | O SOMA Gestão já faz? |
|---|---|---|
| 1 | Buscar as notas emitidas e recebidas do mês | **Sim** — Rotina de Fechamento etapa 1 (ADN/Emissor Nacional, procuração) |
| 2 | Conferir faturamento com a prefeitura (ISS) | **Parcial** — Petrópolis automático; Rio pela Central ISS Rio; Niterói, SP, Além Paraíba, Paraíba do Sul… **não** |
| 3 | Folha do mês / pró-labore (Fator R) | **Sim, se importada** — Fechamento › Folha (PDF do resumo) |
| 4 | Calcular o Simples (RBT12, anexo, Fator R, sublimite, retenções, ISS fixo) | **Sim** — Central do Simples |
| 5 | Conferência com regras (bloqueia/pede revisão) | **Sim** — 7 grupos de motivo (teto, sublimite, Fator R, RBT12 estimado, sem movimento, prefeitura, retenção zerando DAS) |
| 6 | **Decidir** os casos "Revisar" | **Não** — hoje é a analista |
| 7 | Transmitir o PGDAS-D | **Sim, em lote** — Integra Contador |
| 8 | Gerar e baixar o DAS | **Sim, em lote** |
| 9 | Entregar o DAS ao cliente | **Não automático** — feito à mão no eContador (a API do ePlugin não tem upload de documento documentado) |
| 10 | Confirmar pagamento | **Sim** — "DAS pago?" (PAGTOWEB, consulta cobrada) + Verificar pagamento nas Tarefas |
| 11 | Cobrar cliente que não pagou | **Não** |
| 12 | ISS de quem paga fora do DAS (ISS fixo/SUP, Rio/Petrópolis) | **Parcial** — Centrais ISS Rio/Petrópolis |
| 13 | Reinf/DCTFWeb (quando há retenção ou folha) | **Parcial** — Central Reinf; DCTFWeb do DP |
| 14 | Situação fiscal / pendências (SITFIS) | **Sim** — central + skill de pendências |
| 15 | Parcelamentos do Simples | **Sim** — Central de parcelamentos |
| 16 | Anuais: DEFIS (mar), DASN-SIMEI, opção/exclusão | **Não** (DEFIS só aparece na agenda/tarefa) |
| 17 | Controle de tudo isso por empresa | **Sim** — Tarefas (modelo "Apurar Simples" com 4 etapas e conclusão automática) |

## 2. Onde a IA entra (o que falta para "100%")

1. **Revisor de conferência (etapa 6).** Para cada empresa em "Revisar", um agente (Claude) lê os
   motivos e os dados (notas, RBT12, folha, mês anterior, histórico de aprovação) e decide:
   **aprovar** (com justificativa gravada) ou **escalar** para uma pessoa, com a pergunta exata.
   Regras duras (bloqueios) nunca são aprovadas pela IA.
2. **Orquestrador do mês.** Uma rotina que roda sozinha, em ordem: buscar notas → conferir
   prefeituras → calcular → conferência → revisor IA → transmitir PGDAS dos aprovados → gerar DAS →
   marcar tarefa → verificar pagamento perto do vencimento. Cada passo deixa rastro na tarefa.
3. **Entrega ao cliente.** Duas saídas possíveis: (a) robô no eContador (navegador) para subir o
   DAS; (b) e-mail ao cliente com o DAS (o SMTP já está pronto). Precisa da sua decisão.
4. **Cobrança de pagamento** perto do dia 20 para quem não pagou (e-mail/eContador).
5. **Municípios sem conferência automática** (Niterói, SP, Além Paraíba, Paraíba do Sul…): ou
   integramos, ou a IA confere só pelas notas do ADN e marca "conferência de prefeitura manual".

## 3. Riscos de ir 100% já em dezembro

- Casos que hoje dependem de julgamento (início de atividade, mudança de anexo, nota cancelada fora
  do ADN, receita de exportação, cliente que emite nota fora do Emissor Nacional) precisam de
  regra escrita antes — senão a IA escala tudo e não substitui ninguém.
- Transmitir PGDAS errado gera retificação; recomendação: em dezembro a IA faz tudo e **uma pessoa
  só aprova a lista final em lote** (5–10 min); a partir de janeiro, aprovação automática do que a
  IA classificou como seguro.
- Consultas Integra Contador são cobradas (PGDAS, DAS, pagamentos) — o orquestrador precisa evitar
  repetir consulta.

## 4. Respostas do Wellington (24/11) e desenho da "Serena"

Respostas: carteira de **90** empresas (de ~150 do Simples); só PGDAS/DAS (sem ISS fora do DAS);
várias cidades; muitas com folha, nenhuma com ICMS; erros: **anexo errado, Fator R errado, ISS
retido ignorado, faturamento errado**; ela não usa a Central do Simples; escalar para **Paulo ou
Douglas** (Fiscal); DAS **salvo para subir no eContador**; cobrança por **mensagem no grupo do
Digisac**; folha já importável (Fator R); muitos clientes emitem fora do sistema (portal/sistema
próprio).

Dado medido (set–out/2026): têm nota emitida na base nacional (ADN) 61 de 83 em Petrópolis, 38 de
49 no Rio e 23 de 32 nas outras cidades — o restante ou não faturou ou emitiu fora do ADN. Esse é o
ponto que mais gera "faturamento errado".

**Serena** = carteira de IA, não uma conta de login. Aba própria com as 90 empresas marcadas e, por
empresa, o pipeline do mês:

1. Notas buscadas (ADN) · 2. Faturamento conferido (Petrópolis/Rio automático; demais: alerta
   "sem nota no ADN" + pedido ao cliente) · 3. Folha importada (Fator R) · 4. Cálculo da Central
   (anexo, Fator R, ISS retido, RBT12 — as regras que hoje ela erra ficam no sistema) ·
   5. Conferência · 6. **Revisor IA** (aprova com justificativa ou escala para Paulo/Douglas com a
   pergunta) · 7. Aprovação final em lote (dezembro) · 8. PGDAS transmitido · 9. DAS salvo
   (ZIP para o eContador) · 10. Mensagem no grupo do Digisac · 11. Pagamento verificado / cobrança.

## 5. Ajuste do Wellington (24/11): Serena = todo o Simples de Petrópolis e do Rio

Carteira da Serena: **todas as empresas do Simples de Petrópolis (83) e do Rio (49) = 132**. Os
demais municípios voltam para a equipe. Motivo: nessas duas cidades o sistema já varre os portais
(Prefeitura de Petrópolis e Nota Carioca), então não precisa ir para fora nem perguntar ao cliente.

Pré-requisitos medidos em 24/11 (leitura do banco):
- Rio: a varredura da Nota Carioca usa o **certificado digital** da empresa — 36 de 49 têm
  certificado válido; **13 sem** (para essas, só a base nacional).
- Petrópolis: a conferência com a Prefeitura não exige certificado (CNPJ/login próprio); 72 de 83
  têm certificado válido.
- Fator R: 38 (Petrópolis) e 26 (Rio) sujeitas; com folha de set/out importada: 35 e 23 →
  **6 sem folha recente**.

## 6. Tela da Serena (referência enviada em 24/11) e plano de construção

Tela no formato "esteira" por empresa: **Notas → Faturamento (prefeitura) → Cálculo → Conferência
(IA) → PGDAS → DAS → Entrega → Pagamento**, cada etapa com círculo (feito / pendente / problema),
valor e data; à direita, o que a Serena fez ou precisa ("Serena: sem notas e faturamento zero —
conferido sem movimento"). No topo: Apuração (x/132 calculadas), Valores (faturamento e DAS),
Conclusão (DAS gerados, entregues, pagos), e filtros "Precisa de ação / Com a Serena / Concluídas".

Achado técnico (24/11): a conferência de faturamento com a prefeitura no Simples só existe para
**Petrópolis** (Central do Simples › "Conferir prefeitura"). A Central ISS Rio **exclui** o
Simples. Para o Rio falta um robô novo: listar as NFS-e emitidas no mês na Nota Carioca (com o
certificado) e comparar com as notas da base nacional.

Ordem de construção:
1. Aba Serena com a esteira (lendo o que já existe: notas, conferência Petrópolis, cálculo da
   Central, aprovação, PGDAS, DAS, pagamento) + carteira (Simples de Petrópolis e Rio, com exceções).
2. Revisor IA (Claude) para os "Revisar": aprova com justificativa ou cria tarefa para Paulo/Douglas.
3. Ações em lote na própria tela: conferir prefeitura, aprovar e transmitir, gerar DAS, baixar ZIP
   para o eContador, marcar entregue, mensagem Digisac (com clique), verificar pagamento.
4. Robô Nota Carioca para faturamento do Simples no Rio.
5. Rodar sozinha (cron) as etapas seguras: notas, conferência, cálculo, IA; transmissão só com
   aprovação em dezembro.

## 7. Conhecimento e autonomia da Serena (aprovado em 24/11)

- **Skill do Simples embarcada**: regras da skill `01-apuracao-simples-nacional` copiadas para
  `frontend/src/lib/serena-conhecimento.ts` (o sistema não lê arquivos do computador — se a skill
  mudar, atualizar lá).
- **Manual do SOMA Gestão** no mesmo arquivo: cada motivo da conferência → causa → tela onde corrigir.
- **Revisor com ferramentas de consulta** (`lib/serena-revisor.ts`): cadastro, notas do mês (com
  canceladas e ISS retido), folha de 13 meses, declarações anteriores, conferência da prefeitura.
  Devolve decisão, **diagnóstico** e **ações com link da tela**. Trava no código: risco ou mudança de
  anexo sempre escala.
- **Resolve sozinha o que é seguro**: antes de revisar, roda a conferência com a Prefeitura de
  Petrópolis de quem ainda não foi conferido. Não altera cadastro, não transmite, não manda mensagem.
