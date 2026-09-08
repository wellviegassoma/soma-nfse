# Módulo Financeiro — Especificação

Módulo novo do SOMA Gestão, no mesmo padrão de **Legalização** e **Extratos**: rota própria
(`/financeiro`), papel próprio no enum `user_role`, RLS própria, arquivos no Vercel Blob.
Objetivo declarado: **substituir o Nibo Gestão Financeira** no uso da SOMA e dos clientes.

Levantamento feito em 07/09/2026 navegando o Nibo real (conta SOMA Contabilidade Integrada,
`empresa.nibo.com.br`) + documentação pública da API (`nibo.readme.io`).

## Por que dentro do SOMA Gestão

O módulo herda de graça o que já está pronto e testado: Supabase Auth, `organizations` /
`companies` / `profiles` / `user_companies`, RLS, papéis por setor, upload pro Blob,
`audit_logs`, busca rápida de empresa, layout. E ganha duas ligações que o Nibo não tem:

- **NFS-e nativa.** O sistema já emite NFS-e Nacional. Fatura → nota sai sem integração.
- **Ponte com o módulo Extratos.** O controle contábil de entrega/conciliação mensal já
  existe; o financeiro passa a alimentá-lo em vez de ser uma ilha.

## O que o Nibo tem (mapa levantado)

Menu completo do Nibo Gestão Financeira:

| Área | Telas |
|---|---|
| Gestão de caixa | Resumo, Contas & Extratos, Fluxo de caixa |
| Contatos | Clientes, Fornecedores, Funcionários, Sócios |
| Recebimentos | Receber, Agendar, Boletos, NFS-e, Central de cobrança, Recorrências |
| Pagamentos | Pagar, Agendar, Recorrências |
| Relatórios | Painel de acompanhamento, Contas a receber/recebidas/a pagar/pagas, Mais relatórios |
| Configurações | Empresa, Categorias, Centros de custo, Cobrança, NFS-e, API, Usuários, Avançado |
| Mais opções | Histórico de atividades, Fechamento de mês |
| Contador | Documentos recebidos, Enviar documentos, Arquivo permanente, Sobre meu contador |

Achados que definem o modelo de dados:

- **Agendamento não é lançamento.** A tela "Pagar" lista agendamentos em aberto com coluna
  "Valor em aberto" e "Valor a pagar" editável — ou seja, um agendamento aceita pagamento
  parcial e múltiplas baixas. A API confirma: rotas separadas de *agendamento* e de
  *pagamento/recebimento*.
- **Categoria = conta do DFC**, não plano de contas contábil. Quatro grupos fixos: Receitas
  operacionais, Custos/Despesas operacionais, Atividades de investimento, Atividades de
  financiamento. Cada categoria tem natureza (entrada / saída). Algumas são de sistema e não
  editáveis (Juros/Multas/Descontos, e as retenções sobre pagamentos).
- **Formulário de agendamento**: vencimento, *previsto para* (data separada da de vencimento),
  contato, descrição, referência, categoria (com "+ adicionar categoria" = rateio),
  detalhamento, valor, anexos, anotações. Três toggles: **Valores detalhados**,
  **Recorrência ou Parcelamento**, **Tornar reembolsável**. Tem ainda preenchimento automático
  por IA a partir de documento anexado.
- **Valores detalhados** abre 4 abas: *Centro de custo* (rateio por percentual **ou** valor),
  *Retenção de impostos* (ISS, IRRF, CSLL, INSS, PIS, COFINS, Outras — **campos digitados,
  o Nibo não calcula**), *Desconto*, *Juros e multa*.
- **Conciliação** tem modo *Manual* e *Em lote*. Importação: OFX, planilha, **PDF (por IA,
  marcado "NOVO")**, e de maquininha: relatório de vendas e extrato de repasse (ambos IA, beta).
- **Fluxo de caixa** é projeção de saldo por conta selecionável — linha cheia até hoje,
  tracejada à frente, faixa negativa destacada — mais "Agendamentos passados" (vencidos).
- **Painel de acompanhamento** é DRE gerencial: meses em coluna, grupos expansíveis, alternador
  Caixa/Competência, visões Realizado x Agendado x Orçado, filtro por centro de custo.
- **Central de cobrança**: faturas com status, flag de NFS-e emitida, flag de recorrência, e
  ações em lote (emitir nota fiscal, habilitar cobrança, dar baixa).
