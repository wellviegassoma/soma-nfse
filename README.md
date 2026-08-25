# soma-nfse

SaaS multiempresa para a SOMA Contabilidade emitir NFS-e Nacional para seus
clientes. Ver a especificação completa em [`docs/spec.md`](docs/spec.md).

Projeto independente de `alterdata-api`/`alterdata-web`/`portal-cliente`/
`nfse-engine` (repos irmãos, no mesmo diretório pai — outro sistema, não
reaproveitado aqui).

## Estrutura

```
frontend/   Next.js 16 + TypeScript + Tailwind (App Router)
backend/    FastAPI — nfse_engine/ (scaffold; lógica real só na Fase C)
supabase/   migrations + seeds (Postgres + Auth + Storage + RLS)
docs/       especificação do produto
```

## Status

**Fase A — Fundação (concluída)**
- [x] Banco: `organizations`, `companies`, `profiles`, `user_companies` + RLS
      (ver [`supabase/migrations/20260818120000_fase_a_fundacao.sql`](supabase/migrations/20260818120000_fase_a_fundacao.sql))
- [x] Login (Supabase Auth) + "esqueci minha senha" + redefinição
- [x] Multiempresa: seletor de empresa, isolamento por RLS
- [x] Cadastro de empresas + convite de usuário (visão Admin SOMA)

**Fase B — Fiscal (concluída)**
- [x] Dados fiscais da empresa + configuração de ambiente/série da NFS-e
      (ver [`supabase/migrations/20260818130000_fase_b_fiscal.sql`](supabase/migrations/20260818130000_fase_b_fiscal.sql))
- [x] Certificado digital A1 — cifrado com AES-256-GCM (`MASTER_ENCRYPTION_KEY`),
      nunca legível de volta pelo painel
- [x] Catálogo de serviços por empresa (dados fiscais só visíveis à SOMA)
- [x] Cadastro de tomadores (visão cliente)
**Fase C — NFS-e (concluída, exceto validação com certificado real)**
- [x] `backend/`: `dps_builder.py`, `xml_signer.py`, `sefin_nacional_client.py`,
      `certificado.py`, `validadores.py`, `emissor.py` — portados do
      `nfse-engine` legado (repo irmão), lógica fiscal validada contra
      notas reais aceitas, quase sem alteração (ver `backend/README.md`)
      — build+assinatura testados de ponta a ponta, assinatura verificada
      criptograficamente contra a chave pública de um certificado de teste
- [x] Tabelas `dps`/`nfse`/`nfse_events`/`nfse_errors` + numeração atômica
      da DPS (`claim_next_dps_number`, nunca reaproveitada)
- [x] Tela "Emitir Nota" (tomador → serviço → valor → confirmação →
      sucesso/erro) + histórico de notas — testado de ponta a ponta contra
      o Sefin Nacional real (`producao_restrita`): com um certificado de
      teste autoassinado, a chamada mTLS chegou ao servidor do governo e
      voltou `403 Forbidden` (esperado — não é ICP-Brasil real), erro
      registrado em `nfse_errors` com o detalhe técnico completo, e só a
      mensagem amigável foi mostrada ao usuário
- [ ] Validar em `producao_restrita` com um certificado ICP-Brasil real
      antes de confiar em produção

**Fase D — Operação (parcial)**
- [x] `backend/danfse.py` — portado do `nfse-engine` legado, gera o PDF do
      DANFSe a partir do XML da NFS-e. Testado com um XML sintético
      (ainda não temos nenhuma NFS-e real aceita) — PDF válido, layout
      conferido visualmente, todas as seções renderizando corretamente
- [x] Botão "Baixar PDF" na página da nota (além do "Baixar XML" já
      existente)
- [x] Painel SOMA → **Erros**: lista `nfse_errors` entre empresas
- [x] Painel SOMA → **Logs**: tabela `audit_logs` + instrumentação de
      criar/editar empresa, convidar usuário, upload/remoção de
      certificado, criar/editar serviço, emitir nota — testado ao vivo
      (atualizei dados fiscais de verdade e conferi o evento aparecendo
      em `/admin/logs` com usuário, ação e empresa corretos)
