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
