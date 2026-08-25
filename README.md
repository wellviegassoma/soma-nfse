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

**Fase K — Importação em lote (XML de todas as empresas + cadastro de
empresas via CNPJ/planilha) (concluída)**
- [x] `/admin/fechamento/importar`: mesma ideia do Fechamento importado da
      Fase J, mas sem escolher empresa antes — identifica a empresa de cada
      nota pelo CNPJ do prestador ou do tomador contra o cadastro
      (`companies.cnpj`) e distribui automaticamente; se os dois lados do
      documento forem empresas nossas (uma faturou a outra), grava dos dois
      lados (saída numa, entrada na outra). Nota cujo CNPJ não bate com
      nenhuma empresa cadastrada aparece como erro em vez de ser
      descartada silenciosamente. Reaproveita o mesmo extrator
      (`xml-nota.ts`) e o mesmo helper de gravação/dedup da Fase J,
      extraído para `salvarNotaImportada()` em `lib/actions/fechamento.ts`
- [x] Busca automática de dados de CNPJ (Receita Federal, via BrasilAPI) no
      cadastro de empresa (`/admin/empresas/novo`): botão "Buscar dados"
      preenche razão social, nome fantasia, CNAE e código IBGE do
      município a partir do CNPJ digitado — campos continuam editáveis
      manualmente depois
  - **Bug real corrigido**: BrasilAPI retorna 403 pro User-Agent padrão
    (`"node"`) que o `fetch` nativo do Node manda quando nenhum header é
    passado — confirmado comparando `curl` com/sem `-A`. Corrigido
    passando um `User-Agent` explícito (`lib/cnpj-lookup.ts`)
- [x] `/admin/empresas/importar`: upload de planilha (.xlsx/.xls/.csv, via
      `xlsx`/SheetJS) com coluna de nome e de CNPJ — para cada linha, busca
      os dados completos na Receita Federal (mesmo helper acima, com
      throttle de 350ms entre chamadas) e cria a empresa já preenchida;
      linha com CNPJ já cadastrado é ignorada (dedup), e linha cujo CNPJ
      não é encontrado na Receita ainda assim é importada, só que sem
      enriquecimento (usa o nome da própria planilha)
- [x] Testado ao vivo (usuário de teste descartável): busca de CNPJ real
      (Nubank) preenchendo o formulário de nova empresa corretamente;
      planilha com 3 linhas (1 nova com CNPJ real, 1 já cadastrada, 1 com
      CNPJ inválido na Receita) → resultado correto (2 importadas, 1
      ignorada); XML de nota nova sem empresa pré-selecionada → identificada
      e importada na empresa certa pelo CNPJ do prestador

**Fase M — Ajustes de cadastro e correção do "Buscar agora" (concluída)**
- [x] Nome da empresa (razão social/nome fantasia) editável depois de criada
      — antes só dava pra definir na criação; novo formulário no topo de
      Dados fiscais (`updateCompanyIdentity`)
- [x] Busca + ordenação alfabética em `/admin/empresas` — filtro por nome
      ou CNPJ (`.or()` do PostgREST, com sanitização de vírgula/parênteses
      que quebrariam a sintaxe do filtro), lista ordenada por `legal_name`
      em vez de `created_at`
- [x] **ISS retido pelo tomador** (`tpRetISSQN`) no cadastro de serviço —
      o backend (`dps_builder.py`/`schemas.py`) já aceitava o campo desde a
      Fase C, mas o cadastro nunca expôs a opção, então toda nota emitida
      até aqui saiu com `tpRetISSQN=1` (não retido) mesmo quando o tomador
      de fato retém. Novo campo `services.tipo_retencao_issqn` (domínio
      1/2/3, migration `20260825140000_fase_l_iss_retido.sql`), select no
      formulário de serviço, e `lib/actions/notas.ts` passando o valor pro
      motor de emissão