- [x] **Cancelamento de NFS-e (evento e101101).** O `nfse-engine` legado
      não tinha essa lógica implementada/validada. Implementado do zero
      nesta fase, com a estrutura confirmada contra o XSD oficial
      (`tiposEventos_v1.01.xsd`/`pedRegEvento_v1.01.xsd`, mesmo namespace
      da DPS) e contra uma implementação de terceiros já em produção
      (nfse-php) — não inventado às cegas, mas também **nunca testado
      contra um cancelamento real aceito pelo Sefin Nacional** (ao
      contrário do resto do motor, que foi validado byte a byte). Ver
      `backend/evento_builder.py` (monta o XML), `emissor.cancelar_nota`
      (assina + envia, reaproveitando `xml_signer.assinar_elemento` — a
      mesma função já validada para a DPS), `sefin_nacional_client.
      enviar_evento` (`POST /nfse/{chaveAcesso}/eventos`, campo
      `pedidoRegistroEventoXmlGZipB64` confirmado no manual oficial), e
      o botão "Cancelar nota" na tela da NFS-e (`empresas/[id]/notas/
      [dpsId]`). Teste com cautela redobrada antes de confiar em nota de
      valor alto.
- [ ] Busca de notas por NSU, relatório de faturamento em PDF, lookups
      auxiliares (`municipios_ibge.py`, `codigos_atividade.py`) — ainda
      no `nfse-engine` legado, não portados

**Fase E — Primeira emissão real + tributação federal (concluída)**
- [x] **Primeira NFS-e real emitida com sucesso em `producao`** (18/08/2026,
      empresa SOMA Contabilidade Integrada, serviço "Contabilidade")
- [x] Corrigido bug de schema Pydantic (`erros` do Sefin vinha como lista de
      dict, campo tipado como `list[str]`) que causava 500 e escondia o erro
      real
- [x] Corrigido `cTribMun`: campo é opcional e varia por município — não é
      cópia do código tributário nacional (causou rejeição real E1235
      "Pattern constraint failed" na primeira tentativa)
- [x] Alíquotas próprias de PIS/COFINS (`aliquota_pis`/`aliquota_cofins` em
      `services`) e retenção na fonte pelo tomador (IN RFB 1.234/2012):
      `retencao_irrf_aliquota` e `retencao_pis_cofins_csll_aliquota`.
      Domínio de `tpRetPisCofins` confirmado direto na Nota Técnica
      SE/CGNFS-e nº 007/2026 (gov.br/nfse): `0` = nada retido (já validado
      em nota real), `3` = PIS/COFINS/CSLL retidos — usado quando
      `retencao_pis_cofins_csll_aliquota` está preenchido.
      ⚠️ Retenção (`vRetIRRF`/`vRetCSLL`) ainda não foi validada contra
      nenhuma nota real aceita — teste com valor pequeno antes de confiar.
- [x] Corrigido bug: "Regime especial de tributação" existia no cadastro do
      SERVIÇO mas nunca era enviado ao Sefin. Campo é do PRESTADOR
      (empresa), movido para `companies.regime_especial_tributacao` (aba
      Dados fiscais), com dropdown do domínio real (0–6) e agora
      efetivamente enviado (`regEspTrib`)
- [x] Corrigido bug: `opcao_simples_nacional` estava sempre fixo em `3`
      (Optante ME/EPP), inconsistente com empresas Lucro Presumido/Real
      usando CST 01-07. Agora derivado de `companies.tax_regime`
- [x] Autocomplete (HTML `datalist`) para "Código tributário nacional" e
      "NBS" no cadastro de serviço, sugerindo códigos já usados em outros
      serviços — não temos a tabela oficial do governo carregada no
      sistema, então cresce organicamente em vez de uma lista fixa

**Fase G — Trava de emissão retroativa + Dashboard SOMA (concluída)**
- [x] `companies.allow_retroactive_emission` (default `false`) — `issueNfse()`
      bloqueia emissão com competência fora do mês corrente, a menos que a
      SOMA habilite a exceção em Dados fiscais. Comparação de mês feita no
      fuso de Brasília (não `Date`/UTC puro, mesma pegadinha já documentada
      em `notas/page.tsx`)
- [x] Aba **Visão geral** (`/admin`, nova aba padrão do painel SOMA):
      filtro de competência (`<input type="month">`, padrão mês corrente),
      cards de empresas cadastradas / notas emitidas / faturamento /
      rejeitadas e canceladas na competência selecionada, Top 5 empresas
      por faturamento e por quantidade de notas, tabela de faturamento por
      empresa, e seletor pra abrir o detalhe (notas e faturamento da
      competência + total histórico) de uma empresa específica

**Fase H — Importar tomadores de XML (concluída)**
- [x] `empresas/[id]/tomadores/importar`: upload de um ou vários XMLs de
      DPS/NFS-e (emitidas pelo soma-nfse ou por qualquer outro sistema —
      o parser só depende do layout nacional público) e extrai o tomador
      (`<toma>`: CPF/CNPJ, nome, e-mail, endereço) por regex sobre o texto
      cru, mesma técnica do motor legado (`lib/xml-tomador.ts`)
