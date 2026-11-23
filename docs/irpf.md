# Módulo IRPF: concorrentes, reaproveitamento e proposta (23/11/2026)

Objetivo: controlar a temporada de IRPF da SOMA (sócios e clientes PF) dentro do SOMA Gestão, com
status por declaração, checklist de documentos, arquivos, resultado, comparação com o ano anterior
e acompanhamento depois da entrega. A declaração continua sendo feita no programa da Receita (PGD).

Status: **Fase 1 implementada (23/11/2026), migration `fase_ce_irpf` ainda não aplicada em produção.**

## Decisões do Wellington (23/11/2026)

- **Base própria de contribuintes**, sem vínculo com `companies`: muitos clientes de IRPF não são
  das empresas atendidas, e misturar as bases incha o cadastro.
- **Cadastro pela importação dos .DEC**: a pasta do programa do IRPF tem todas as declarações; o
  sistema lê cada .DEC/.REC, cria o contribuinte e guarda a declaração (inclusive anos anteriores).
  Testado em 390 arquivos locais (2022, 2024, 2026): todos lidos, saldo e bens batem com os totais.
- **Sem portal do cliente.** No lugar dele, um **relatório de aprovação** (resumo da declaração,
  comparativo com o ano anterior, rendimentos, deduções, bens, dívidas) para imprimir/salvar em PDF
  e mandar por e-mail/eContador antes da transmissão.
- Acesso: só equipe SOMA (`is_soma_staff`), como Tarefas — sem permissão nova no catálogo.

## Fase 1 entregue

- `/irpf` — declarações do exercício: contadores, filtro por situação/responsável, botão "Abrir
  exercício" (cria a declaração Não iniciada de cada contribuinte ativo com checklist sugerido do ano
  anterior).
- `/irpf/importar` — escolhe a pasta, prévia no navegador, envia ao Blob privado (pathname sem CPF)
  e grava; reimportar não duplica; a versão mais recente (retificadora/transmissão) vira o resumo.
- `/irpf/declaracoes/[id]` — resumo, comparativo, alerta de variação patrimonial, controle (situação,
  responsável, revisor, honorário), checklist, arquivos, histórico.
- `/irpf/declaracoes/[id]/relatorio` — relatório de aprovação do cliente.
- `/irpf/contribuintes` — cadastro e evolução ano a ano.
- Leitor: `frontend/src/lib/irpf/dec-parser.ts` (leiaute DIRPF da Receita).

## 1. Concorrentes (só material de marketing; nenhum dos dois foi testado por dentro)

| Produto | Página | Observação |
|---|---|---|
| Conferir Online | conferironline.com.br/#funcionalidades | página detalhada; 3.500 escritórios; foco em e-CAC + IA |
| Prosoft AnalIR Web | prosoft.com.br/analir-web (+ /analir, versão desktop) | página curta; foco em análise de caixa e patrimônio |

Legenda: ● descreve claramente · ○ cita de passagem · — não cita

