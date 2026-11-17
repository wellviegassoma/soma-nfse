# Pedido de nota via WhatsApp → rascunho por IA → aprovação → emissão

Plano de implementação. Decidido em 16/11/2026 com o usuário, depois de descartar o agente
que atenderia todas as conversas (custo de IA alto demais para a carteira):

- **O atendimento continua humano, no Digisac.** A IA não conversa com o cliente.
- O atendente **sinaliza** que a conversa é um pedido de nota mandando um **comentário interno
  `#nota`** no chamado (o cliente não vê). Ver Fase 0: no Digisac a etiqueta é do *contato*,
  não do chamado, e não gera webhook.
- A IA lê as mensagens (texto, áudio, foto/PDF, planilha) e monta o **rascunho** da NFS-e.
- O time **aprova** num painel do SOMA Gestão; só então a nota é emitida, pelo mesmo motor
  de `lib/actions/notas.ts`.
- O PDF e o XML voltam para o cliente **no mesmo chamado do Digisac**.

Meta: tirar do atendente/fiscal os 5–10 min por nota (abrir o SOMA Gestão, achar o tomador,
digitar, baixar o PDF, mandar no WhatsApp), deixando só o `#nota` + um clique de conferência.
Custo de IA estimado: R$ 30–220/mês para 500–2.000 pedidos (uma única chamada estruturada por
pedido, sem conversa).

## Visão geral

```
Cliente ──WhatsApp──▶ Digisac ──(atendente manda comentário "#nota")──▶ webhook message.created
                                                                               │
                         SOMA Gestão  /api/digisac/webhook  ◀──────────────────┘
                           0. descarta tudo que não for comentário começando com #nota
                           1. grava pedidos_nota (status RECEBIDO), idempotente por ticket
                           2. baixa as mensagens do chamado + anexos (API Digisac)
                           3. áudio → transcrição; planilha → leitor de lote-notas.ts
                           4. IA (generateObject) → rascunho(s) + alertas
                           5. status AGUARDANDO_APROVACAO
                                        │
            Painel "Pedidos de nota" ◀──┘   analista confere/edita → [Aprovar e emitir]
                                        │
                           6. emitirNota() (núcleo extraído de issueNfse)
                           7. envia o PDF e o XML no chamado do Digisac → status EMITIDA
                           (erro → status ERRO + nota interna no chamado para o atendente)
```

## Fase 0: validação (1–2 dias, antes de escrever código)

