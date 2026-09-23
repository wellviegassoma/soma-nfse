# whatsapp-connector

Conector do módulo **Atendimento** do SOMA Gestão com o WhatsApp, via
[Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web
não-oficial). Serviço separado do resto do projeto de propósito: é o único
lugar do repositório em Node.js (o resto é Python nos serviços e
TypeScript no frontend) e o único que precisa ficar **sempre ativo** com um
socket aberto — o que não roda em Serverless Function da Vercel. Deploy
sugerido: Railway, mesmo lugar de `integra-contador` e
`nota-carioca-service`, com um
[Volume](https://docs.railway.com/reference/volumes) montado em
`BAILEYS_AUTH_DIR` para a sessão sobreviver a redeploys.

Decisão registrada em `docs/atendimento.md`: começamos com Baileys
(não-oficial, sem custo, usa o número como já está hoje) em vez da
WhatsApp Cloud API oficial, cientes do trade-off — risco real de o
WhatsApp banir o número se detectar automação, e depende de um processo
sempre-ativo em vez de só um webhook serverless. Migrar para a Cloud API
depois troca só este serviço; o resto do módulo (schema, RLS, UI do
inbox) não muda, porque `atendimento_mensagens` não sabe qual dos dois
gerou a linha.

Um processo = uma conexão = um número de WhatsApp. Duas conexões
(`atendimento_conexoes`) exigem dois processos deste serviço, cada um com
seu próprio `ATENDIMENTO_CONEXAO_ID` e `BAILEYS_AUTH_DIR`.

## Rodando localmente

```bash
npm install
cp .env.example .env
# preencher SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# WHATSAPP_CONNECTOR_INTERNAL_TOKEN e ATENDIMENTO_CONEXAO_ID (criar a linha
# em atendimento_conexoes antes, pelo Supabase Studio ou pela tela
# /atendimento/conexoes)
npm start
```

Na primeira vez, o QR Code aparece em base64 na coluna `qr_code` da linha
de `atendimento_conexoes` — o frontend renderiza direto (ver
`app/atendimento/conexoes`). Escaneie pelo WhatsApp do celular (Aparelhos
conectados). Da segunda vez em diante, a sessão salva em
`BAILEYS_AUTH_DIR` reconecta sozinha, sem novo QR.

## Endpoints

- `GET /health` — sem autenticação, só liveness.
- `POST /enviar` — protegido por `X-Internal-Token`. Body
  `{ "telefone": "5524999999999", "corpo": "texto" }`, resposta
  `{ "whatsapp_message_id": "..." }`.

## O que este serviço nunca faz

- Não decide roteamento por departamento nem regra de negócio de ticket
  além do mínimo pra achar/criar o ticket certo — essa lógica mora no
  frontend (Next.js + RLS). Este serviço só traduz evento do WhatsApp em
  linha no Postgres, e vice-versa.
- Não guarda a sessão do Baileys em lugar nenhum do Supabase/Postgres — só
  no disco/Volume deste processo (`BAILEYS_AUTH_DIR`).
- Não lê nem escreve dado financeiro/fiscal — a única tabela fora do
  próprio módulo que toca é `company_contatos_setor`, e só leitura, pro
  auto-match de empresa por telefone.
