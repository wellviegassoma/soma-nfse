# Módulo de Tarefas — mapeamento e proposta (23/11/2026)

Objetivo: tudo que a equipe da SOMA precisa fazer na rotina do mês, por empresa, com prazo,
responsável e status — dentro do SOMA Gestão.

## 1. Fontes lidas

| Produto | Página | Observação |
|---|---|---|
| Confi — Gestão de Tarefas | confi.net.br/gestao-de-tarefas | página curta, pouco detalhe |
| Omie G-Click | omie.com.br/gclick | a mais detalhada em automação |
| Nibo Obrigações Plus | nibo.com.br/contador (+ /funcionalidades/obrigacoes, /atendimento-whatsapp) | foco em envio ao cliente e robôs |
| Acessórias | acessorias.com/site (+ gestão de processos, automação de entregas) | foco em processos e protocolo |
| Alterdata eTarefas | alterdata.com.br/contabil/etarefas | integrado ao eContador (que a SOMA já usa) |

Só marketing público — nenhum sistema foi testado por dentro.

## 2. Mapa de funcionalidades

Legenda: ● descreve claramente · ○ cita de passagem · — não cita

| # | Funcionalidade | Confi | G-Click | Nibo | Acessórias | eTarefas |
|---|---|---|---|---|---|---|
| **Geração das tarefas** |||||||
| 1 | Tarefas recorrentes geradas sozinhas a cada mês | ● (400+ prontas) | ● | ● | ○ | ● |
| 2 | Vínculo automático pelo cadastro da empresa (regime, atividade) | ● | — | — | — | ● (identifica regime ao cadastrar) |
| 3 | Biblioteca de modelos prontos | ● | — | ● | — | — |
| 4 | Atribuir obrigações a várias empresas de uma vez | — | — | — | — | ● |
| **Organização do trabalho** |||||||
| 5 | Departamentos / carteira de clientes por usuário | ● | ● (filtro) | ● | — | ● |
| 6 | Distribuição automática para o responsável | ● | ● | — | — | — |
| 7 | Tarefa em fases/etapas, cada uma com responsável | — | ● | — | ● (processos) | ● |
| 8 | Fluxo em cascata (concluiu etapa → próxima vai ao próximo setor) | — | ● | ○ | — | — |
| 9 | Gatilhos (concluir gera outra tarefa / dispara ação) | — | ● | ○ | — | ● |
| 10 | Quadro Kanban | — | ● | — | — | — |
| 11 | Processos não recorrentes (abertura, alteração, baixa) | — | ● | ● | ● | — |
| 12 | Checklist dentro da tarefa | — | — | — | — | — |
| **Prazos e riscos** |||||||
| 13 | Controle de prazos legais das obrigações | ● | ● | ● | ● | ● |
| 14 | Status A fazer / Em atraso / **Risco de multa** / Concluída | — | — | ○ | — | ● |
| 15 | Alertas de prazo e de multa | — | — | — | ● | ● |
| **Cliente** |||||||
| 16 | Envio de guias/documentos ao cliente ao concluir | ● (WhatsApp/e-mail) | — | ● | ● | ● (eContador) |
| 17 | Protocolo de entrega com prova de recebimento/leitura | — | — | ● | ● | — |
| 18 | Solicitação de documentos ao cliente com cobrança automática | — | ● (link por e-mail) | ● | — | ● |
| 19 | **Concluir a tarefa sozinho quando o cliente envia o documento** | — | — | — | — | ● |
| 20 | Lembrete de prazo ao cliente (e-mail/app) | — | — | — | — | ● |
| 21 | Portal/app do cliente com a marca do escritório | ● | ● | ● | ● | (eContador) |
| 22 | Avaliação do atendimento / CSAT | — | — | ● | ● | — |
| **Documentos** |||||||
| 23 | Leitura automática de guias (pasta monitorada / robô) anexa na tarefa certa | — | ● | ● | — | ○ (UpDocs) |
| 24 | Classificação de documentos com IA | ● | — | ● | — | — |
| **Gestão** |||||||
| 25 | Dashboard de produtividade por usuário/departamento/cliente | ● | ● | ● | ● | ● |
| 26 | Integração e-CAC (pendências, parcelamentos) | ● (pago à parte) | — | ● | — | (eRadar) |
| 27 | Integração com sistema contábil (Domínio etc.) | ● | ● | — | ● | (nativo) |
| 28 | Fluxo especial de IRPF (temporada) | — | ● | — | — | — |

**O que todos têm (o "mínimo do mercado"):** 1, 5, 13, 16, 21, 25.
**Diferenciais que valem copiar:** 2 (vínculo pelo cadastro), 8 (cascata), 14 (risco de multa),
19 (conclusão automática), 23 (leitura de guias).