| # | Funcionalidade | Conferir | AnalIR | SOMA hoje |
|---|---|---|---|---|
| **Entrada de dados** |||||
| 1 | Importar a declaração / recibo do PGD (.DEC/.REC) | — | ○ (dá a entender, por causa das análises de 5 anos) | — |
| 2 | Declaração pré-preenchida (em lote, via procuração) | ● | — | — |
| 3 | Buscador de informes de rendimentos de bancos | ● | — | — |
| 4 | Leitura de documentos por IA / OCR | ● (planos IA) | ● (OCR) | skills Carnê-Leão / livro-caixa (fora do sistema) |
| 5 | Formulário digital por link para o cliente preencher | — | ● | — |
| 6 | Receber documentos pelo WhatsApp | — | ● | — (decisão: não usar WhatsApp para isso) |
| 7 | Elaborar a declaração dentro da plataforma | ● (plano mais caro) | — | — (PGD) |
| **Cruzamentos e malha** |||||
| 8 | Cruzamento com DIRF / DMED / Receita Saúde | — | — | — |
| 9 | Análise de caixa (origens × aplicações) | ● | ● | — |
| 10 | Evolução patrimonial / histórico 5 anos | ● | ● | — |
| 11 | Detecção de risco de malha antes de transmitir | ● (IA) | ○ ("auditoria") | — |
| 12 | Simulação conjunta × separada | — | ● | — |
| **Pós-entrega (e-CAC)** |||||
| 13 | Robô de status da declaração (processada, malha, restituição) | ● | ● | — |
| 14 | Alertas de malha, DARF, lotes de restituição, CND | ● | ● (notificações e-CAC) | Caixa Postal / SITFIS só para PJ |
| 15 | Situação das procurações e-CAC | ● | — | ● (Integra Contador, PJ) |
| **Gestão da temporada** |||||
| 16 | Painel com status de todas as declarações | ● | ● | — |
| 17 | Checklist de documentos para o cliente, com recebimento em tempo real | ● | ○ (status do formulário) | — |
| 18 | Multiusuário | ● (ilimitado) | ● | ● |
| **Cliente e cobrança** |||||
| 19 | Orçamento, aprovação e cobrança de honorários (Asaas/Omie) | ● | ○ (recibo com Pix) | — |
| 20 | Mala direta e-mail/WhatsApp (prazos, restituição, malha) | ● | — | eContador / e-mail |
| 21 | Resumo da declaração ao cliente depois da entrega | ● | — | — |
| **Extras** |||||
| 22 | Integração Carnê-Leão Web | ● | — | skills (CSV de importação) |
| 23 | IRPFM / planejamento antecipado / holding / perfil de investidor | ● | — | — |

Preço de referência: Conferir R$ 99 a 599/mês; AnalIR R$ 79 a 399/mês (por faixa de declarações).

**O que os dois têm:** painel de status (16), análise de caixa e patrimônio (9, 10), monitoramento
do e-CAC depois da entrega (13, 14), coleta de documentos do cliente (5 ou 17).
**O que vale copiar primeiro:** 16, 17, 1 + 10 (comparativo com o ano anterior a partir do arquivo),
21 e, numa fase depois, 13/14.
**O que não vale copiar:** 7 (o PGD já faz), 3 e 2 em lote (exigem robô no e-CAC: ver seção 4),
WhatsApp (6), extras de consultoria (23).

## 2. O que o soma-nfse já tem e pode ser reaproveitado

| Peça | Onde | Uso no IRPF |
|---|---|---|
| Clientes PF (`companies.person_type = 'PF'`, `cpf`) | fase_q | 68 PFs ativas hoje (todas sem regime). Viram contribuintes IRPF com um clique. |
| Sócios (`socios`, `tipo_pessoa`, `documento`) | fase_o | Tabela existe mas está praticamente vazia (1 linha). Não dá para puxar os sócios das PJs dela. |
| Padrão de módulo (layout próprio + `requireXAccess`, `/x/empresas/[id]`) | Extratos, Financeiro, Legalização | Mesmo padrão: `/irpf` com layout próprio e permissão `irpf`. |
| Permissões por módulo | `lib/permissoes/catalogo.ts` | Novo módulo `irpf` (ver / editar / gerenciar). |
| Upload de arquivos (Vercel Blob) | comercial, extratos, legalização | Documentos do checklist, .DEC, .REC, recibo PDF. |
| Status por etapa + histórico | Legalização (fases), Tarefas (`tarefa_eventos`) | Mesmo modelo de evento para o histórico da declaração. |
| Módulo de Tarefas | fase_cc | Já existe o modelo "DIRPF" (desativado). Fase 2: a tarefa da DIRPF aponta para o painel do IRPF. |
| Agenda tributária RFB | fase_ca | Prazo de entrega e vencimento das quotas vêm dela. |
| Integra Contador | `integra-contador/` | Caixa Postal, SITFIS, PAGTOWEB, SICALC e PROCURACOES aceitam CPF (fase 3). |
| Portal do cliente (`/empresas/[id]`) | portal | Hoje é por empresa; PF cliente já tem acesso. Sócio de PJ não tem login próprio. |
| Skills Carnê-Leão / livro-caixa | fora do sistema | Fase 4: totais do ano entram como conferência do livro-caixa. |
| eContador (Alterdata) | processo | Canal de envio do resumo e da guia ao cliente. Não automatizar WhatsApp. |