- [x] **Bug real corrigido**: "Buscar agora" (sincronização sob demanda)
      ignorava por completo a competência selecionada na tela — sempre
      pedia notas do mês corrente pro backend (`ano`/`mes` fixos em
      `new Date()`), então escolher um mês passado e clicar "buscar" nunca
      trazia nada, mesmo relatando sucesso. Corrigido em duas partes
      (`lib/sync-notas.ts`): (1) `ano`/`mes` agora vêm da competência
      selecionada, não mais do relógio; (2) pra competência **passada**,
      a janela recente de NSU (croqui pensado só pra pegar nota nova desde
      o checkpoint) não serve — nota antiga já está bem antes dele —, então
      nesse caso o scan reinicia do NSU 0 com um teto de lotes maior
      (`MAX_LOTES_BUSCA_HISTORICA`), e o checkpoint nunca regride (sempre
      `Math.max` contra o valor atual). Testado ao vivo: URL de consulta
      passou a mostrar `/DFe/0?...` (NSU 0) ao buscar competência passada,
      contra o comportamento antigo que sempre usava a janela do checkpoint
      independente do mês escolhido

**Fase N — Cálculo de imposto (Simples Nacional + Lucro Presumido) (concluída)**
- [x] Nova aba **Impostos** por empresa (`/admin/empresas/[id]/impostos`) —
      estimativa de DAS (Simples) ou guia de IRPJ/CSLL/PIS/COFINS/ISS
      (Lucro Presumido) com base no faturamento já registrado no sistema
      (mesma fonte unificada `dps` + `notas_distribuidas` da Visão geral),
      não substitui a apuração oficial (PGDAS-D/ECF)
- [x] Lógica conferida célula a célula contra as duas planilhas manuais
      reais da SOMA (`047-LP.xlsx` Lucro Presumido, `064-SN.xlsx` Simples
      Nacional) — script Node comparando meus cálculos contra os valores
      já calculados nas planilhas, bateram exatos (RBT12, alíquota
      efetiva, faixa, partilha do DAS, IRPJ/CSLL trimestral)
  - Simples Nacional: tabela oficial dos Anexos III e V (LC 123/2006 +
    reforma 2018) embutida em `lib/simples-nacional-tabela.ts`; RBT12
    calculado a partir do faturamento dos 12 meses anteriores à
    competência; alíquota efetiva = (RBT12×alíquota − parcela a
    deduzir)/RBT12; ISS com piso de 2% e teto de 5%, como na planilha
  - Lucro Presumido: IRPJ 15% sobre presunção de 32% (+ adicional de 10%
    sobre o que exceder R$60mil/trimestre) e CSLL 9% sobre presunção de
    32%, apurados por trimestre (guia só sai no 3º mês, com opção de
    antecipar mensalmente); PIS 0,65% e COFINS 3% sempre mensais
- [x] **Fator R** (decide Anexo III x V) e **RBT12** informados
    manualmente por empresa em Dados fiscais — o sistema não tem
    controle de folha de pagamento (Fator R real depende disso) nem
    histórico de faturamento anterior à entrada da empresa no sistema
    (RBT12 ficaria artificialmente baixo só com o que está aqui). Mesmo
    raciocínio de "informar manualmente o que o sistema não rastreia" já
    usado no resto do projeto
- [x] Testado ao vivo: Simples Nacional com RBT12 manual (R$780mil,
      Anexo III faixa 4) — todos os componentes do DAS conferidos contra
      o cálculo esperado; Lucro Presumido no meio do trimestre (IRPJ/CSLL
      zerados, com aviso da base acumulada) e no fechamento do trimestre
      (IRPJ/CSLL calculados sobre a base trimestral mesmo em mês sem
      faturamento próprio)