## 3. O que o SOMA Gestão já tem e que o módulo deve reaproveitar

- **Cadastro de empresas** com regime, Fator R, apuração IRPJ/CSLL, ISS, folha → base para o item 2
  (gerar as tarefas certas para cada empresa sem configurar uma a uma).
- **Agenda Tributária + Metas SOMA** (feito em 22/11) → prazo legal e prazo interno de cada tarefa
  federal já existem; ISS municipal, FGTS, eSocial etc. precisam de regra própria.
- **Centrais de fechamento** (Simples, MIT, Reinf, ISS Rio, ISS Petrópolis, folha, FGTS,
  parcelamentos, situação fiscal) e **Rotina de Fechamento** → podem **concluir tarefas sozinhas**
  (ex.: DAS aprovado na Central do Simples ⇒ tarefa "Apurar Simples" concluída). Nenhum dos
  concorrentes tem isso porque não fazem a apuração — é o maior diferencial possível aqui.
- **Atendimento** (`atendimento_departamentos`, `atendimento_usuario_departamentos`) → departamentos
  e quem pertence a cada um já existem.
- **Legalização** (processos com fases, atividade, anexos) → mesmo padrão serve para tarefas em etapas.
- **eContador (Alterdata)** é o canal de entrega ao cliente (não WhatsApp). O repositório
  `alterdata-api` já conversa com o ePlugin do eContador.

## 4. Proposta de fases

### Fase 1 — Núcleo (MVP)
- **Modelos de tarefa** (Configurações): nome, departamento, periodicidade (mensal, trimestral,
  anual, eventual), regra de prazo (obrigação da agenda RFB → usa prazo legal + meta SOMA; ou dia
  fixo do mês; ou "N dias úteis antes do prazo"), e **a quem se aplica** (regime, tem folha, Fator R,
  ISS fixo/variável, PF/PJ, município).
- **Responsável por empresa e departamento** (carteira): cada empresa tem um responsável fiscal,
  um de DP, um contábil…
- **Geração automática** todo dia 1 (rotina diária, idempotente): uma tarefa por empresa ×
  modelo × competência.
- **Telas:** "Minhas tarefas" (do usuário logado, por prazo) e painel geral com filtros
  (departamento, responsável, empresa, status, competência).
- **Status:** A fazer · Em andamento · Concluída · Não se aplica · **Atrasada** (passou da meta) ·
  **Risco de multa** (passou do prazo legal). Concluir com comentário e anexo.
- **Calendário da Visão geral** passa a mostrar as tarefas pendentes do dia.

### Fase 2 — Fluxo e automação
- Etapas dentro da tarefa (cada uma com responsável) e **fluxo em cascata**.
- **Checklist** por modelo.
- **Conclusão automática** pelas centrais do sistema (Simples, Reinf, ISS, MIT, folha…).
- Gatilhos: concluir uma tarefa cria outra.
- Quadro Kanban.

### Fase 3 — Cliente e gestão
- Entrega ao cliente pelo **eContador**, com registro de envio na tarefa.
- Solicitação de documentos ao cliente com cobrança automática e conclusão ao receber.
- Alertas internos (prazo e risco de multa) e dashboard de produtividade.

### Fase 4 — Documentos inteligentes
- Leitura automática de guias (pasta/PDF) anexando na tarefa certa.
- Fluxo especial do IRPF.

## 5. Decisões em aberto

1. **Construir ou usar o eTarefas?** A Alterdata diz que ele é gratuito para quem tem
   **eContador Master** — e o `alterdata-api` indica que a SOMA tem o Master (o ePlugin exige).
   Vale testar antes, ou decidir construir pelo diferencial de conclusão automática.
2. **Lista de modelos inicial:** quais tarefas a equipe faz hoje por mês, por departamento
   (Fiscal, DP, Contábil, Societário, Financeiro)?
3. **Carteira:** cada empresa tem um responsável fixo por departamento?
4. **Prazos fora da agenda RFB** (ISS de cada município, FGTS, eSocial, Reinf, DCTFWeb já está):
   dia fixo cadastrado no modelo é suficiente?
5. **Quem vê o quê:** todos veem tudo, ou cada um só a sua carteira/departamento?

## 6. Fase 1 — desenho detalhado (decisão 23/11: construir no SOMA Gestão)

### 6.1 Tabelas novas
- `tarefa_modelos` — o "o quê": nome, departamento (`atendimento_departamentos`), periodicidade
  (MENSAL · TRIMESTRAL · ANUAL · EVENTUAL), mês de referência (para anual/trimestral),
  **regra de prazo** (`AGENDA` = chave da obrigação na agenda RFB → prazo legal + meta SOMA ·
  `DIA_FIXO` = dia N do mês seguinte à competência, fim de semana antecipa · `DIAS_UTEIS_ANTES`
  = N dias úteis antes do prazo legal), **filtro de aplicação** (regimes, PF/PJ, município, tem
  folha, Fator R), ativo.