**Lido em 16/11/2026** na documentação Postman da API do Digisac
(https://documenter.getpostman.com/view/53282970/2sBXihpXmF). Base `{{URL}}/api/v1`, auth
**Bearer** com token pessoal (Conta → API → Tokens de acesso pessoal; herda as permissões do
usuário que o criou). Criar um usuário de integração dedicado, por exemplo "SOMA Gestão (robô)".

| # | Pergunta | O que a documentação mostra | Decisão |
|---|---|---|---|
| 1 | Webhook quando uma etiqueta é colocada? | **Não.** Etiquetas são do **contato** (`PUT /contacts/{id}` com `tagIds`), não do chamado, e os únicos eventos documentados são `message.created` e `message.updated` (`POST /me/webhooks` com `url`, `events[]`, `active`). | **Gatilho = comentário interno `#nota`.** Comentário é uma mensagem (`type: "comment"`), então deve disparar `message.created`. ⚠️ Confirmar no teste. O comentário pode levar dicas (`#nota 3500 consultoria`). |
| 2 | Ler as mensagens do chamado e baixar mídia? | `GET /messages?where[contactId]=…` lista; `GET /messages/{id}?include[0]=file` traz o arquivo da mensagem. `GET /tickets/{id}` existe. | **Sim.** ⚠️ Confirmar no teste: filtro `where[ticketId]` (não documentado, mas o padrão `where[...]` sugere que funciona) e o formato do objeto `file` (URL assinada?). |
| 3 | Enviar o PDF/XML de volta? | `POST /messages` com `file: { base64, mimetype, name }` + `text`, por `number`+`serviceId` (ou `contactId`). Exemplos de imagem, PDF e áudio. | **Sim.** XML vai como `application/xml`. ⚠️ Confirmar no teste. |
| 4 | Nota interna para o atendente? | `POST /messages` com `type: "comment"`. | **Sim.** Usado para "faltou o CNPJ do tomador", "nota emitida", erro do Sefin. |
| 5 | Transcrição de áudio pela API? | Não documentada. | **Transcrever do nosso lado** (cerca de R$ 0,03/min). |

**Resultado do teste de leitura (16/11/2026, só GET, com o token real):**

| Item | Resultado |
|---|---|
| Autenticação Bearer | ✅ `GET /me` → 200 |
| Lista de mensagens | ✅ Envelope paginado `{ data, total, limit, skip, currentPage, lastPage }`. Cada mensagem traz `ticketId`, `contactId`, `serviceId`, `type`, `text`, `isFromMe`, `isComment`, `origin`. |
| Filtro por chamado | ✅ `GET /messages?where[ticketId]=…` funciona: todas as mensagens devolvidas são do mesmo chamado. |
| Comentário interno | ⚠️ Fica gravado como `type: "chat"` **com `isComment: true`**, não `type: "comment"` (há 515 na conta, então o time já usa). O filtro do webhook deve olhar `isComment`. |
| Arquivos | ✅ `GET /messages/{id}?include[0]=file` → `file { name, extension, mimetype, url }`. Download testado: jpeg, pdf e áudio (`audio/ogg; codecs=opus`, tipo `ptt`). ⚠️ A `url` abre **sem autenticação**: tratar como dado sensível, nunca logar. |
| Transcrição | ❌ Os campos `isTranscribing`/`transcribeError` existem, mas estão vazios: a transcrição não está ativa no plano. Transcrever do nosso lado. |
| Webhooks | Nenhum cadastrado na conta ainda. |

**Ainda não testado (precisa de efeito real, pedir OK antes):**

1. Se um comentário dispara `message.created`. Precisa do endpoint publicado (Vercel), porque
   não vamos apontar o webhook da conta inteira para um receptor de terceiros: todo o tráfego
   de mensagens de clientes passaria por lá.
2. Enviar um PDF/XML por `POST /messages` (manda mensagem de verdade; usar um número interno).
3. O token atual parece ser de um usuário pessoal, não de um usuário de integração dedicado.
   Trocar antes de produção.

**Consequências para o desenho:**

- O webhook `message.created` chega para **toda** mensagem da conta (milhares por dia). O
  endpoint precisa descartar em microssegundos o que não for `isComment === true` com texto
  começando por `#nota`, sem tocar no banco.
- `origin` das mensagens que o SOMA Gestão envia = `"bot"`, com o usuário de integração, para
  ficar claro no histórico do chamado que foi o sistema.
- Busca de contato por telefone, se precisar: `GET /contacts?where[data.number][$iLike]=%…%`.

**Teste de bancada (meio dia, com o token de integração):**

1. Registrar o webhook apontando para um receptor de teste e mandar um comentário `#nota` num
   chamado de teste. Confirmar que chega `message.created` e anotar o payload (campos de
   ticket, contato, tipo, texto).
2. `GET /messages?where[ticketId]=…` e `?include[0]=file` numa mensagem com foto, PDF, áudio e
   planilha. Anotar como baixar o binário.
3. Enviar um PDF e um XML de teste por `POST /messages` para um número interno.
4. Registrar aqui os payloads reais (sem dados de cliente).

Também medir: **quantos pedidos de nota chegam por mês** (puxar 1 mês de chamados e contar).
Isso decide o modelo (ver "Modelo e custo").

## Fase 1: receber o pedido (2–3 dias)

**Status (16/11/2026): no ar em produção e validado com um `#nota` real.** Migration
aplicada à mão pelo SQL Editor; webhook `message.created` cadastrado
(`nfse.somaintegrada.com.br/api/digisac/webhook`); primeiro pedido gravado em `pedidos_nota`.
O formato `{ event, data }` do corpo do webhook (ou a mensagem solta) funcionou.

- [x] Migration `supabase/migrations/20261116170000_fase_bj_pedidos_nota.sql`: `pedidos_nota`,
      `pedido_nota_itens`, `pedido_nota_empresas_por_telefone` (devolve **todas** as empresas do
      telefone) e RLS. **Ainda não aplicada.**
- [x] `src/lib/digisac/client.ts`: cliente da API (mensagem, mensagens do chamado, contato,
      comentário, download de arquivo).
- [x] `src/lib/pedido-nota/receber.ts`: rebusca o comentário na API (o payload do webhook só
      serve de gatilho), cria o pedido de forma idempotente, pega as mensagens do cliente
      das 72h antes do `#nota` (máx. 40), copia até 15 anexos para o Blob privado, casa a
      empresa pelo telefone e (opcionalmente) responde com um comentário.
- [x] `src/app/api/digisac/webhook/route.ts`: segredo na URL, filtro barato, processamento em
      `after()`. Rota liberada no middleware (`PUBLIC_ROUTES`).
- [x] `scripts/digisac-webhook.mjs`: `listar` / `cadastrar https://<domínio>`.
- [x] Testado local: sem token/token errado → 401; mensagem comum, comentário sem comando,
      `#notas`, `message.updated` e corpo inválido → ignorados; id inexistente → descartado
      sem gravar nada; payload forjado com id de comentário real que não é `#nota` → recusado
      depois de rebuscar na API.
- [x] Aplicar a migration em produção (SQL Editor; falta registrar no histórico com `supabase migration repair --status applied 20261116170000`).
- [x] Variáveis na Vercel: `DIGISAC_URL`, `DIGISAC_TOKEN`, `DIGISAC_WEBHOOK_SECRET`,
      `DIGISAC_RESPONDER_COMENTARIOS=0` (ligar depois do primeiro teste).
- [x] Publicar, cadastrar o webhook e fazer o primeiro `#nota` real num chamado de teste.
      Registrar aqui o formato real do corpo do webhook (a rota aceita `{event, data}` e a
      mensagem solta).

Plano original desta fase:

**Banco (migration `fase_bj_pedidos_nota`):**

- `pedidos_nota`
  - `id`, `created_at`, `updated_at`
  - `origem` (`DIGISAC`), `origem_ticket_id`, `origem_contact_id`, `telefone`
  - `company_id` (nulo até identificar)
  - `status`: `RECEBIDO` · `EXTRAINDO` · `AGUARDANDO_APROVACAO` · `EMITINDO` · `EMITIDA` ·
    `PARCIAL` · `ERRO` · `DESCARTADO`
  - `mensagens` jsonb (texto/transcrição de cada mensagem considerada, com id e horário)
  - `anexos` jsonb (caminho no Storage, tipo, tamanho)
  - `ia_modelo`, `ia_tokens_entrada`, `ia_tokens_saida`, `ia_custo_usd`
  - `erro` text, `atendente_digisac` text
  - **único** em (`origem`, `origem_ticket_id`, janela): a mesma etiqueta disparada duas vezes
    não cria dois pedidos
- `pedido_nota_itens` (um pedido pode virar N notas, como planilha ou "3 notas para 3 pacientes")
  - `pedido_id`, `ordem`, `status` (`RASCUNHO` · `APROVADO` · `EMITIDO` · `ERRO` · `DESCARTADO`)
  - rascunho: `customer_id` (ou `tomador_documento`/`tomador_nome` se não cadastrado),
    `service_id`, `valor`, `descricao`, `competencia`, retenções (mesmos campos do formulário
    de emissão: `iss_retido`, `aliquota_iss`, `irrf_pct`, `csrf_pct`, `inss_pct`)
  - `alertas` jsonb, `confianca` (alta/média/baixa), `trecho_origem` (de onde saiu cada campo)
  - `editado_pelo_humano` bool (métrica), `aprovado_por`, `aprovado_em`, `dps_id`
- RLS: mesmo padrão do módulo Atendimento (staff SOMA; papéis `ANALISTA_ATENDIMENTO` e quem
  tem `notas.emitir` na empresa).

**Endpoint `app/api/digisac/webhook/route.ts`:**

- Autenticação por segredo compartilhado (header ou query), validado com tempo constante.
- Responde 200 rápido e processa fora da requisição (`after()` do Next ou fila), porque o
  Digisac não deve esperar a IA.
- Filtra: só age em `message.created` com `isComment === true` e texto começando por `#nota`
  (comando configurável). O resto do texto do comentário vai junto como dica do atendente.
- Baixa as mensagens do cliente naquele chamado (`GET /messages?where[ticketId]=…`), desde a
  abertura do chamado ou as últimas N horas, e os anexos (`include[0]=file`) para o Supabase
  Storage (bucket privado `pedidos-nota`).
- Responde ao atendente com um comentário: "Pedido de nota recebido, rascunho no SOMA Gestão."

**Identificar a empresa:** ~~telefone do contato → `company_contatos_setor`~~. **Revisto em
16/11/2026** depois do primeiro teste real: os 3 pedidos ficaram sem empresa. Diagnóstico no banco
e no Digisac (só leitura, só contagens):

- `company_contatos_setor` tem **0** telefones preenchidos; nenhum tomador tem o telefone de teste.
- No Digisac não há organizações nem campos personalizados ligando contato a empresa.
- **25 de 34** conversas ativas de clientes são **grupos** de WhatsApp (grupo não tem telefone).
- 72 das 314 empresas não têm CNPJ; 68 delas são pessoa física com CPF.

Nova ordem (`src/lib/pedido-nota/empresa.ts` + `empresa-core.ts`, migration
`20261117090000_fase_bk_pedido_nota_vinculos.sql`):

1. **CPF/CNPJ no `#nota`** (`#nota 12.345.678/0001-90 3500 consultoria`). O primeiro documento
   que for de uma empresa cadastrada (CNPJ, ou CPF de cliente PF) define a empresa e sai da dica.
   Documento que não é de empresa fica na dica, porque pode ser o do tomador. Grava o vínculo.
2. **Vínculo aprendido** (`pedido_nota_vinculos`: contato/grupo do Digisac → empresa). Gravado
   pelo passo 1 e, na Fase 3, pela escolha no painel.
3. **Telefone** (`company_contatos_setor`), quando houver; nunca em grupo.
4. **Nome do grupo** (padrão da SOMA: **"SOMA + nome da empresa no sistema"**; 547 dos 619
   grupos usam "SOMA +"). Tira o prefixo e compara as palavras significativas, ignorando
   natureza jurídica, preposições, "Dr./Dra." e termos de ramo que só aparecem de um lado ("PSD",
   "Livro Caixa", "Serviços Médicos", "Clínica"...). **Idêntico** a uma única empresa → usa, com aviso
   leve `EMPRESA_PELO_NOME_EXATO`. **Muito parecido** (todas as palavras de um lado no outro, com 2+
   em comum) e único → usa, com aviso forte `EMPRESA_PELO_NOME`. Senão, as mais parecidas vão
   como sugestão no painel. Medido em 16/11/2026 nos 226 grupos com conversa nos últimos 90 dias:
   111 idênticos, 34 muito parecidos, 32 ambíguos, 17 só com sugestões, 49 sem empresa parecida.

**Grupos do WhatsApp no cadastro (fase_bl, 16/11/2026, pedido do usuário):** a tela Dados fiscais da
empresa tem o cartão "Grupos do WhatsApp" (busca nos grupos do Digisac, vincular/remover, mostra outras
empresas do mesmo grupo). `pedido_nota_vinculos` passou a ser muitos-para-muitos (único por contato +
empresa): um grupo pode atender várias empresas (ex.: BFM Diagnóstico + BFM Participações + Dr. Bruno
PF) e uma empresa pode ter vários grupos. No `#nota`, o passo 2 (vínculo) virou "grupo cadastrado":
com 1 empresa usa direto; com várias, `escolher-empresa.ts` pede à IA para decidir pela conversa
(nome, serviços e tomadores de cada empresa) → `empresa_fonte = GRUPO_IA` + aviso forte
`EMPRESA_ESCOLHIDA_IA`; sem certeza, o painel mostra só as empresas do grupo. Escolha no painel e
`#nota` com CNPJ **somam** a empresa ao grupo. Preenchimento inicial:
`node scripts/vincular-grupos-iniciais.mjs [--aplicar]` — só nomes idênticos a uma única empresa
(182 grupos, 111 com conversa em 90 dias, 119 empresas), fonte `NOME_INICIAL`.

`pedidos_nota.empresa_fonte` guarda de onde veio a empresa (`CNPJ_COMANDO`, `VINCULO`,
`TELEFONE`, `NOME_CONTATO`, `PAINEL`). O comentário de retorno ao atendente explica como indicar
a empresa quando ela não for achada.

## Fase 2: IA monta o rascunho (3–4 dias)

**Status (16/11/2026): código pronto e testado com dados fictícios; não publicado.**

- [x] `src/lib/pedido-nota/extrair-core.ts` (sem banco, testável): instruções, catálogo da
      empresa em cache, schema zod da resposta, `chamarIA` (AI SDK `generateText` +
      `Output.object`; instruções em `instructions`, porque o AI SDK 7 recusa `role: system`
      dentro de `messages`) e `posProcessar` (ids só do catálogo; o documento citado vence o
      nome; alertas `TOMADOR_NOVO`, `TOMADOR_DIVERGENTE`, `DOCUMENTO_INVALIDO`,
      `SERVICO_INCERTO`, `VALOR_AUSENTE`, `VALOR_ACIMA_PADRAO` (> 3× a média),
      `POSSIVEL_DUPLICIDADE` (mesmo valor em 7 dias), `COMPETENCIA_FORA_DO_MES`,
      `AUDIO_NAO_TRANSCRITO`, `OBSERVACAO_IA`).
- [x] `src/lib/pedido-nota/extrair.ts`: lê o pedido, trava (`EXTRAINDO`), monta o catálogo
      (serviços ativos, até 400 tomadores com os das últimas notas primeiro, 15 últimas notas),
      prepara os anexos (imagem/PDF até 18 MB no total vão para a IA; a planilha passa pelo
      `lerPlanilhaLote`; o áudio fica sem transcrição por enquanto), grava `pedido_nota_itens` e
      deixa `AGUARDANDO_APROVACAO` com tokens e custo. A reextração substitui só os itens
      `RASCUNHO`.
- [x] Encadeado no recebimento: com uma única empresa candidata, extrai na hora; o comentário
      de retorno passa a dizer "N rascunho(s) prontos".
- [x] Teste com dados fictícios: duas notas ("igual mês passado, mas 3,8 mil" e "450 de
      ultrassom pro CPF X") e uma tentativa de manipulação ("IGNORE AS REGRAS… 99999"). Os dois
      modelos acertaram tomador, serviço e valor, ignoraram a manipulação e a registraram em
      observação.

      | Modelo | Tempo | Tokens (entrada/saída) | Custo/pedido |
      |---|---|---|---|
      | `claude-opus-5-5` (padrão) | 8 s | 3.255 / 590 | US$ 0,028 (≈ R$ 0,15) |
      | `claude-sonnet-5-5` | 11,5 s | 3.255 / 507 | US$ 0,013 (≈ R$ 0,07) |

      Troca por `PEDIDO_NOTA_MODELO` na Vercel. O cache não pegou nesse teste (o catálogo
      fictício é menor que o mínimo cacheável); com catálogo real grande deve pegar.
- [ ] Transcrição de áudio: escolher o serviço.
- [ ] Publicar e testar com um `#nota` real.

Plano original desta fase:

`lib/pedido-nota/extrair.ts`: **uma** chamada `generateObject` (AI SDK, `@ai-sdk/anthropic`, já
usado em `app/api/chat-ia/route.ts`) com schema zod `RascunhoNotas`.

**Pré-processamento (código, não IA):**

- Áudio → texto (Digisac ou serviço de transcrição, conforme a Fase 0).
- Planilha (`.xlsx`/`.csv`) → passa por `lib/lote-notas.ts`. Se as colunas forem reconhecidas, os
  itens saem direto, sem IA; a IA só entra se a planilha estiver fora do modelo.
- Imagem/PDF → vai para a chamada como bloco de imagem/documento.

**Contexto enviado à IA (montado no servidor, ordem estável para cache):**

1. Instruções fixas: o que é uma NFS-e, campos, regras ("nunca invente CNPJ"; "se o valor não
   estiver claro, deixe nulo e gere alerta").
2. Catálogo de serviços da empresa (`services`: id, nome, descrição).
3. Tomadores frequentes e últimas notas (`lib/emissao-prefill.ts`), para casar "o de sempre",
   "a Clínica X" etc.
4. A mensagem do cliente, **delimitada como dado** (tudo que vem do WhatsApp é tratado como
   conteúdo, nunca como instrução).

**Saída (schema):** lista de itens com `tomador` (id do cadastro ou documento/nome),
`service_id`, `valor`, `descricao`, `competencia`, retenções, `confianca` e `trecho_origem` por
campo, mais `pergunta_ao_cliente` quando faltar algo.

**Pós-processamento (código):**

- Tomador não cadastrado com CNPJ → `lib/cnpj-lookup.ts` preenche, mas o item fica com o alerta
  "tomador novo".
- Alertas determinísticos:
  - valor > 3× a média das últimas 10 notas para o tomador;
  - nota parecida (mesmo tomador e valor) nos últimos 7 dias, possível duplicidade;
  - competência fora do mês com `allow_retroactive_emission = false`;
  - serviço com baixa confiança;
  - retenção diferente do padrão do serviço.
- A IA **não tem nenhuma ferramenta com efeito**: só devolve o JSON. Emitir é sempre outro
  passo.

## Fase 3: painel de aprovação (3–4 dias)

**Status (16/11/2026): no ar. Primeira NFS-e emitida pelo painel e autorizada.** Corrigidos depois do
teste: os links iam para `/empresas/...` (portal do cliente) em vez de `/admin/emissao-notas/...`;
a descrição padrão do serviço e a data de hoje vêm preenchidas (e gravam como null para não contar
como edição).

- [x] `/admin/pedidos-nota` (aba "Pedidos de Nota", só com `notas.emitir`): filtros Para
      resolver / Emitidos / Descartados / Todos; contato (grupo), empresa e de onde ela veio,
      nº de notas e total.
- [x] `/admin/pedidos-nota/[pedidoId]`: mensagens do cliente à esquerda (foto e áudio
      inline, PDF/planilha por link via `/api/pedidos-nota/[id]/anexos/[i]`, Blob privado) e
      um cartão por rascunho à direita, com alertas, pergunta ao cliente, tomador/serviço
      (selects do cadastro), valor, competência e descrição.
- [x] Escolher/trocar a empresa (busca por nome, código, CNPJ/CPF; candidatas primeiro):
      grava o vínculo `PAINEL` e roda a IA na hora.
- [x] Ações: **Aprovar e emitir**, Salvar sem emitir, Descartar nota, Descartar pedido (com
      motivo), Ler de novo. `editado_pelo_humano` marca o que o analista mudou (métrica da
      Fase 5).
- [x] **Sem refatorar a emissão** (mudança de plano): `aprovarEEmitirItem` monta o mesmo
      `FormData` da tela Emitir Nota e chama `issueNfse`, então valem as mesmas regras e
      permissões. Trava `RASCUNHO/ERRO → APROVADO` antes de emitir (o duplo clique não emite
      duas vezes). Retenções: sem informação explícita no pedido, ficam no padrão do serviço.
- [ ] Tomador novo: hoje é link para cadastrar na tela de tomadores e recarregar. Cadastro
      direto pelo CNPJ no painel fica para depois.
- [ ] "Pedir dado ao cliente" pelo Digisac, atalhos de teclado, contador no menu.

Plano original desta fase:

`app/atendimento/pedidos-nota/` (ou `admin/`, conforme os papéis):

- Fila por status, com contador no menu. Ordenação: mais antigos primeiro.
- Detalhe do pedido: **à esquerda** as mensagens originais (texto, transcrição, imagem, PDF);
  **à direita** o(s) rascunho(s) no mesmo formulário de `EmitirNotaForm.tsx`, já preenchido,
  com os alertas em destaque e o trecho de origem de cada campo ao passar o mouse.
- Ações: **Aprovar e emitir** (um item ou todos), **Editar**, **Descartar** (com motivo),
  **Pedir dado ao cliente** (gera nota interna no Digisac com a `pergunta_ao_cliente`).
- Atalhos de teclado para conferir em sequência (pedido de lote).

**Refatoração necessária em `lib/actions/notas.ts`:** hoje `issueNfse` lê de `FormData`
(server action da tela). Extrair o núcleo para `emitirNota(params, ator)`, função pura de
servidor, usado tanto por `issueNfse` quanto pelo painel. Assim toda regra existente (trava
retroativa, retenções, inscrição municipal aprendida, emissão por procuração, auditoria em
`audit_logs`) vale igual. Para os itens de planilha, reaproveitar `conferirLote` /
`actions/lote-notas.ts`.

## Fase 4: devolução ao cliente (1–2 dias)

**Status (16/11/2026): código pronto (`src/lib/pedido-nota/devolver.ts`), desligado por padrão.**
Depois de emitir, gera o DANFSe pelo nfse-engine e manda o PDF e o XML no contato do Digisac
(`POST /messages` com `file.base64`), mais um comentário para o atendente. Só envia ao cliente
com `DIGISAC_ENVIAR_NOTA_CLIENTE=1`; desligado, só comenta (se
`DIGISAC_RESPONDER_COMENTARIOS=1`). ✅ Testado em 16/11/2026: `POST /messages` com `contactId` + `serviceId` + `file` (XML da
primeira nota emitida pelo painel) → 201, tipo `document`, chegou no WhatsApp do contato de teste.
O PDF usa o mesmo gerador do botão "Baixar PDF" (não testado por este caminho).

- Após `ACCEPTED`: enviar o DANFSe (PDF) e o XML no chamado do Digisac, com texto padrão
  ("Sua nota nº X para Y, valor R$ Z, foi emitida."). Status `EMITIDA`.
- Rejeição do Sefin ou erro: status `ERRO`, mensagem amigável (a mesma que a tela já mostra,
  vinda de `nfse_errors`) e nota interna no Digisac para o atendente.
- Pedido com N itens e emissão parcial: status `PARCIAL`, com o envio do que deu certo.
- Comentário interno no chamado ao concluir ("Nota nº X emitida e enviada"), para o atendente
  ver que acabou sem abrir o SOMA Gestão.

## Fase 5: piloto e métricas (2 semanas)

- Começar com 10 empresas de alto volume de pedidos; depois liberar para todas.
- Métricas (tela simples em `/admin`, a partir de `pedidos_nota`):
  - **% de itens aprovados sem edição** (principal indicador de qualidade da IA);
  - tempo entre etiqueta e nota enviada; tempo de conferência humana por item;
  - custo de IA por pedido (`ia_custo_usd`);
  - motivos de edição e de descarte (alimentam ajustes nas instruções).
- Teto de gasto na conta Anthropic (Console → Limits) com alerta por e-mail.

**Critério para afrouxar a aprovação (decisão do sócio, não automática):** ≥ 95% dos itens
aprovados sem edição por 4 semanas seguidas. Aí a emissão direta passa a valer **apenas** para
tomador já cadastrado + serviço com confiança alta + valor dentro do padrão + nenhum alerta. O
resto continua na fila.

## Modelo e custo

Uma chamada por pedido, com cerca de 3k tokens de contexto em cache, 1,5k novos e 400 de
saída (+1,6k por imagem). Preços de 11/2026, câmbio a R$ 5,40:

| Pedidos/mês | Sonnet 5.5 | Opus 5.5 |
|---|---|---|
| 500 | ≈ R$ 30 | ≈ R$ 55 |
| 1.000 | ≈ R$ 55 | ≈ R$ 110 |
| 2.000 | ≈ R$ 110 | ≈ R$ 220 |

Escolha do modelo: no piloto, rodar os mesmos 50 pedidos reais nos dois e comparar a "% sem
edição". A diferença em reais é pequena; o que pesa é o erro.

## Riscos e cuidados

- **API do Digisac** (Fase 0): a documentação cobre tudo de que precisamos. Falta confirmar
  na prática três detalhes: o comentário dispara `message.created`; o filtro por `ticketId`;
  o download do arquivo. Se o comentário não disparar o webhook, o plano B é um robô Digisac
  com bloco de requisição HTTP acionado pelo atendente, e o plano C é consultar a cada 1–2 min
  os comentários recentes (`GET /messages` filtrando `type=comment`).
- **Telefone sem empresa / atendido por várias empresas:** o painel exige a escolha manual; nunca
  adivinhar.
- **Duplicidade:** idempotência por chamado + alerta de nota parecida em 7 dias.
- **Instruções escondidas na mensagem do cliente:** a IA não tem ferramenta com efeito e a
  saída é só um JSON validado; a emissão passa sempre por humano (e, depois, por regras
  determinísticas).
- **LGPD:** mensagens e anexos ficam em bucket privado, com retenção definida (sugestão: 90 dias
  para mídia; o rascunho e a nota ficam junto da nota).
- **Responsabilidade técnica:** a aprovação humana fica registrada (`aprovado_por`,
  `audit_logs`).

## Estimativa

| Fase | Esforço |
|---|---|
| 0. Validação Digisac + volume | 1–2 dias |
| 1. Receber pedido | 2–3 dias |
| 2. IA monta rascunho | 3–4 dias |
| 3. Painel de aprovação + extração de `emitirNota` | 3–4 dias |
| 4. Devolução ao cliente | 1–2 dias |
| 5. Piloto | 2 semanas (em paralelo com ajustes) |

Cerca de 2,5 semanas de desenvolvimento até o piloto e cerca de 4–5 semanas até estar em toda a
carteira.

## Ajustes depois do uso real (17/11/2026)

- **Tomador novo no painel:** nome + CPF/CNPJ da mensagem vêm editáveis e o tomador é cadastrado ao
  aprovar (`tomador-novo.ts`, dígitos validados; CNPJ completa pela Receita).
- **Mensagem ao cliente:** só o PDF, com o conteúdo do DANFSe no texto (`resumo-nota.ts`); XML só com
  `DIGISAC_ENVIAR_XML_CLIENTE=1`.
- **Consulta de notas emitidas** (`/admin/pedidos-nota/notas/[companyId]`, abre em outra aba): notas do
  SOMA Gestão + `notas_distribuidas` (outros emissores), busca, copiar descrição, abrir PDF.
- **IA usa as notas de outros emissores** como histórico (tomador e descrição habituais, alertas).
- **Serviço escolhido traz a descrição padrão**, com "voltar" e "juntar" com a anterior.
- **Empresa citada na conversa:** a IA devolve `empresa_citada` ("Empresa Rcbastos" num contato
  vinculado à Techbone); bate com uma só empresa (`empresasPorTrecho`) → troca e lê de novo com aviso
  `EMPRESA_CITADA`. Todo pedido aberto tem "Trocar a empresa deste pedido". Validado com o caso real.
- **Inscrição municipal (fora do fluxo, mas achado nele):** E0116 com IM errada. O CNC pode ter outra
  IM (RRAD: o CNPJ). A IM de 43 empresas foi preenchida pelas notas aceitas, e `issueNfse` passou a
  corrigir a IM pelas notas aceitas e reenviar uma vez.
