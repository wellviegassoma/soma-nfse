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
- [ ] Fase C: DPS, XML, XSD, assinatura, API Sefin, resposta

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