- **Bloquear saldo** por conta e **Fechamento de mês** — travam lançamento retroativo.

Situação atual da SOMA no Nibo: ~215 empresas cadastradas, mas só **6 com o selo GF/BPO**
(Gestão Financeira de fato). A migração inicial é pequena — isso reduz muito o risco do corte.

## Modelo de dados proposto

Prefixo `fin_` em tudo, `company_id` em todas as tabelas raiz.

```
extrato_contas_bancarias      (já existe, do módulo Extratos — cadastro canônico de conta)
                              estendida com: tipo, saldo_inicial, data_saldo_inicial
fin_contatos                  cliente | fornecedor | funcionário | sócio (enum tipo),
                              cpf_cnpj, nome, dados de contato, tomador_id (opcional,
                              liga ao cadastro de NFS-e que já existe)
fin_categorias                grupo (DFC) + nome + natureza (entrada/saída) + sistema +
                              ordem + conta_contabil (mapeamento pro plano de contas)
fin_centros_custo             lista plana por empresa

fin_agendamentos              entidade central: tipo (RECEBER/PAGAR), contato_id,
                              vencimento, previsto_para, descricao, referencia,
                              valor_bruto, status (ABERTO/PARCIAL/LIQUIDADO/CANCELADO),
                              recorrencia_id, parcela_num/parcela_de, reembolsavel
fin_agendamento_categorias    rateio por categoria (n linhas por agendamento)
fin_agendamento_centros_custo rateio por centro de custo — percentual ou valor
(retenções e ajustes viraram COLUNAS de fin_agendamentos — ver nota abaixo)
fin_anexos                    blob_url/blob_pathname (mesmo padrão de Legalização/Extratos)

fin_lancamentos               baixa efetiva: agendamento_id XOR transferencia_id,
                              conta_id, data, valor COM SINAL
fin_transferencias            entre contas próprias — gera dois lançamentos espelhados

fin_extrato_linhas            linha crua importada: conta_id, data, descricao, documento,
                              valor, origem (OFX/CSV/PDF/MANUAL), hash_dedupe UNIQUE,
                              status (PENDENTE/CONCILIADO/IGNORADO)
fin_conciliacoes              match extrato_linha x lançamento (n:n — permite agrupar
                              várias linhas num lançamento e vice-versa)

fin_recorrencias              modelo do agendamento + frequência + data_inicio/data_fim +
                              gerado_ate + horizonte_meses. PARCELAMENTO gera tudo na criação;
                              RECORRENCIA mantém um horizonte de 12 meses à frente
fin_fechamentos               competência travada por empresa/conta (equivale a "Bloquear
                              saldo" + "Fechamento de mês")
fin_orcamento                 valor orçado por categoria x competência (fase posterior)
fin_faturas                   central de cobrança; liga em nfse/dps quando a nota é emitida
```

Regra de ouro herdada do resto do projeto: **arquivo não vai pro Postgres** — só o caminho
no Blob. Valor monetário em `numeric(14,2)`, nunca float.

### Retenções e ajustes: colunas, não tabelas filhas

**Decidido na F2 (07/09/2026).** A spec previa `fin_agendamento_retencoes` e
`fin_agendamento_ajustes` como tabelas filhas. Viraram colunas do próprio agendamento, porque
são valores únicos por agendamento — é exatamente assim que a aba "Valores detalhados" do Nibo
trata (sete campos de retenção, um de desconto, um de juros, um de multa; nunca uma lista).
Como colunas da mesma tabela, `valor_liquido` pôde virar `GENERATED ALWAYS`, o que torna
impossível o líquido divergir das parcelas que o compõem. Rateio de categoria e de centro de
custo continuam em tabelas filhas — esses são listas de verdade.

### Lançamento não agendado não é exceção

Todo lançamento nasce de um agendamento **ou** de uma transferência (`CHECK num_nonnulls = 1`).
"Pagamento não agendado" cria o agendamento já liquidado, como o Nibo faz — assim a
classificação mora sempre no mesmo lugar e nenhum relatório precisa tratar dois caminhos.

### Conta bancária: `extrato_contas_bancarias` é o cadastro canônico