**Ajuste na Fase N — Alíquota e imposto do mês na Visão geral (concluído)**
- [x] Tabela "Faturamento por empresa" da Visão geral ganhou duas colunas:
      alíquota efetiva e imposto estimado do mês, calculados pra cada
      empresa da lista de uma vez (reaproveita `calcularImpostoResumo` e
      `resolverRbt12`, extraído de `lib/faturamento.ts` pra não duplicar a
      lógica que já existia só na aba Impostos de uma empresa). Empresa
      sem regime tributário configurado (ou Lucro Real) mostra "—" nas
      duas colunas em vez de quebrar
- [x] Testado ao vivo: única empresa com regime configurado mostrou
      alíquota e imposto corretos: as outras 52 (sem `tax_regime`) mostraram
      "—" corretamente

**Bug real corrigido — RBT12 manual ficava desatualizado silenciosamente**
- [x] O RBT12 manual (campo único, sem saber a que mês se referia) era
      reaplicado igual em qualquer competência depois de configurado —
      confirmado com dados reais da própria SOMA Contabilidade Integrada
      (planilha `025-SN.xlsx`): alíquota de agosto/2026 saiu igual à de
      julho/2026 porque o valor manual tinha sido informado com base em
      julho e nunca atualizado
- [x] Nova coluna `companies.rbt12_manual_competencia` — o valor manual só
      é usado quando essa competência bate exatamente com a que está
      sendo calculada; fora disso o sistema avisa que está desatualizado
      (`Alert` vermelho) e cai pro cálculo estimado a partir do sistema,
      em vez de reaplicar o número errado silenciosamente
- [x] Testado ao vivo com o valor real da SOMA (R$801.559,88, marcado
      como referente a 07/2026): competência de julho usa o valor manual
      corretamente (11,55%, batendo com a planilha); competência de
      agosto mostra o aviso de desatualizado e usa o RBT12 estimado pelo
      sistema em vez do valor de julho

**Ajuste — Top 5 de imposto e alíquota na Visão geral (concluído)**
- [x] Dois novos cards ao lado dos Top 5 já existentes (faturamento e
      notas emitidas): **Top 5 — maior imposto do mês** e **Top 5 — maior
      alíquota**, usando o mesmo `imposto` já calculado por empresa pra
      preencher as colunas da tabela de faturamento
- [x] Testado ao vivo — SOMA Contabilidade Integrada aparece corretamente
      nos dois (R$ 7.628,35 / 11,7% em 08/2026, já com o RBT12 real
      atualizado)

**Ajuste — RBT12 manual rolando automaticamente (concluído)**
- [x] Antes, o RBT12 manual só valia pra competência exata em que foi
      informado — no mês seguinte, precisava reinformar na mão (avisava
      que estava desatualizado, mas não fazia nada sozinho). Corrigido a
      pedido do usuário: a partir da competência de referência, o valor
      manual perde 1/12 do peso por mês enquanto o faturamento real do
      sistema (esse sim, exato, mês a mês) vai entrando no lugar —
      depois de 12 meses o manual já não pesa nada e o sistema calcula
      inteiramente sozinho, sem precisar preencher de novo
- [x] Testado ao vivo com dados reais da SOMA Contabilidade Integrada:
      competência igual à referência (08/2026) usa o valor manual exato
      (bateu com a planilha real: R$7.628,35); competência seguinte
      (09/2026, ainda sem sincronizar) combinou automaticamente 11/12 do
      valor de referência com o faturamento real de agosto já no sistema
      — contas conferidas na mão, bateram exatas

**Bug real corrigido — falha de mTLS na busca de notas era TLS 1.3, não o certificado**
- [x] "Falha no handshake TLS com certificado do cliente (mTLS)" contra
      `adn.nfse.gov.br` — o usuário relatou que uma extensão de navegador
      com o **mesmo certificado** conseguia conectar normalmente,
      confirmando que o certificado em si estava correto. Reproduzindo a
      chamada isoladamente (fora da aplicação) com um `ssl.SSLContext`
      puro: TLS 1.3 falha 100% das vezes com `SSLError:
      RECORD_LAYER_FAILURE` logo na abertura da conexão; forçando o teto
      em TLS 1.2, a mesma chamada funciona 100% das vezes — mesmo
      certificado, mesma rede, mesma hora