- [x] Deduplica contra tomadores já cadastrados (por CPF/CNPJ) e dentro do
      próprio lote — nunca sobrescreve um cadastro existente, só ignora e
      reporta quantos já existiam
- [x] Testado ao vivo (usuário de teste descartável): lote com um XML de
      tomador já cadastrado + um novo — resultado correto (1 importado, 1
      ignorado), tomador novo apareceu na lista

**Fase I — Sincronização diária de notas (saída + entrada) pro fechamento
contábil (concluída)**
- [x] Portado do app desktop original (`C:\nfse_app`, byte a byte, mesmo
      princípio das outras fases): `nfse_client.py` (distribuição por NSU,
      `GET /contribuintes/DFe/{nsu}`), `relatorio.py` (PDF de fechamento
      mensal — saída/entrada × ativas/canceladas) e `codigos_atividade.py`.
      Endpoints novos no backend: `POST /notas/buscar`, `POST
      /relatorios/faturamento`
- [x] **Bug real corrigido, confirmado contra produção**: a API de
      distribuição respondia 403 mesmo com o certificado correto (raiz de
      CNPJ batendo) — o app desktop original sempre envia o parâmetro
      `cnpj_consulta` explícito, mesmo consultando com o certificado da
      própria empresa; nosso port omitia esse campo. Adicionado em
      `BuscarNotasRequest.cnpj_consulta` — confirmado buscando 75 notas
      reais (67 saída + 5 entrada + 3 canceladas) em 19/08/2026
- [x] Tabela `notas_distribuidas` (XML completo + campos extraídos +
      direção saída/entrada, calculada pela raiz do CNPJ) e checkpoint de
      NSU por empresa (`companies.ultimo_nsu_distribuicao`) — nunca
      reescaneia do zero
- [x] `frontend/src/app/api/cron/sync-notas` — Vercel Cron (`vercel.json`,
      1x/dia às 03:00 Brasília), autenticado por `CRON_SECRET` (não usa
      sessão — precisa estar em `PUBLIC_PREFIXES` do middleware). Decripta
      o certificado de cada empresa, chama `/notas/buscar` a partir do
      checkpoint, grava em `notas_distribuidas`, atualiza status da última
      sincronização (`companies.ultima_sincronizacao_*`)
  - **Bug real corrigido**: o índice único usado no `upsert` (dedup por
    `chave_acesso`) era parcial (`where chave_acesso is not null`) — o
    PostgREST não consegue usar índice parcial como alvo de `ON CONFLICT`,
    então todo upsert falhava *silenciosamente* (sem checagem de erro no
    código) e a sincronização reportava sucesso com a tabela vazia.
    Corrigido: índice comum (já lida com múltiplos NULLs sem precisar de
    `where`) + checagem de erro explícita no route.ts
  - Escala atual (poucas empresas) roda tudo sequencial numa function só,
    com teto de lotes por empresa por execução — se crescer muito, trocar
    por fan-out (uma invocação por empresa)
- [x] Aba **Fechamento** por empresa: filtro de competência, contadores
      saída/entrada/canceladas/não-classificadas, listas, botão "Baixar
      relatório PDF" (`fechamento/relatorio/route.ts`, usa as notas já
      sincronizadas — não precisa do certificado de novo)
- [x] Testado ao vivo em produção real (empresa SOMA Contabilidade
      Integrada): sincronização completa, PDF de 8 páginas gerado
      corretamente com dados reais

**Ajustes na Fase I (concluídos)**
- [x] ~~Reprocessa do zero (NSU 0) toda vez~~ — **tentado e revertido**:
      pra uma empresa em NSU ~650, escanear tudo de novo leva ~16min só
      de espera entre chamadas (throttle de 1.5s/chamada no cliente do
      Sefin Nacional), estourando o tempo máximo da function — foi a
      causa real de vários "falha no handshake TLS" que pareciam
      instabilidade do governo, mas eram a nossa própria varredura sendo
      cortada no meio. Solução final: revisita uma **janela recente e
      limitada** (60 NSUs) a partir do checkpoint a cada execução — cobre
      nota fora de ordem recente sem crescer pra sempre. Números
      calibrados pro throttle (ver comentário em `lib/sync-notas.ts`)