## 3. Proposta de fases

### Fase 1 (MVP para a temporada 2027: entregar até fevereiro)

Só uso interno da equipe. Zero chamada ao Integra Contador.

1. **Contribuintes IRPF**: cadastro da pessoa (nome, CPF, e-mail, telefone), com vínculo opcional ao
   cliente PF (`companies`) e/ou às PJs das quais é sócio. Importação por planilha (lista de 2026) e
   botão "trazer clientes PF".
2. **Declaração por exercício**: uma linha por contribuinte × exercício (2027 = ano-calendário 2026).
   Status: Não iniciada → Aguardando documentos → Documentos recebidos → Em elaboração → Em revisão →
   Aguardando aprovação do cliente → Transmitida → (Processada / Em malha / Retificada / Cancelada).
   Responsável e revisor. Histórico de cada mudança.
3. **Checklist de documentos**: lista padrão do escritório (informes de rendimentos, saúde, educação,
   bens, dívidas, Carnê-Leão etc.) aplicada à declaração; cada item com status Pendente / Recebido /
   Não se aplica e anexos. Ao criar 2027, sugere os itens a partir do que a pessoa teve em 2026.
4. **Arquivos da declaração**: upload do .DEC e do .REC (ou PDF do recibo). Do arquivo o sistema lê
   o resumo: tipo (original/retificadora), modelo (completa/simplificada), rendimentos tributáveis,
   isentos, imposto devido, a pagar / a restituir, quotas, total de bens e dívidas, número do recibo.
5. **Comparativo com o ano anterior**: mesmo resumo lado a lado (2026 × 2027) com variação, e alerta
   quando a variação patrimonial for maior que os rendimentos líquidos (indicador simples de malha).
6. **Painel `/irpf`**: lista e quadro por status, filtros por responsável / status / a pagar ×
   restituir, contadores, dias até o prazo.
7. **Honorário**: valor e situação (a cobrar / cobrado / pago) por declaração, só controle.

### Fase 2: cliente

- Portal: o contribuinte vê o checklist e manda os documentos; aprova o resumo antes da transmissão.
- Textos prontos para e-mail / eContador (pedido de documentos, aprovação, resumo pós-entrega, DARF).
- Ligação com Tarefas: tarefa DIRPF do responsável mostra o andamento do IRPF.
- Kit pós-declaração em PDF (resumo + recibo + quotas).

### Fase 3: acompanhamento no e-CAC (Integra Contador, custa dinheiro)

Só depois da entrega, sob demanda ou em lote com limite de chamadas:
- **Caixa Postal (CPF)**: mensagens da Receita (intimações, avisos).
- **SITFIS (CPF)**: omissão de DIRPF, débitos de quota em aberto, pendências.
- **PAGTOWEB (CPF)**: confirmar pagamento das quotas (DARF 0211).
- **SICALC**: gerar quota em atraso atualizada.
- **PROCURACOES**: saber quem já tem procuração para a SOMA.

Custo: cada contribuinte × consulta = 1 chamada cobrada. Ex.: 150 declarações × (SITFIS + Caixa
Postal) 1 vez por mês de junho a dezembro ≈ 2.100 chamadas por ano. Proposta: botão por pessoa +
lote mensal com teto configurável, cache igual ao das PJs.

**Limite importante:** pelo que conheço do catálogo do Integra Contador não há serviço que devolva a
declaração entregue, a pré-preenchida, o extrato de processamento da DIRPF (malha) ou a restituição.
Isso só se vê no e-CAC com acesso gov.br / procuração, sem API. Vou confirmar no catálogo atual da
Serpro antes da fase 3; se não houver, a situação "Em malha / Processada" continua manual.

### Fase 4: análise

- Leitura de informes por IA (Claude) para conferir valores com o .DEC.
- Análise de caixa e evolução patrimonial de 5 anos.
- Integração dos totais do Carnê-Leão / livro-caixa (skills) e do Receita Saúde.