- [x] Novo `criar_sessao_mtls()` em `backend/certificado.py` — monta a
      sessão `requests` com um `HTTPAdapter` customizado que trava o
      `ssl.SSLContext.maximum_version` em TLS 1.2, usado tanto por
      `nfse_client.py` (busca/distribuição) quanto por
      `sefin_nacional_client.py` (emissão/cancelamento) — os dois clientes
      que falam mTLS com o governo
- [x] Testado ao vivo, de ponta a ponta pela aplicação real (não só o
      script de diagnóstico): empresa que vinha falhando 100% das vezes
      sincronizou com sucesso — 22 notas reais recuperadas
      (R$ 96.250,43 em saídas)

**Ajuste — Lucro Presumido: IRPJ/CSLL sempre por mês, adicional em linha própria**
- [x] IRPJ e CSLL na aba Impostos agora sempre mostram a estimativa do
      **mês** selecionado (base do próprio mês × alíquota) — antes, fora
      do último mês do trimestre mostrava R$0,00 (esperando o
      fechamento), e no último mês mostrava a base do trimestre inteiro
      lumpada (podendo parecer "alto demais" pra quem está olhando só
      aquele mês)
- [x] O adicional de 10% (quando a base do trimestre passa de R$60mil)
      continua sendo assentado só no fechamento do trimestre — mas agora
      aparece em **linha própria** ("Adicional de IRPJ") em vez de
      embutido dentro do valor de IRPJ, deixando claro quanto é base e
      quanto é adicional
- [x] Testado ao vivo: mês que é o fechamento do trimestre mostra IRPJ
      (15% sobre a base do mês) e Adicional de IRPJ (10% sobre o
      excedente trimestral) como linhas separadas, batendo exato com o
      cálculo manual

**Ajuste — Coluna de regime tributário na Visão geral (concluído)**
- [x] Nova coluna "Regime" na tabela "Faturamento por empresa" — sigla
      curta (SN = Simples Nacional, LP = Lucro Presumido, LR = Lucro
      Real, "—" = sem regime definido), direto do `tax_regime` já
      cadastrado, sem precisar entrar em cada empresa pra saber

**Ajuste — Buscar últimos 12 meses (histórico) (concluído)**
- [x] Novo botão "Buscar últimos 12 meses", tanto na tela global
      `/admin/fechamento` (todas as empresas com certificado) quanto
      dentro do Fechamento de cada empresa (só aquela empresa) — escaneia
      o histórico completo desde o NSU 0, com uma janela de 12 meses
      (mês corrente + 11 anteriores) em vez de um mês só, sem precisar
      trocar de competência manualmente 12 vezes
- [x] `meses_anteriores` novo parâmetro em `BuscarNotasRequest`
      (`backend/schemas.py`) e em `buscar_notas_do_mes()`
      (`backend/nfse_client.py`) — troca o filtro de mês exato por uma
      faixa de índices (ano×12+mês) entre `competência - N` e
      `competência`; `N=0` mantém o comportamento antigo (mês exato)
- [x] `syncOneCompany`/`syncAllCompanies` (`sync-notas.ts`) ganharam um
      parâmetro opcional `mesesAnteriores` — quando setado, força
      `nsuInicial=0` e o teto de lotes da busca histórica
      (`MAX_LOTES_BUSCA_HISTORICA`), igual já acontecia pra competência
      passada avulsa
- [x] Verificado antes de implementar: só 3 das 206 empresas têm
      certificado cadastrado, então "buscar todas" pula as outras 203
      quase instantaneamente — não tem risco de estourar o tempo da
      function por causa de empresa sem certificado
- [x] Testado ao vivo com dados reais: individual (ADELFOS MEDICAL)
      trouxe 22 notas em ~11s; "buscar todas" processou as 3 empresas com
      certificado em ~40s (97 notas no total), dentro do limite de 300s
      da function