**Decidido (07/09/2026):** não existe `fin_contas`. O módulo Extratos já cadastra conta
bancária por empresa (`banco`, `agencia`, `conta`, `codigo_banco`) e essa tabela é promovida a
cadastro único — o Financeiro só a estende (`tipo`, `saldo_inicial`, `data_saldo_inicial`).
É o mesmo objeto do mundo real; duplicar significaria o mesmo banco digitado duas vezes por
empresa, e a conciliação contábil do módulo Extratos passaria a olhar pra uma conta diferente
da que o financeiro movimenta.

Consequência: a policy de `extrato_contas_bancarias` era `is_soma_staff() or
is_extratos_analista()` — sem acesso de cliente, porque o módulo Extratos é interno. Com o
Financeiro o cliente precisa ver as próprias contas, então a policy foi ampliada para incluir
`ANALISTA_FINANCEIRO` e `ADMIN_CLIENTE` da própria empresa. `EMISSOR` continua de fora.

## Papéis e RLS

Papel novo no enum, em migration própria (valor de enum recém-criado não pode ser usado na
mesma transação — mesmo motivo já documentado em `fase_o_papeis_analistas`):

```sql
alter type public.user_role add value 'ANALISTA_FINANCEIRO';
```

**Diferença importante para Legalização/Extratos.** Naqueles módulos a policy é
`is_soma_staff() or is_<modulo>_analista()` — grosseira, sem isolamento por empresa, porque
**cliente nenhum acessa aquelas telas**. No Financeiro o cliente acessa. A policy precisa ser
por empresa, via `user_companies`:

- SOMA (`SUPER_ADMIN`, `ADMIN_SOMA`, `ANALISTA_FINANCEIRO`): vê as empresas a que está vinculado.
- Cliente (`ADMIN_CLIENTE`): vê **só a própria** `company_id`.
- `EMISSOR` e os outros analistas: sem acesso ao módulo.

Esse é o maior risco de segurança do módulo — dado financeiro de 200+ clientes num banco só.
Toda tabela `fin_*` nasce com RLS ligada e teste de isolamento antes de qualquer dado real.

## Telas

```
/financeiro                              dashboard SOMA — empresas, pendências, busca rápida
/financeiro/empresas/[id]                resumo: saldos, a receber/pagar, próximos vencimentos
/financeiro/empresas/[id]/contas         contas & extrato + saldo consolidado
/financeiro/empresas/[id]/conciliacao    importar (OFX/CSV/PDF) + conciliar manual/em lote
/financeiro/empresas/[id]/receber        agendamentos a receber + baixa em lote
/financeiro/empresas/[id]/pagar          agendamentos a pagar + baixa em lote
/financeiro/empresas/[id]/contatos       clientes, fornecedores, funcionários, sócios
/financeiro/empresas/[id]/fluxo-caixa    projeção de saldo
/financeiro/empresas/[id]/painel         DRE gerencial (caixa x competência, real x orçado)
/financeiro/empresas/[id]/cobranca       faturas → NFS-e → boleto
/financeiro/empresas/[id]/config         categorias, centros de custo, fechamento
```

Segue o padrão já adotado em Legalização e Extratos de separar **consulta** e **gerenciar**
quando a tela acumula cadastro e leitura.

## Importação de extrato

Três origens, todas caindo em `fin_extrato_linhas` com o mesmo `hash_dedupe`
(conta + data + valor + descrição normalizada) pra reimportação não duplicar:

1. **OFX** — parser determinístico. É o caminho principal, todo banco exporta.
2. **CSV/planilha** — mapeamento de colunas guardado por banco.
3. **PDF** — layout varia por banco, então regex não serve (diferente do PGDAS-D, que tem
   layout fixo da Receita). Usa o Claude via `@ai-sdk/anthropic` (já dependência do projeto)
   com saída validada por schema Zod, no padrão de `lib/pdf-import/`. Custo de centavos por
   extrato; sempre passa por tela de conferência antes de gravar.

**Conciliação automática** sugere match por valor exato + data ±3 dias, e aprende com o
histórico (descrição do extrato → contato/categoria usados da última vez). Sugestão nunca
grava sozinha — o usuário confirma, individualmente ou em lote.

## Onde superamos o Nibo

- **Retenções calculadas**, não digitadas. O sistema já tem `retencao_irrf_aliquota` e
  `retencao_pis_cofins_csll_aliquota` no catálogo de serviços e a lógica da IN RFB 1.234/2012.
  O Nibo só aceita o valor pronto.