- `tarefa_responsaveis` — carteira: empresa × departamento → usuário (um titular por par).
- `tarefas` — a tarefa do mês: modelo, empresa, competência, responsável, prazo_meta,
  prazo_legal, status, concluída_em/por, comentário. Chave única (modelo, empresa, competência)
  → gerar duas vezes nunca duplica.
- `tarefa_eventos` — histórico (quem mudou status, comentário, anexo).

### 6.2 Geração
- Cron diário (como o da agenda): para a competência que fecha no mês corrente, cria o que falta.
  Rodar todo dia (e não só no dia 1) faz empresas novas e modelos novos entrarem sozinhos.
- Empresa desativada ou fora do filtro do modelo não gera; tarefa já criada não é apagada.
- Botão "Gerar agora" no painel para quem administra.

### 6.3 Status
`A fazer` → `Em andamento` → `Concluída` (ou `Não se aplica`, com motivo).
**Atrasada** e **Risco de multa** não são gravados: são calculados (hoje > meta / hoje > prazo
legal, sem estar concluída) — assim nunca ficam desatualizados.

### 6.4 Telas
- **Tarefas › Minhas** (padrão ao abrir): as do usuário, agrupadas Atrasadas · Hoje · Esta semana ·
  Depois; concluir em 1 clique.
- **Tarefas › Painel**: tabela com filtros (competência, departamento, responsável, empresa,
  status) + contadores no topo; ação em lote (concluir / reatribuir / não se aplica).
- **Tarefas › Por empresa**: grade empresa × modelo da competência (visão do "fechamento").
- **Configurações › Modelos de tarefa** e **Configurações › Carteira** (empresa × departamento).
- **Visão geral**: o calendário ganha "Minhas tarefas do dia" (uma consulta leve, contagem por dia).

### 6.5 Fica para a Fase 2
Etapas/cascata, checklist, conclusão automática pelas centrais, anexos, Kanban.

## 7. Lista inicial de modelos (sugestão para o Wellington corrigir)

| Departamento | Tarefa | Aplica a | Prazo |
|---|---|---|---|
| Fiscal | Emitir/conferir notas do mês e importar recebidas | todas PJ | dia fixo |
| Fiscal | Apurar Simples (PGDAS-D) e enviar DAS | Simples | agenda: DAS + meta |
| Fiscal | Apurar PIS/COFINS | Presumido/Real | agenda: 8109/2172 + meta |
| Fiscal | Apurar IRPJ/CSLL (trimestral) | Presumido/Real | agenda: 2089/2372 |
| Fiscal | ISS próprio — Rio (Nota Carioca) | município Rio | dia fixo |
| Fiscal | ISS próprio — Petrópolis | município Petrópolis | dia fixo |
| Fiscal | EFD-Reinf e DCTFWeb | quem tem retenção/folha | agenda |
| Fiscal | EFD-Contribuições | Presumido/Real | agenda |
| Fiscal | MIT/DCTFWeb (sem movimento de folha) | Presumido/Real | agenda |
| DP | Folha e pró-labore | tem folha/pró-labore | dia fixo |
| DP | eSocial (fechamento S-1299) | tem folha | dia fixo |
| DP | FGTS Digital | tem empregado | dia fixo |
| DP | INSS/IRRF da folha (DCTFWeb) | tem folha | agenda: 1082/0561 |
| Contábil | Conciliação bancária e lançamentos | Presumido/Real | dia fixo |
| Contábil | Balancete do mês | Presumido/Real | dia fixo |
| Societário | Situação fiscal (SITFIS) e certidões | todas | dia fixo |
| Anual | DEFIS · DASN-SIMEI · ECD · ECF · DIRPF dos sócios · DMED | conforme regime | agenda |

## 8. Status (23/11/2026)

Fase 1 implementada (migration `20261123120000_fase_cc_tarefas.sql`, aplicada em produção).
- Telas: `/admin/tarefas` (Minhas · Painel geral · Por empresa), Configurações › Modelos de tarefa e › Carteira,
  faixa "Minhas tarefas" na Visão geral.
- Cron `/api/cron/tarefas` (10h40 UTC, depois da agenda): gera a competência anterior e completa prazos.
- Os 18 modelos sugeridos estão **desativados** — revisar, ativar e montar a carteira antes de gerar.
- Teste em produção (163 tarefas do Simples de out/2026: gerar, concluir, reabrir, reatribuir) apagado depois.