## 4. Tabelas da Fase 1 (migration `fase_ce_irpf`)

| Tabela | Campos principais |
|---|---|
| `irpf_contribuintes` | id, nome, cpf (único), email, telefone, company_id (cliente PF, opcional), observacoes, ativo |
| `irpf_contribuinte_empresas` | contribuinte_id, company_id (PJ da qual é sócio) |
| `irpf_declaracoes` | id, contribuinte_id, exercicio, status, responsavel_id, revisor_id, tipo (original/retificadora), modelo, resultado (pagar/restituir/zero), valor_resultado, quotas, numero_recibo, data_transmissao, honorario_valor, honorario_status, resumo (jsonb do .DEC), unique (contribuinte_id, exercicio, tipo, sequencia) |
| `irpf_checklist_modelo` | itens padrão do escritório (descricao, categoria, ordem, ativo) |
| `irpf_checklist_itens` | declaracao_id, descricao, categoria, status, observacao |
| `irpf_arquivos` | declaracao_id, checklist_item_id (opcional), tipo (DEC/REC/RECIBO_PDF/DOCUMENTO), blob_url, blob_pathname, nome_arquivo, uploaded_by |
| `irpf_eventos` | declaracao_id, tipo, de/para, autor, criado_em (histórico) |

RLS só para equipe com permissão `irpf`. CPF nunca aparece em log nem em URL.

## 5. Telas da Fase 1

- `/irpf`: painel do exercício (contadores por status, lista/quadro, filtros).
- `/irpf/contribuintes`: cadastro, importação por planilha, "trazer clientes PF".
- `/irpf/declaracoes/[id]`: cabeçalho (status, responsável, revisor, honorário), checklist,
  arquivos, resumo lido do .DEC, comparativo com o ano anterior, histórico.
- Configurações › IRPF: itens padrão do checklist.

## 6. O que fica de fora

- Elaborar ou transmitir a declaração (continua no PGD).
- Robô no e-CAC / gov.br (pré-preenchida em lote, informes de bancos, status da malha): sem API
  oficial; captcha e risco de bloqueio da conta.
- WhatsApp para pedir ou receber documentos.
- Cobrança integrada (Asaas/Omie), simulador de holding, perfil de investidor, IRPFM.

## 7. Perguntas para o Wellington

1. **Base:** quem são os contribuintes de 2027? Sócios das PJs + os 68 PFs + avulsos? Quantas
   declarações em 2026? Existe uma planilha da temporada passada para importar?
2. **Arquivos .DEC/.REC:** há uma pasta com os arquivos de 2026 para eu validar a leitura? (fica no
   disco, nada vai para o chat). Sem isso, o resumo da fase 1 é digitado à mão.
3. **Fluxo:** os status acima servem? Toda declaração passa por revisor? O cliente aprova antes de
   transmitir?
4. **Honorário:** IRPF é cobrado à parte (valor por declaração) ou está no contrato mensal? Basta
   controlar no IRPF ou deve ir para o financeiro da SOMA?
5. **Portal:** o cliente enviar documentos pelo SOMA Gestão já em 2027 (fase 2 antes de março) ou
   continua por e-mail/eContador?
6. **Integra Contador:** aceita o teto da fase 3 (ex.: até X chamadas por mês para CPF)?

## Ajustes de 23/11/2026 (noite)

- Quadro Kanban em `/irpf` com a etapa "Documentos recebidos" (migration `fase_cf_irpf_etapas`).
- Documentos do contribuinte por exercício na ficha (cria a declaração do ano quando preciso).
- Cadastro completo lido do registro 16 do .DEC (endereço, contatos, título, ocupação, cônjuge,
  conta de restituição, doença grave) — migration `fase_cg_irpf_cadastro`; atualiza com a
  declaração mais recente importada. Os 101 contribuintes já importados foram preenchidos.
- Exportar Excel: `/api/irpf/planilha/contribuintes` e `/api/irpf/planilha/declaracoes?ex=`.
  A de declarações traz o ID e a coluna "Honorário novo (preencher)" para reajuste em lote:
  o Wellington devolve a planilha e o honorário é atualizado pelo ID.