- **Fatura → NFS-e sem integração**, porque a emissão é nossa.
- **Categoria financeira mapeada pro plano de contas contábil** (`conta_contabil` em
  `fin_categorias`) — o gerencial do cliente vira lançamento contábil sem retrabalho.
- **Um login só** pro cliente: nota fiscal, legalização, financeiro e documentos no mesmo lugar.

## Fases

| Fase | Escopo | Entregável |
|---|---|---|
| **F1** Fundação | Papel, RLS, navegação, contas, categorias (seed dos 4 grupos DFC), centros de custo, contatos | Cadastros com isolamento testado |
| **F2** Lançamentos | Agendar/pagar/receber, rateio de categoria e centro de custo, retenções, ajustes, anexos, recorrência e parcelamento, lançamento não agendado, transferência | Substitui o dia a dia do Nibo |
| **F3** Extrato e conciliação | Import OFX → CSV → PDF, conciliação manual e em lote, saldo por conta, bloqueio de saldo | Fecha o ciclo de caixa |
| **F4** Relatórios | Fluxo de caixa projetado, painel de acompanhamento, contas a pagar/receber/pagas/recebidas, exportação | Entregável ao cliente |
| **F5** Cobrança | Faturas, régua de cobrança, ligação com NFS-e (boleto fora do escopo) | Financeiro da própria SOMA |
| **F6** Migração e orçamento | Importar dados do Nibo, planejamento orçamentário, fechamento de mês | Corte do Nibo |

## Migração dos dados do Nibo

A API do Nibo (`nibo.readme.io`) cobre tudo que precisamos — contas, extrato, conciliações,
contatos, categorias, centros de custo, agendamentos, pagamentos, recebimentos, anexos,
cobranças — com filtro e paginação OData. Autenticação por **API-Key por empresa**, disponível
no plano Gestão Financeira Premium, em Empresa → Mais opções → Configurações → API.

Ordem de importação: categorias → centros de custo → contas → contatos → agendamentos →
lançamentos → conciliações → anexos. Rodar em paralelo (Nibo e SOMA lado a lado) por um mês
antes do corte, batendo saldo por conta.

A API-Key é credencial. Não guardar em arquivo do repo nem em texto puro no banco — mesmo
tratamento do certificado A1 (`MASTER_ENCRYPTION_KEY`, AES-256-GCM), ou variável de ambiente
descartada depois da migração.

## Dependências externas e riscos

- **Boleto** seria a única peça que não se resolve dentro de casa (exige convênio bancário ou
  PSP), mas a SOMA não emite boleto pelo Nibo hoje — então saiu do escopo e deixou de ser
  bloqueador do corte.
- **Dado financeiro de 200+ clientes** num banco só — RLS é a única barreira.
- **Custo de LLM** na importação de PDF e no preenchimento automático: baixo por documento,
  mas precisa de teto por empresa/mês.
- **Import de maquininha** (Cielo, Stone, Rede, PagSeguro) o Nibo já tem em beta; fica fora do
  escopo inicial, mas o modelo de `fin_extrato_linhas` já comporta.

## Decisões tomadas (07/09/2026)

1. **Conta bancária reaproveita `extrato_contas_bancarias`** — sem `fin_contas`. Ver seção acima.
2. **Categorias são por empresa e o cliente também edita.** Cada empresa nasce com um plano
   padrão (semeado na primeira vez que o módulo é aberto, via `fin_seed_categorias_padrao`)
   e a partir daí SOMA e cliente editam o mesmo plano. Categorias de sistema (juros, multas,
   descontos, retenções) continuam travadas, porque os cálculos dependem delas.
3. **Boleto fica fora do escopo.** A SOMA não emite boleto pelo Nibo hoje, então cobrança
   bancária não bloqueia o corte. A F5 fica reduzida a fatura + régua + NFS-e; boleto entra
   depois, se e quando fizer sentido.
4. `fin_contatos` fica **separada** de `tomadores` (NFS-e) e `socios` (societário), com FK
   opcional pro tomador — os cadastros têm ciclos de vida diferentes.

## Ainda em aberto

- Corte do Nibo: por empresa (as 6 do GF, uma de cada vez) ou tudo de uma vez?
- Import de maquininha (Cielo, Stone, Rede, PagSeguro): entra em alguma fase ou fica fora?