- [x] **Fechamento agora é exclusivo da SOMA** (SUPER_ADMIN/ADMIN_SOMA) —
      removido da área do cliente, movido pra dentro do Painel SOMA
      (`/admin/empresas/[id]/fechamento`). RLS de `notas_distribuidas`
      também restringida (`is_soma_staff()`), não só a aba escondida —
      testado com usuário ADMIN_CLIENTE confirmando redirecionamento
- [x] `/admin/fechamento`: índice com todas as empresas, status da última
      sincronização, botão **Buscar todas agora**, e **Baixar tudo
      (ZIP)** — por empresa: XML + PDF (DANFSe) de cada nota da
      competência, mais o relatório mensal consolidado
- [x] Botão **Buscar agora** (sincronização sob demanda, sem esperar o
      Cron) tanto na tela de uma empresa quanto na visão geral (todas de
      uma vez) — reaproveita a mesma lógica do Cron via
      `lib/sync-notas.ts`, que grava o resultado por empresa
      imediatamente (progresso parcial não se perde se der timeout numa
      leva grande)

**Fase J — Fechamento importado + correção da Visão geral (concluída)**
- [x] Aba **Fechamento importado** (`/admin/empresas/[id]/fechamento/importar`):
      upload manual de um ou vários XMLs de NFS-e/DPS já baixados por fora
      (ex.: pela aplicação Python própria do usuário, já que a sincronização
      automática via distribuição por NSU se mostrou instável contra
      `adn.nfse.gov.br` em produção real). Mesma técnica de extração por
      regex do resto do motor (`lib/xml-nota.ts`, mirando
      `nfse_client.py:_extrair_campos_relatorio`), gravando em
      `notas_distribuidas` com `origem = 'importado_manual'` e `nsu = null`
      — entra no mesmo relatório, Fechamento, Visão geral e Tops que a
      sincronização automática já alimenta
- [x] Migration `20260819130000_fase_j_fechamento_importado.sql`: `nsu` virou
      opcional (não existe NSU numa nota importada manualmente) + coluna
      `origem` (`distribuicao` | `importado_manual`)
- [x] Dedup via `insert` + captura do erro `23505` (violação do índice único
      por `chave_acesso`) — reporta como "ignorado" em vez de duplicar;
      testado ao vivo (usuário de teste descartável): lote com uma nota nova
      + uma já existente na base → resultado correto (1 importada, 1
      ignorada), nota nova apareceu no Fechamento (68 notas, faturamento
      atualizado)
- [x] **Bug corrigido**: a Visão geral (`/admin`) só somava a tabela `dps`
      (notas emitidas pelo próprio soma-nfse), nunca `notas_distribuidas`
      (sincronizadas ou importadas do governo) — empresas com notas só
      sincronizadas/importadas apareciam com faturamento e notas emitidas
      zerados, fora dos Tops. Corrigido com `unificarNotasDeSaida()`
      (`admin/page.tsx`), que mescla `dps` + `notas_distribuidas` (direção
      saída) deduplicando por `chave_acesso` — testado ao vivo com os dados
      reais da SOMA Contabilidade Integrada (68 notas, R$ 65.685,79,
      aparecendo corretamente nos Top 5)

## Setup do zero

1. **Criar o projeto no Supabase** (supabase.com) e pegar a connection info em
   Project Settings → API.
2. **Aplicar o schema**:
   ```bash
   npx supabase link --project-ref <seu-project-ref>
   npx supabase db push
   npx supabase db query --linked -f supabase/seeds/seed.sql
   ```
   `db push` aplica as migrations (Fase A + Fase B). O seed cria a
   organization/company da própria SOMA.
3. **Configurar o e-mail de convite/redefinição de senha**: no Supabase
   Studio → Authentication → Email Templates, ajuste os templates "Invite
   user" e "Reset Password" para apontar para
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/redefinir-senha`
   (sem isso, os links de convite/redefinição não funcionam).
4. **Frontend**:
   ```bash
   cd frontend
   cp .env.local.example .env.local   # preencha com as chaves do Supabase
   # gere o MASTER_ENCRYPTION_KEY (necessário para o upload de certificado):
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   npm install
   npm run dev
   ```
5. **Criar o primeiro usuário (SUPER_ADMIN)**: cadastre uma conta pelo
   Supabase Studio (Authentication → Add user) e depois rode, no SQL Editor:
   ```sql
   insert into public.user_companies (user_id, company_id, role)
   values ('<uuid-do-usuario>', '11111111-1111-1111-1111-111111111111', 'SUPER_ADMIN');
   ```
   A partir daí, esse usuário pode cadastrar empresas e convidar os demais
   pela própria interface (`/admin/empresas`).

## Backend (Fase C em diante)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
