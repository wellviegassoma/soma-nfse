# Módulo Atendimento — Especificação

Módulo novo do SOMA Gestão, no mesmo padrão de **Legalização** e **Extratos**: rota própria
(`/atendimento`), papel próprio no enum `user_role` (`ANALISTA_ATENDIMENTO`), RLS própria, sem
isolamento por empresa (cliente nunca loga nessas telas — é o inbox interno da SOMA). Objetivo
declarado: substituir o Digisac (plataforma de atendimento por WhatsApp que a SOMA usa hoje)
por um inbox nativo, sem custo por usuário/conexão e integrado com o resto do sistema.

Levantamento feito em 22/09/2026 navegando o Digisac real (conta SOMA Contabilidade Integrada,
`gruposoma.digisac.co`).

## Por que dentro do SOMA Gestão

O módulo herda de graça o que já está pronto: Supabase Auth, `organizations` / `companies` /
`profiles` / `user_companies`, RLS, papéis por setor, `audit_logs`, layout. E ganha uma ligação
que o Digisac não tem: ao receber uma mensagem, o contato é casado por telefone contra
`company_contatos_setor` — se bater, o atendente já vê de qual empresa cliente é aquele número,
com link direto pro painel da empresa, sem precisar abrir outra aba nem perguntar.

## O que o Digisac tem (mapa levantado)

- **Multicanal**: WhatsApp (não-oficial e Cloud API oficial), Instagram, Facebook Messenger,
  Telegram, Webchat, E-mail, SMS, Reclame Aqui.
- **Fila de atendimento**: abas Minhas / Fila / Todas, filtro por conexão/tag/departamento.
- **Chamado**: transferir entre departamentos com comentário obrigatório (fica no histórico),
  fechar/reabrir, nota interna (comentário que não vai pro cliente), respostas rápidas com
  categoria, tags no contato.
- **Robôs**: construtor visual por fluxograma (mensagem, condição, gatilho, transferir/fechar
  chamado, tag, webhook/requisição HTTP).
- **CRM leve**: Contatos, Pessoas, Organizações, Kanban.
- **Gestão**: Usuários, Cargos, Departamentos, Tabela de horários, Feriados, Auditoria.
- **Relatórios**: tempo de espera, tempo de atendimento, volume, avaliação (CSAT), exportação.
- **Integrações**: injeta tela externa via iframe em 6 pontos da UI (modal de contato, barra
  lateral, dentro da mensagem, menu superior, transferência, fechamento) — pago por conexão.
- **IA por crédito**: agente inteligente, copiloto, resumo de conversa, transcrição de áudio,
  texto mágico.

Plano atual da SOMA: R$ 716,80/mês — 19 usuários (**19/19, no teto**) + 4 conexões (2 WhatsApp
ativas). Qualquer usuário ou conexão nova já dispara custo extra imediato.

## Decisão de conexão: Baileys, não Cloud API (por enquanto)

**Decidido em 22/09/2026, junto com o usuário.** O soma-nfse roda 100% serverless (Next.js na
Vercel) + serviços Python sempre-ativos na Railway (`integra-contador`, `nota-carioca-service`).
Isso favorecia a WhatsApp Cloud API oficial (só webhook, sem processo sempre-ativo) — mas a
decisão foi começar com **Baileys** (WhatsApp Web não-oficial), usando o número da SOMA como já
está hoje, sem passar pela verificação de Business Manager da Meta, com a possibilidade
combinada de migrar para a Cloud API depois.

Trade-off aceito conscientemente: Baileys tem risco real de o WhatsApp banir o número se
detectar automação, e exige um processo sempre-ativo novo (`whatsapp-connector/`, primeiro
serviço em Node.js do projeto — o resto é Python nos serviços e TypeScript no frontend),
deployado na Railway com Volume para a sessão sobreviver a redeploys. Ver
`whatsapp-connector/README.md` para os detalhes de deploy e o raciocínio da isolação.

