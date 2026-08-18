# SOMA NFS-e — Especificação (Fase A em diante)

Projeto novo, independente de `alterdata-api`/`alterdata-web`/`portal-cliente`/`nfse-engine`
(esses são um sistema legado/separado — não reutilizar código nem banco).

## Produto

SaaS multiempresa para a SOMA (escritório de contabilidade) emitir NFS-e Nacional para seus
clientes (inicialmente clínicas/consultórios médicos) e, no futuro, evoluir para ferramenta de
gestão para essas clínicas. Uso em desktop, tablet e celular (recepção de clínica usa tablet).
Fluxo de emissão precisa ser **rápido**, não só bonito.

## Perfis de usuário

| Perfil | Poderes |
|---|---|
| Super Admin | Tudo no sistema |
| Administrador SOMA | Cadastra empresas e configura tributação |
| Administrador Cliente | Gerencia usuários da própria empresa |
| Emissor | Emite e consulta notas |

Usuário sempre vinculado a uma ou mais empresas (`user_companies`). Isolamento total entre
empresas — RLS no Postgres, não confiar em checagem só no front.

## Modelo de dados (visão completa do produto)

```
organizations   — tenant (ex: SOMA, Clínica ABC)
companies       — uma organization pode ter mais de um CNPJ
users           — nunca grava senha em claro (Supabase Auth cuida disso)
user_companies  — user_id, company_id, role
customers       — tomadores da nota (pessoa física/jurídica)
services        — catálogo de serviços, configurado pela SOMA (dados fiscais escondidos do cliente)
certificates    — certificado A1 criptografado (nunca senha em texto puro)
dps             — Documento antes de virar NFS-e (status: DRAFT..REJECTED)
nfse            — nota emitida (access_key, nfse_number, xml, danfse_url)
nfse_events     — cancelamento, substituição etc.
nfse_errors     — histórico de erros técnicos (nunca exposto ao cliente)
audit_logs      — quem fez o quê, quando
```

Regra de ouro: XML/PDF não ficam no Postgres — só o caminho no Supabase Storage.

## Fluxo do cliente (portal)

1. Login simples (e-mail/senha, "esqueci minha senha")
2. Dashboard: faturamento do mês, notas emitidas/canceladas, últimas notas, botão grande
   **+ EMITIR NOTA**
3. Emitir Nota: tomador (autocomplete por nome/CPF/CNPJ + "+ novo tomador" com cadastro mínimo),
   serviço (dropdown só com nome exibido — sem nenhum dado fiscal cru), valor, data, descrição
4. Confirmação antes de emitir (tela resumo, CANCELAR/EMITIR)
5. Sucesso: NFS-e nº, valor, tomador + ações (visualizar, baixar PDF/XML, enviar e-mail, emitir outra)
6. Erro: nunca mostra código técnico (`E0714`, digest mismatch etc.) — mensagem amigável +
   protocolo de suporte
7. Histórico de notas com filtros (período, tomador, serviço, status, valor)
8. Página da nota individual → cancelamento com motivo obrigatório

## Painel SOMA (admin)

Dashboard (empresas ativas, notas hoje, valor emitido hoje, erros hoje, certificados vencendo)
+ menu: Empresas, Usuários, Notas, Erros, Certificados, Logs, Configurações.

Cadastro de empresa: dados gerais, dados fiscais (regime tributário, CNAE, inscrição municipal),
config NFS-e (ambiente homologação/produção — trava também no backend, não só na tela), série/
próximo número DPS, certificado digital.

Cadastro de serviços por empresa: SOMA configura os dados fiscais completos (NBS, cTribNac,
cTribMun, ISS, IBS/CBS); o cliente só vê o nome do serviço.

## Stack técnica (decidida)

- **Front-end**: Next.js (TypeScript, Tailwind), Vercel em desenvolvimento/piloto
- **Dados/Auth/Storage**: Supabase (Postgres + Auth + Storage + RLS)
- **Backend NFS-e**: Python + FastAPI no Railway — `nfse_engine/` com
  `builder.py`, `validator.py`, `signer.py`, `client.py`, `parser.py`, `errors.py`
  (funções: `build_dps()`, `validate_xml()`, `sign_xml()`, `send_dps()`, `parse_response()`,
  `cancel_nfse()`), independente da interface — fachada tipo
  `NFSeService(company).issue(customer=..., service=..., amount=...)`.
- Certificado: nunca salvo em claro. `encrypted_file` + `encrypted_password` +
  `MASTER_ENCRYPTION_KEY` (variável secreta no Railway), descriptografado só em memória no
  momento da assinatura, depois descartado.

## Roadmap

- **Fase A — Fundação**: Banco PostgreSQL → Usuários → Login → Multiempresa → Empresas
- **Fase B — Fiscal**: Cadastro fiscal → Certificado → Serviços → Tomadores
- **Fase C — NFS-e**: DPS → XML → XSD → Assinatura → API Sefin → Resposta
- **Fase D — Operação**: Histórico → PDF/XML → Cancelamento → Erros → Logs
- **Fase E — Piloto**: SOMA → empresa teste → 5 clientes → 20 clientes → escala

## Decisões de UX confirmadas com o cliente (Wellington)

- Vai ter uso em celular e tablet além de desktop — responsivo desde o início.
- "Emitir Nota" tem que ser rápido, não só bonito nem só funcional — priorizar sensação de
  instantâneo (estados de loading, otimismo de UI) tanto quanto o visual.