**Ajuste — Fator R com controle mensal de verdade (concluído)**
- [x] Antes, o Fator R (folha ÷ RBT12, decide Anexo III x V no Simples
      Nacional) era um percentual fixo informado uma única vez por
      empresa em Dados fiscais — não acompanhava a janela móvel de 12
      meses como o RBT12 já fazia. A pedido do usuário, passou a seguir a
      mesma lógica: folha de pagamento informada mês a mês (não tem fonte
      automática no sistema, diferente da receita, que vem das notas), e
      o Fator R de cada competência é calculado sozinho a partir da soma
      dos 12 meses de folha informados ÷ RBT12 da mesma janela
- [x] Nova tabela `folha_mensal` (empresa + competência + valor,
      `supabase/migrations/20260826100000_fase_n_folha_mensal_fator_r.sql`),
      RLS exclusiva da equipe SOMA — mesmo padrão de `notas_distribuidas`
- [x] `resolverFp12()`/`resolverFatorR()` (`lib/folha.ts`) — janela de 12
      meses idêntica ao RBT12 (`competenciasRbt12`), soma os meses de
      folha informados e projeta proporcionalmente se o histórico ainda
      for incompleto; sem decaimento de valor manual como o RBT12 tem,
      porque aqui não existe "dado automático" pra fazer a transição — é
      sempre o que foi preenchido na mão
- [x] Novo campo "Folha de pagamento do mês" direto na aba Impostos da
      empresa (mostra FP12 acumulado, Fator R calculado e quantos meses
      já foram informados) — o percentual fixo antigo (`fator_r_percentual`
      em Dados fiscais) foi removido da tela, ficou obsoleto
- [x] Visão geral (Top 5 de imposto/alíquota e a tabela por empresa)
      passou a usar esse mesmo cálculo dinâmico por empresa, em vez do
      percentual fixo
- [x] Testado ao vivo: empresa sem folha nenhuma informada cai no Anexo
      V por padrão (regra oficial na ausência de Fator R); preenchendo a
      folha de um mês do histórico (R$25.000, projetado x12 = R$300mil),
      Fator R foi a 36,17% e o Anexo virou III — alíquota efetiva caiu de
      18,44% pra 11,7% e o DAS de R$12.018,99 pra R$7.628,35, batendo
      exato com o valor da planilha manual real já validado antes

**Ajuste — Aba própria de Fator R + importar do PGDAS-D e da folha (concluído)**
- [x] O preenchimento mensal de folha (feature anterior) morava dentro da
      aba Impostos, um mês de cada vez — a pedido do usuário, virou uma
      aba própria (`/admin/empresas/[id]/fator-r`) com todos os meses
      numa tabela só (folha, FP12, RBT12, Fator R, Anexo lado a lado),
      mais fácil de enxergar a evolução e de corrigir mês passado
- [x] **Importar do PGDAS-D**: sobe o PDF da declaração
      (PGDASD-DECLARACAO.pdf, gerado pelo programa da Receita Federal) e
      o sistema lê a seção "2.3) Folha de Salários Anteriores" — até 12
      meses de folha de uma vez, exatamente os valores que a Receita já
      usa oficialmente no Fator R — mais o RBT12 da competência
      declarada, com opção de já atualizar o RBT12 manual (Dados
      fiscais) com esse valor. Fica numa tabela pra revisar/editar antes
      de confirmar, nunca salva direto
- [x] **Importar folha de pagamento**: sobe o PDF da folha analítica (do
      sistema de folha da SOMA) e tenta achar o "Total Geral da Folha" do
      mês — layout desse relatório não é padronizado como o do governo
      (o extrator de texto do PDF não preserva a ordem visual da tabela
      de totais), então só aceita o valor se reconhecer exatamente 22
      números na posição esperada; se não bater, pede preenchimento
      manual em vez de arriscar um número errado. Sempre mostra a
      competência e o valor pra confirmar/editar antes de salvar