O desenho garante que migrar para a Cloud API depois troca **só** o serviço `whatsapp-connector`
— schema, RLS e UI do inbox não mudam, porque `atendimento_mensagens` não sabe qual dos dois
gerou a linha (não há coluna "canal" na mensagem, só na conexão).

## Modelo de dados

Prefixo `atendimento_` em tudo. Sem `company_id` obrigatório em lugar nenhum — isolamento é por
papel (`is_soma_staff() or is_atendimento_analista()`), não por empresa.

```
atendimento_departamentos     setor interno que recebe chamado (Fiscal, Financeiro, DP...)
atendimento_conexoes          um número de WhatsApp — status, QR code (base64), tipo
                               (BAILEYS/CLOUD_API), departamento_padrao_id
atendimento_contatos          quem manda mensagem — telefone, nome, company_id opcional
                               (auto-casado por telefone contra company_contatos_setor)
atendimento_tickets           o chamado — protocolo (AAAA-NNNNNN), status
                               (FILA/ABERTO/FECHADO), departamento_id, atendente_id
atendimento_mensagens         linha do tempo do ticket — remetente_tipo
                               (CONTATO/ATENDENTE/SISTEMA/BOT), interno (nota que não
                               vai pro WhatsApp), status de entrega
atendimento_transferencias    auditoria de transferência — comentário OBRIGATÓRIO
atendimento_tags              rotulagem livre do contato
atendimento_contato_tags      n:n contato x tag
atendimento_respostas_rapidas modelo de mensagem por departamento
```

Regra herdada do resto do projeto: sessão do Baileys **nunca** entra no Postgres — só
status/QR code em `atendimento_conexoes`, a credencial fica no disco/Volume do
`whatsapp-connector`.

### Por que nota interna é uma mensagem, não uma tabela separada

`atendimento_mensagens.interno = true` é a nota interna. Ficou na mesma tabela (em vez de uma
`atendimento_notas` separada) pra aparecer na linha do tempo do ticket na ordem cronológica
certa sem precisar fazer merge de duas queries — o mesmo motivo que fez a transferência também
gerar uma linha `remetente_tipo = 'SISTEMA'` na conversa, não só uma linha em
`atendimento_transferencias`.

### Por que o ticket não guarda "canal"

Um contato pertence a uma `conexao_id` (que sabe seu `tipo`). O ticket nasce do contato, então
o canal é sempre alcançável via `contato.conexao.tipo` — duplicar em `atendimento_tickets` ou
`atendimento_mensagens` criaria uma segunda fonte de verdade que poderia divergir se a conexão
mudar de tipo (ex.: migração Baileys → Cloud API).

## Papéis e RLS

Papel novo no enum, em migration própria (valor de enum recém-criado não pode ser usado na
mesma transação — mesmo motivo já documentado em `fase_o_papeis_analistas` e
`fase_aa_papel_financeiro`):

```sql
alter type public.user_role add value 'ANALISTA_ATENDIMENTO';
```

**Igual a Legalização/Extratos, diferente de Financeiro.** Cliente nenhum acessa `/atendimento`
— é o inbox interno da SOMA falando com clientes e leads pelo WhatsApp da própria SOMA, não uma
tela que a empresa cliente usa. Por isso a policy é grosseira, sem isolamento por empresa:
`is_soma_staff() or is_atendimento_analista()` em toda tabela `atendimento_*`.

`atendimento_contatos.company_id` é só contexto (mostra o nome da empresa e linka pro painel
dela) — nunca controla RLS. Um lead sem `company_id` é atendido normalmente.

## Arquitetura

```
Cliente (WhatsApp)
        |
        v
whatsapp-connector (Node.js + Baileys, Railway, sempre-ativo)
        | mensagem recebida: grava direto no Supabase (service role)
        | mensagem enviada: recebida via POST /enviar (X-Internal-Token)
        v
Supabase (Postgres + Auth + Realtime)
        ^
        | Server Components (RLS) + Realtime (postgres_changes)
        v
Next.js /atendimento (Vercel)
```

O connector nunca decide regra de negócio de ticket além do mínimo pra achar/criar o ticket
certo (contato existe? tem ticket FILA/ABERTO aberto? senão cria um novo em FILA com o
`departamento_padrao_id` da conexão) — toda a lógica de fila, transferência e fechamento mora no
Next.js, protegida por RLS. Enviar mensagem é o caminho inverso: o Next.js grava a linha
(status `ENVIANDO`) e chama `POST /enviar` no connector; se falhar, a linha vira `FALHOU` em vez
de desaparecer, pra o atendente ver que não foi.

Realtime do Supabase (`postgres_changes` em `atendimento_tickets` e `atendimento_mensagens`)
mantém o inbox e a conversa atualizados sozinhos, sem polling — primeiro uso de Realtime no
projeto (o resto do sistema é tudo request/response com revalidação de página).

## Telas

```
/atendimento                    inbox — abas Fila / Minhas / Todas, lista + conversa lado a lado
/atendimento/[ticketId]         mesma tela, com a conversa do chamado selecionado
/atendimento/conexoes           lista de conexões + QR code de pareamento + criar conexão nova
```

Fora do MVP, ainda sem tela própria (gerenciável via Supabase Studio por enquanto):
departamentos (já vem semeado com os 11 setores da SOMA), tags, respostas rápidas.

## Fases

| Fase | Escopo | Status |
|---|---|---|
| **F1** Fundação | Papel, RLS, schema completo, conector Baileys, inbox com fila por departamento, transferência com comentário, nota interna, fechar/assumir chamado, Realtime | **Feito** nesta entrega |
| **F2** Produtividade | Telas de departamentos/tags/respostas rápidas (hoje só via Supabase Studio), busca no inbox, filtro por departamento/tag na lista | Próxima |
| **F3** Relatórios | Tempo de espera, tempo de atendimento, volume por departamento, exportação | Próxima |
| **F4** Robô por fluxo | Construtor visual (mensagem, condição, gatilho, tag, webhook) | Depois |
| **F5** Multicanal | Segunda conexão, WhatsApp Cloud API oficial como alternativa ao Baileys | Depois |
| **F6** IA | Resumo de conversa, copiloto de resposta, transcrição de áudio — via API da Anthropic em vez de crédito por uso | Depois |

## Riscos

- **Baileys pode ser banido pelo WhatsApp** se detectar automação (envio em massa, resposta
  instantânea demais, múltiplos dispositivos simultâneos). Mitigação: uso normal (1 sessão, 1
  número, ritmo humano); migração pra Cloud API é o plano B já desenhado (troca só o
  `whatsapp-connector`).
- **Sessão do Baileys perdida em redeploy** sem Volume configurado na Railway — pede novo QR
  Code e perde o histórico de "aparelho conectado" (não perde mensagens já gravadas no Supabase,
  só a sessão ativa). Ver `whatsapp-connector/README.md`.
- **Auto-match de empresa por telefone é heurística** (últimos 8 dígitos, ignora DDI/9º dígito)
  — pode errar com número compartilhado por duas empresas ou portado. Nunca é usado pra
  autorização, só contexto visual pro atendente.
- **Sem chatbot nem relatório na F1** — quem depender disso continua no Digisac até a F3/F4.

## Como migrar do Digisac

Sem API pública documentada de exportação em massa no plano atual — migração é manual:
recriar tags e respostas rápidas mais usadas na F2, e portar o número de WhatsApp para o
Baileys (basta escanear o QR Code com o mesmo aparelho; não há "exportação" de conversa, o
histórico antigo fica consultável no Digisac até o fim do contrato). Rodar os dois em paralelo
por 2–4 semanas com 1–2 atendentes antes de migrar todo mundo.