- [x] `pdf-parse` (novo, `frontend/src/lib/pdf-import/`) faz a extração de
      texto do PDF no servidor — precisou marcar como
      `serverExternalPackages` no `next.config.ts` porque o worker do
      pdf.js (arquivo `.mjs` carregado em tempo de execução) não
      sobrevive ao empacotamento do Turbopack; como pacote externo, roda
      via `require` normal do Node direto de `node_modules`
- [x] `fator_r_percentual` (campo antigo, Dados fiscais) já tinha saído
      de uso na feature anterior — a coluna do banco continua existindo,
      só não é mais lida em lugar nenhum
- [x] Testado ao vivo, ponta a ponta com os arquivos reais de um cliente
      (PGDAS-D e folha analítica de julho/2026): os 12 meses de folha do
      PGDAS-D bateram exatos com o PDF (conferido campo a campo), e o
      Fator R recalculado (261.852,14 ÷ 848.848,74 = 30,85%) bateu exato
      com a divisão manual; a folha analítica reconheceu o total certo
      (R$14.152,61) e a competência (07/2026) direto do PDF

**Bugs reais corrigidos — leitura de PDF quebrava só em produção (concluído)**
- [x] Funcionava local, dava "server error" genérico assim que ia pro ar
      na Vercel — dois problemas distintos, mesma causa raiz: o
      rastreador de arquivos do build (baseado em análise estática) não
      segue `require()`/`import()` cujo caminho só é montado em tempo de
      execução, então dois arquivos que o `pdf-parse` precisa em runtime
      somem do deploy sem avisar
- [x] 1º: o worker do pdf.js (`pdf.worker.mjs`) — corrigido antes de
      qualquer teste em produção funcionar
- [x] 2º (só apareceu depois, já em produção — `ReferenceError: DOMMatrix
      is not defined`): pdf.js precisa de um polyfill de `DOMMatrix` /
      `ImageData` / `Path2D` mesmo só pra extrair texto, carregado via
      `@napi-rs/canvas` — o binário nativo (`@napi-rs/canvas-linux-x64-gnu`
      no runtime da Vercel) é escolhido com `require()` condicional em
      `process.platform`/`process.arch`, mesmo padrão do problema do
      worker
- [x] Os dois resolvidos com `outputFileTracingIncludes` no
      `next.config.ts`, forçando a inclusão explícita dos arquivos que o
      rastreador não enxerga sozinho
- [x] O 2º bug não deu pra reproduzir localmente pra testar antes de
      subir — máquina de desenvolvimento é Windows, o binário problemático
      só existe na build Linux da Vercel. Validado o que dava (build de
      produção local sem regressão, mecanismo de inclusão confirmado via
      `.nft.json`) e a confirmação final veio do log de runtime real que
      o usuário colou do painel da Vercel

**Ajuste — FGTS como campo próprio na importação da folha (concluído)**
- [x] A importação da folha de pagamento (folha analítica) só trazia o
      "Total Geral da Folha" — o usuário pediu pra trazer também o FGTS
      do mês (seção "Informações adicionais" do relatório) num campo
      separado, sem misturar com a folha
- [x] Nova coluna `fgts` em `folha_mensal` (nullable, não entra na conta
      do Fator R — é só informativo por competência); extraído pela mesma
      decodificação posicional já usada pro total da folha (posição 16
      dos 22 números, contra a posição 20 do Total Geral da Folha)
- [x] Tela de revisão da importação e a tabela principal do Fator R agora
      mostram os dois campos (Folha e FGTS) lado a lado, cada um editável
      e salvo independente — editar só a folha na tabela mensal não
      apaga o FGTS já salvo daquele mês (e vice-versa)
- [x] Testado ao vivo com o arquivo real: FGTS extraído (R$652,20) bateu
      exato com o "Total FGTS" do PDF, e persistiu certo na tabela

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
