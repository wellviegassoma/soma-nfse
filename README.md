# SOMA Gestão

SaaS multiempresa da SOMA Contabilidade pra gestão dos clientes — emissão de
NFS-e Nacional, controle de legalização (Alvará, Vigilância Sanitária, CNES,
Certidão), controle de extratos bancários, e mais módulos a caminho. Nome do
produto mudou de "SOMA NFS-e" pra "SOMA Gestão" (era só emissão de nota, virou
plataforma maior); o slug do repositório e da infraestrutura (`soma-nfse`,
domínio, projeto na Vercel) ficou como estava — não vale trocar isso só por
causa do rebrand visual. Ver a especificação completa em
[`docs/spec.md`](docs/spec.md).

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

**Correção — FGTS entra sim na conta do Fator R (concluído)**
- [x] Ajuste acima saiu inicialmente como campo só informativo — usuário
      corrigiu: FGTS deve somar na conta mesmo, que é a definição oficial
      de "folha de salários, incluídos encargos" (LC 123/2006). FP12
      agora soma folha + FGTS de cada mês (`admin/page.tsx`,
      `impostos/page.tsx` e `fator-r/page.tsx`); o campo de folha que
      aparece pra editar continua mostrando só o valor bruto — a soma com
      o FGTS acontece só na hora de calcular o Fator R
- [x] Testado com dado real já importado pelo usuário (WOGEL MEDICINA
      FUNCIONAL, competência 07/2026 com FGTS de R$652,20): folha+FGTS
      acumulados de agosto/2026 bateu exato (R$271.186,09) com a soma
      manual dos 12 meses incluindo esse FGTS

**Ajuste — Pró-labore separado de salários, cada um na competência certa (concluído)**
- [x] "Folha" na importação da folha analítica estava lumpada (salário +
      pró-labore juntos) e tudo lançado na mesma competência — o usuário
      corrigiu o conceito: pró-labore entra no mês da própria folha
      (regime de competência), mas salários e FGTS só são efetivamente
      pagos/recolhidos no mês seguinte (salário sai por volta do dia 5,
      FGTS até dia 20 via FGTS Digital) — regime de caixa pros dois. Uma
      importação agora grava em duas competências diferentes
- [x] Nova coluna `pro_labore` em `folha_mensal`; `valor` passa a
      significar "salários" nesse fluxo (continua sendo "total já
      oficial" no fluxo do PGDAS-D, que não precisa separar — o número
      de lá já vem correto por competência)
- [x] `parseFolhaAnalitica` agora extrai pró-labore separado (soma das
      ocorrências de "PRO LABORE"/"PRÓ-LABORE" na lista de funcionários,
      testado com arquivo real: R$6.000,00, batendo exato) e calcula
      salários por subtração (Total Geral da Folha − pró-labore =
      R$8.152,61, também exato)
- [x] Tela de revisão mostra os três campos com a competência de cada um
      já indicada no rótulo ("Pró-labore — 07/2026", "Salários —
      08/2026", "FGTS — 08/2026"); ao salvar, grava em duas linhas de
      `folha_mensal` sem apagar o que já existia em cada uma (busca a
      linha atual antes de upsertar, só sobrescrevendo o campo da vez)
- [x] Corrigido também o dado real já importado antes dessa mudança
      (WOGEL MEDICINA FUNCIONAL, competência 07/2026) pra refletir o
      modelo novo — antes lumpado numa competência só, agora
      pró-labore em 07/2026 e salários+FGTS em 08/2026
- [x] Testado ao vivo, ponta a ponta: os dois valores extraídos bateram
      exatos e as duas linhas foram gravadas corretas, cada uma na sua
      competência, sem sobrescrever a outra

**Bug real corrigido — sincronização perdia uma nota a cada ~50 documentos, silenciosamente (concluído)**
- [x] Usuário reportou uma nota real da WOGEL MEDICINA FUNCIONAL que não
      veio na sincronização — nem depois de mandar buscar de novo pra
      competência dela. Como afeta a base de cálculo do Fator R e do
      faturamento, o risco era sério: podia estar acontecendo com
      qualquer empresa, silenciosamente, sem nenhum erro aparecer
- [x] Causa raiz encontrada consultando o Sefin Nacional diretamente
      (certificado real, descriptografado só pra esse diagnóstico
      pontual e apagado logo em seguida): `GET /contribuintes/DFe/{nsu}`
      devolve documentos com NSU **estritamente maior** que o pedido
      (exclusivo), não maior-ou-igual — confirmado comparando o mesmo
      lote pedido a partir de posições vizinhas. `buscar_notas_do_mes`
      (`backend/nfse_client.py`) somava +1 por cima do maior NSU já visto
      antes de pedir o próximo lote — um +1 a mais do que devia, que
      pulava sempre o documento bem na fronteira de cada página de ~50.
      Isso não é específico da Wogel: acontece em qualquer empresa cujo
      histórico cruze mais de uma página (a cada ~50 documentos), sempre
      que a fronteira cair bem em cima de um documento real
- [x] Corrigido removendo o `+1` extra — o NSU já funciona como limite
      inferior exclusivo por si só. Validado ao vivo, isolando a mesma
      sequência de chamadas reais: sem o `+1`, o documento que antes
      sumia passou a aparecer exatamente na fronteira onde antes ficava
      de fora
- [x] Aproveitado pra simplificar `sync-notas.ts`: o NSU também não é um
      índice que cresce pra sempre — é a posição numa janela de
      documentos disponíveis que parece ter um teto (pra uma empresa
      real com histórico desde 2018, só ~384 documentos disponíveis no
      total). Com isso, a lógica antiga de guardar um checkpoint e só
      revisitar uma janela recente (pensada quando se imaginava que
      escanear tudo de novo demoraria minutos) foi removida — escanear
      tudo desde o NSU 0 em toda busca levou ~16s ao vivo, e elimina de
      vez o risco de um checkpoint antigo apontar pra um lugar que não
      significa mais a mesma coisa
- [x] Testado ao vivo, ponta a ponta, com o pedido real de "buscar agora"
      pra julho/2026 da Wogel: antes da correção, 46 notas encontradas
      sem a nota relatada; depois, 47 notas, com a nota presente —
      mesmos parâmetros, único código mudado
- [x] Empresas que já sincronizaram sob o bug antigo podem ter perdido
      notas silenciosamente nas mesmas condições — recomendado rodar
      "Buscar últimos 12 meses" de novo pras 3 empresas com certificado
      cadastrado, pra recuperar qualquer nota que tenha caído numa
      fronteira de página no passado

**Ajuste — RBT12 projetado proporcionalmente pra empresa recém-aberta (concluído)**
- [x] O usuário identificou uma confusão conceitual: `resolverRbt12`
      tratava "empresa recém-aberta" (menos de 12 meses de existência,
      caso em que a regra oficial do Simples Nacional é projetar o RBT12
      proporcionalmente ao faturamento real desde a abertura — ex.:
      faturou R$50mil no único mês que existe, projeta R$50mil × 12)
      exatamente igual a "empresa antiga com histórico insuficiente NO
      SISTEMA" (que já existia há anos, só entrou recentemente no
      soma-nfse). São duas situações diferentes com base legal diferente:
      a primeira é uma fórmula fixa por lei; a segunda depende do que a
      empresa já faturava antes de existir no sistema, e por isso usa o
      RBT12 manual informado em Dados fiscais (ver ajuste logo abaixo,
      "RBT12 manual cheio nos meses de transição", que substituiu o
      decaimento gradual do ajuste anterior "RBT12 manual rolando
      automaticamente")
- [x] Nova coluna `companies.data_abertura` (migration
      [`20260826130000_fase_n_data_abertura_rbt12.sql`](supabase/migrations/20260826130000_fase_n_data_abertura_rbt12.sql)),
      editável em Dados fiscais. `resolverRbt12` (`lib/faturamento.ts`)
      agora calcula meses de existência a partir dela; se for menor que
      12, ignora completamente o RBT12 manual (não faz sentido pra uma
      empresa que comprovadamente não existia há 12 meses) e projeta:
      média do faturamento real desde a abertura × 12. Cobre o caso
      extremo do mês de abertura (zero meses anteriores) usando a
      receita do próprio mês como base
- [x] Empresa com 12+ meses de existência continua no fluxo antigo
      (RBT12 real dos 12 meses, ou o manual configurado se o histórico do
      sistema for insuficiente — ver ajuste seguinte) — a `data_abertura`
      só muda o resultado pra quem é genuinamente novo. Deixando
      `data_abertura` em branco preserva o comportamento anterior por
      completo
- [x] Novo alerta específico em Impostos quando o RBT12 é a projeção
      proporcional oficial, distinto do alerta genérico de "histórico
      insuficiente"
- [x] Validado com 14 casos de teste cobrindo cada ramo (abertura no mês
      corrente, 3 meses de existência ignorando o manual, empresa antiga
      com histórico insuficiente ainda usando o manual, sem
      `data_abertura` preservando o comportamento antigo, exatamente 12
      meses deixando de ser "nova") e conferido que nenhuma empresa real
      tem `data_abertura` preenchida hoje — a mudança é inerte até o
      campo ser configurado por empresa, sem impacto retroativo

**Correção — RBT12 manual cheio nos meses de transição, sem decaimento (concluído)**
- [x] O usuário corrigiu o comportamento do ajuste anterior ("RBT12
      manual rolando automaticamente"): pra empresa antiga com histórico
      insuficiente NO SISTEMA (não confundir com empresa nova — ver
      ajuste acima), o RBT12 manual configurado em Dados fiscais deve ser
      usado CHEIO em todo mês de transição, sem misturar/decair com o
      faturamento parcial já registrado no sistema — misturar deixava o
      RBT12 artificialmente baixo enquanto o sistema não tem os 12 meses
      completos, o que pode subestimar o Fator R e o Anexo errado
- [x] Removido o decaimento gradual (peso do manual caindo 1/12 por mês
      enquanto soma a receita real dos meses intermediários). Agora, da
      competência de referência até 11 meses depois — enquanto o sistema
      não completar os 12 meses reais de faturamento —, `resolverRbt12`
      (`lib/faturamento.ts`) devolve o valor manual sem nenhum ajuste.
      Assim que o sistema acumula os 12 meses reais, passa a usar só a
      própria história, como antes
- [x] Simplificação: os campos `manualRolando` e a função auxiliar
      `mesesEntre` (só existiam pra sustentar o blend) foram removidos;
      `usandoManual` agora cobre toda a janela de transição, não só a
      competência de referência exata
- [x] Testado com 7 casos de teste (competência de referência exata,
      meio da janela, última competência antes de completar 12 meses,
      12 meses reais completos voltando a ignorar o manual, competência
      antes da referência, e o caso empresaNova do ajuste anterior
      intacto) e validado ao vivo contra a WOGEL MEDICINA FUNCIONAL real
      (RBT12 manual R$872.585,68, 8 de 12 meses no sistema): a tela de
      Impostos mostrou o RBT12 exatamente igual ao manual configurado,
      não misturado com os 8 meses de faturamento real já existentes

**Correção — RBT12 manual passa a ser mês a mês, não mais um total único (concluído)**
- [x] O usuário identificou o defeito estrutural do ajuste anterior: um
      valor único (mesmo "cheio", sem decaimento) não sabe QUAL mês
      específico sai da janela de 12 meses quando o tempo passa — mês
      após mês, o sistema continuava usando o mesmo total, sem excluir a
      competência mais antiga nem somar a nova, exatamente como o
      RBT12 real é uma janela MÓVEL, não um número fixo
- [x] Resolvido trazendo o faturamento histórico por competência,
      informado manualmente só pras competências anteriores à empresa
      existir no sistema — mesmo padrão já usado em `folha_mensal` pra
      folha de pagamento, que também não tem fonte automática nenhuma.
      Nova tabela `receita_mensal_manual` (migration
      [`20260826140000_fase_n_receita_mensal_manual.sql`](supabase/migrations/20260826140000_fase_n_receita_mensal_manual.sql)),
      nova aba **RBT12** por empresa (`empresas/[id]/rbt12`) com uma
      linha editável pra cada mês sem nota no sistema
- [x] Com o dado por mês, a janela de 12 meses rola sozinha por
      construção — sem decaimento, sem "competência de referência",
      sem transição especial nenhuma: `resolverRbt12` (`lib/faturamento.ts`)
      simplesmente soma os últimos 12 meses, usando o real quando existe
      nota (`receitaComManual` prioriza sempre o real) e o manual só
      pros meses sem nenhuma nota. `companies.rbt12_manual`/
      `rbt12_manual_competencia` ficam sem uso a partir daqui (mesmo
      precedente de `fator_r_percentual` — coluna não removida, só não
      lida mais pelo cálculo); os dois campos saíram do formulário de
      Dados fiscais
- [x] Validado com 12 casos de teste, incluindo o cenário exato
      relatado pelo usuário: 12 meses manuais preenchidos pra uma
      janela, no mês seguinte a competência mais antiga (manual) sai e a
      mais nova (que virou real nesse meio tempo) entra automaticamente
      — sem nenhuma lógica dedicada pra isso, só a soma dos últimos 12
      meses. Validado também ao vivo contra a WOGEL MEDICINA FUNCIONAL
      real: preencheu 11/2025 manualmente pela nova aba, RBT12 recalculou
      de R$842.402,76 pra R$775.469,12 (9 de 12 meses, 1 manual) —
      conferido exato (soma dos 9 meses ÷ 9 × 12) — e apagou depois, sem
      deixar dado de teste na empresa real
- [x] WOGEL e SOMA CONTABILIDADE (as duas empresas que tinham o antigo
      RBT12 manual configurado) precisam ter os meses histórico
      re-preenchidos na nova aba RBT12 — o valor total antigo não foi
      migrado automaticamente pra um mês só, porque isso reproduziria o
      mesmo defeito que motivou essa correção

**Ajuste — importar receita mensal do PGDAS-D + corrigir mês com nota incompleta (concluído)**
- [x] Duas necessidades do usuário: (1) editar manualmente um mês que já
      tem nota (não só os "sem dado") — a distribuição de notas do Sefin
      Nacional só passou a funcionar de forma parcial a partir de
      dezembro/2025, então um mês pode aparecer com nota no sistema e
      ainda assim estar incompleto; (2) importar o faturamento
      histórico do PGDAS-D em vez de digitar mês a mês
- [x] Descoberta ao analisar um PGDAS-D real da WOGEL: a seção "2.2)
      Receitas Brutas Anteriores" já traz o faturamento de até 18 meses
      anteriores, mês a mês (Mercado Interno + Mercado Externo) —
      informação que o parser (`lib/pdf-import/pgdasd.ts`) não extraía
      ainda (só pegava o RBT12 total e a folha). Adicionado
      `receitaMensal` ao resultado do parse, testado com o PDF real via
      `pdf-parse` (a mesma lib usada em produção): os 18 meses bateram
      exatos com o que aparece na declaração
- [x] Nova aba RBT12 ganhou "Importar do PGDAS-D" (`ImportarPgdasdReceitaForm.tsx`
      + `salvarReceitaManualLote` em `actions/faturamento.ts`), mesmo
      padrão de tela de revisão editável antes de confirmar já usado pra
      importar folha
- [x] `receitaComManual` (`lib/faturamento.ts`) mudou de "manual só
      preenche mês sem nota" pra "manual sempre tem prioridade sobre a
      nota, quando informado" — cobre tanto completar um mês vazio
      quanto corrigir um mês que já tem nota. A tabela da aba RBT12
      agora é sempre editável (mesmo em mês com nota), mostrando o valor
      da nota ao lado como referência, com selo "Manual (sobrepõe
      nota)" quando há um override ativo
- [x] Validado ao vivo: reproduziu exatamente o parse do PDF real da
      WOGEL (18 meses via `pdf-parse`) e simulou o upsert que
      `salvarReceitaManualLote` faz — RBT12 de agosto/2026 foi de
      R$842.402,76 (estimado, 8/12 meses) pra R$922.898,84 (12/12 meses,
      exato — conferido somando os 12 valores manuais/override, bate
      com o valor mostrado). O teste também EXPÔS divergências reais
      entre o que o PGDAS-D declarou e o que o sistema tinha como nota
      (ex.: 12/2025 nota = R$24.280,00 vs PGDAS-D = R$118.610,00;
      02/2026 nota = R$51.974,00 vs PGDAS-D = R$23.564,00) — exatamente
      o cenário que motivou o pedido de override. Dados de teste
      revertidos depois, sem deixar nada na empresa real
- [x] WOGEL ainda não teve o PGDAS-D importado de verdade (o teste foi
      só da lógica, via script, não pelo botão da tela) — usar
      "Importar do PGDAS-D" na aba RBT12 dela resolve tanto os 4 meses
      sem dado quanto as divergências encontradas

**Ajuste — coluna de Fator R na Visão geral (concluído)**
- [x] A tabela "Faturamento por empresa" da Visão geral (`admin/page.tsx`)
      já calculava `fatorRPercentual` internamente (usado só pro cálculo
      de imposto), mas não mostrava esse número. Nova coluna "Fator R"
      entre Regime e Alíquota, com o percentual pra empresas do Simples
      Nacional marcadas como sujeitas ao Fator R — "—" pra quem não é SN
      ou não é sujeito ao Fator R
- [x] Testado ao vivo: coluna mostra "—" pra LP e pra SN sem Fator R
      configurado, e o percentual real (ex.: 11,7% Ana Roenick, 30,47%
      Wogel) pras empresas que têm

**Bug real corrigido — Visão geral perdia notas silenciosamente acima de 1000 linhas na tabela (concluído)**
- [x] Usuário reportou que a TECHBONE não atualizava na Visão geral
      mesmo depois de sincronizar as notas. Investigando, a competência
      corrente da empresa aparecia com 0 notas mesmo tendo 11 notas reais
      de agosto/2026 no banco
- [x] Causa raiz: `admin/page.tsx` busca `dps` e `notas_distribuidas`
      inteiras (todas as empresas, sem paginação) pra agregar em JS —
      exatamente o padrão que o próprio comentário no código já avisava
      que precisaria mudar "se crescer muito". `notas_distribuidas` já
      tinha passado de 1000 linhas (1042 no momento do bug), e o
      PostgREST (por trás do Supabase) limita qualquer select sem
      `.range()`/`.limit()` a 1000 linhas por requisição — SEM erro
      nenhum, só devolve menos linhas do que existem. As ~42 linhas que
      ficaram de fora incluíam boa parte das notas mais recentes de
      agosto/2026 de várias empresas, não só a Techbone
- [x] Corrigido com uma função de paginação genérica
      (`buscarTudoPaginado`, `lib/supabase/paginacao.ts`) que busca em
      blocos de 1000 até a página vir mais curta que o pedido — garante
      que a query nunca perde linha independente do tamanho da tabela.
      Aplicada nas duas queries de `admin/page.tsx` (`dps` e
      `notas_distribuidas`); as outras buscas em massa da mesma página
      (`companies`, `folha_mensal`, `receita_mensal_manual`) ainda estão
      bem abaixo de 1000 linhas, não precisavam ainda
- [x] Validado ao vivo: antes da correção, "Faturamento" geral da Visão
      geral (todas as empresas, agosto/2026) mostrava R$194.207,26 com
      99 notas; depois, R$449.327,90 com 110 notas — a diferença era
      faturamento real que estava sendo perdido silenciosamente em
      várias empresas, não só na Techbone (que sozinha tinha R$255.120,64
      faltando). Confirmado buscando as 1042 linhas reais de
      `notas_distribuidas` com paginação manual antes de aplicar a
      correção, comparando com o corte de 1000 que o código antigo
      trazia
- [x] Mesmo padrão de risco (query sem paginação que pode passar de
      1000 linhas) ainda existe em queries por empresa/mês em
      `admin/empresas/[id]/fechamento` — hoje muito longe do limite
      (maior empresa vista tem 90 notas num mês), mas vale ficar de
      olho se algum mês de alguma empresa crescer muito

**Ajuste — controle de certificado digital (concluído)**
- [x] Usuário pediu duas coisas: (1) na Visão geral, uma tabela de
      certificados vencidos ou vencendo nos próximos 45 dias; (2) um
      lugar pra consultar quais empresas ainda não têm certificado
      cadastrado — a base já tinha `certificates.expires_at` por
      empresa (Fase B), só faltava a visão consolidada entre empresas
- [x] Nova aba **Certificados** no menu principal do painel
      (`admin/certificados`), ao lado de Empresas/Fechamento/Erros/Logs:
      cards de resumo (total de empresas, com/sem certificado, vencidos
      ou vencendo em 45 dias), tabela dos vencimentos próximos com link
      direto pra aba de certificado da empresa, e lista buscável das
      empresas sem certificado (196 das 206 hoje)
- [x] Visão geral ganhou um card compacto na mesma lógica (vencidos ou
      vencendo em 45 dias) logo abaixo dos indicadores do topo, com link
      pra "N empresa(s) sem certificado — ver todos" apontando pra aba
      nova, sem duplicar a lista inteira ali
- [x] Bug pego e corrigido antes de ir pro ar: a relação
      `companies → certificates` é 1:1 (`certificates.company_id` é
      `unique`), então o PostgREST embute como OBJETO único, não array
      — o código inicial tratava como array (`certificates[0]`), o que
      fazia toda empresa cair em "sem certificado" mesmo tendo um
      cadastrado. Achado testando ao vivo (a Visão geral, que usa uma
      query separada e não embutida, mostrava 2 vencendo; a aba nova
      mostrava 0 com certificado) — corrigido tipando como objeto único
      e validado de novo: 10 com certificado, 196 sem, 2 vencendo (bate
      com a Visão geral)

**Fase O/P — Módulos Legalização e Extratos + dois papéis novos (concluído)**
- [x] Usuário decidiu renomear o produto pra "SOMA Gestão" (deixa de ser só
      "SOMA NFS-e") porque quer adicionar módulos além da emissão de nota,
      pra ajudar na gestão dos clientes de verdade. Primeiros dois:
      **Legalização** (controle de documentos como Alvará de Funcionamento,
      Vigilância Sanitária, CNES, Certidão — vencimento + arquivo, por
      empresa) e **Extratos** (contas bancárias por empresa + controle
      mês a mês de entrega do extrato bancário pro setor contábil, com o
      arquivo anexado). Cada módulo tem um papel novo dedicado —
      **Analista de Legalização** e **Analista Contábil** — que só
      enxergam o próprio módulo, nada de fiscal/certificado/notas
- [x] Dois papéis novos no enum `user_role` (migration própria — Postgres
      não deixa usar um valor de enum recém-criado na mesma transação em
      que foi adicionado). Duas árvores de rota novas e independentes,
      `/legalizacao` e `/extratos` (não um retrofit de `/admin`, que já
      dá acesso a tudo pra quem é staff) — cada uma com seu próprio gate
      (`requireLegalizacaoAccess`/`requireExtratosAccess` em `lib/auth.ts`,
      aceitando staff completo OU o papel específico)
- [x] Bug pego e corrigido durante o teste ao vivo: a policy de RLS de
      `companies` só liberava leitura pra staff ou pra quem tem vínculo
      direto com aquela empresa — os papéis novos têm um vínculo só
      incidental (mesma linha "pra existir" que staff usa), então não
      enxergavam NENHUMA empresa de verdade, só a linha especial da SOMA.
      Sem isso os dois módulos ficavam inutilizáveis. Corrigido liberando
      `companies_select` também pros dois papéis novos
- [x] Bug lateral pego e corrigido: `/empresas/[companyId]` (portal do
      cliente) checava só "existe vínculo com essa empresa", sem checar o
      papel — um Analista cujo vínculo incidental apontasse pra uma
      empresa real veria a casca do portal do cliente (RLS ainda bloqueava
      os dados, mas a tela ficava quebrada). Adicionada checagem de papel
- [x] `/` (redirecionamento pós-login) passou a decidir o destino pelo
      papel antes de olhar quantas empresas o usuário tem — staff vai
      direto pro `/admin` (antes aparentemente só chegava lá por favorito
      de URL), Analista de Legalização pro `/legalizacao`, Analista
      Contábil pro `/extratos`
- [x] Arquivos (documento de legalização, extrato bancário) vão pro
      **Vercel Blob**, não bytea no Postgres (padrão usado em
      `certificates`) nem Supabase Storage — decisão tomada depois de
      levantar que bytea esbarra no limite prático de ~4,5MB por
      requisição de Serverless Function da Vercel, que um documento
      escaneado de várias páginas pode ultrapassar. Upload é direto do
      navegador pro Blob (`@vercel/blob/client`, rotas
      `/api/legalizacao/upload` e `/api/extratos/upload` só geram o token
      assinado) — o arquivo nunca passa pelo corpo de nenhuma Server
      Action, contornando o limite de verdade
- [x] Catálogo de tipos de documento de legalização é configurável
      (`/legalizacao/tipos`) — staff/analista adiciona tipos novos sem
      precisar de deploy; nem toda empresa precisa de todo tipo (ex.: CNES
      só se aplica a empresa de saúde), então uma empresa sem necessidade
      de um tipo simplesmente não tem linha cadastrada pra ele, mesmo
      padrão de `certificates`
- [x] "Entregue" no controle de extrato é independente do arquivo — dá
      pra marcar como recebido (ex.: mandado por WhatsApp) antes do
      upload ficar pronto no sistema
- [x] Validado ao vivo com usuários descartáveis por papel: Analista de
      Legalização e Analista Contábil corretamente redirecionados pra
      fora de `/admin` e do módulo um do outro; cadastro de conta
      bancária, marcar mês como entregue (sem arquivo, já que o Blob
      Store ainda não estava configurado no ambiente de teste) e apagar
      conta (com cascade dos extratos mensais) testados de ponta a ponta
      contra o banco real; catálogo de tipos testado (criar tipo,
      inativar/reativar); staff confirmado acessando os dois módulos
      novos pelos atalhos adicionados no cabeçalho do `/admin`
- [x] Upload de arquivo de verdade validado depois que o Blob Store
      ("SOMAGestao") foi criado e conectado ao projeto `soma-nfse` na
      Vercel, com `BLOB_READ_WRITE_TOKEN` liberado pros três ambientes
      (Production, Preview e Development — a conexão automática só tinha
      coberto Production/Preview). Ponta a ponta com usuário descartável:
      upload real (PDF simulando um Alvará) → linha criada em
      `legalizacao_documentos` com `blob_url`/`blob_pathname` corretos →
      download pela rota `/api/legalizacao/documentos/[id]` devolvendo o
      arquivo certo (`Content-Type`, `Content-Disposition` e conteúdo
      byte a byte) → "Remover" apagando a linha do banco E o blob no
      Vercel Blob (confirmado com `list()` direto contra o Blob Store,
      prefixo vazio depois de apagar)
- [x] `vercel link` (`--yes`) tentou linkar sem projeto explícito e
      **criou um projeto novo por engano** (`frontend` num time
      `soma-7532`) em vez de achar o `soma-nfse` existente — sinal de que
      esse comando nunca deve rodar sem `--project <nome-certo>`
      explícito nesse repo. Usuário apagou o projeto errado; relinkado
      corretamente com `vercel link --project soma-nfse --yes`
- [x] Rebrand de "SOMA NFS-e" pra "SOMA Gestão" concluído — `Logo.tsx`
      (wordmark do header/login/portal), título/descrição raiz e os 12
      títulos de página (`"X — SOMA NFS-e"` → `"X — SOMA Gestão"`) trocados
      em lote. Deliberadamente fora do escopo: nome do repositório, slug
      do projeto na Vercel e domínio continuam `soma-nfse` — decisão de
      infra separada, documentada no início deste README. Referências a
      "NFS-e" no backend e no resto do README continuam intactas (nome
      oficial do documento fiscal, não a marca do produto)

**Ajuste — leitura automática do documento de legalização + validade indeterminada (concluído)**
- [x] Ao anexar um documento de legalização, o sistema agora tenta ler o
      PDF e sugerir a data de vencimento sozinho, além de conferir se o
      CNPJ encontrado no documento bate com o da empresa selecionada —
      evita anexar o arquivo da empresa errada sem perceber
- [x] Extração é por aproximação de texto (`lib/pdf-import/legalizacao-analise.ts`):
      acha a primeira data no formato dd/mm/aaaa que aparece logo depois
      de uma palavra-chave de validade/vencimento (evita confundir com a
      data de emissão do documento, que normalmente não tem essas
      palavras por perto) e o primeiro CNPJ no texto. Só funciona em PDF
      com camada de texto real — documento escaneado/fotografado sem OCR
      não tem texto nenhum pra procurar, e nesse caso simplesmente não
      sugere nada (usuário preenche manualmente como já fazia antes,
      decisão consciente de não introduzir OCR nem chamada a uma IA
      externa por enquanto)
- [x] Upload passou a acontecer assim que o arquivo é selecionado (não
      mais só ao clicar Salvar) — necessário pra poder ler o conteúdo e
      sugerir a data antes de confirmar. Efeito colateral: se o usuário
      troca de arquivo ou desiste antes de salvar, o upload anterior
      ficaria órfão no Blob — corrigido apagando o upload anterior
      automaticamente sempre que um novo arquivo é selecionado no mesmo
      campo (`apagarBlobOrfao`). Ainda não coberto: usuário que seleciona
      um arquivo e sai da página sem trocar nem salvar — fica um blob
      órfão pequeno, sem faxina automática por enquanto (não vale a
      complexidade de um job de limpeza pra esse volume)
- [x] Alguns documentos de legalização são emitidos com validade
      indeterminada (não vencem, só são revogados) — `data_vencimento`
      virou nullable (migration própria) e a tela ganhou um checkbox
      "Validade indeterminada" que desabilita o campo de data; esses
      documentos aparecem com selo próprio ("Validade indeterminada",
      tom neutro) e nunca entram na lista de "vencendo em 45 dias"
- [x] Validado ao vivo com dois PDFs reais gerados pra teste (via
      reportlab): um com o CNPJ real da Wogel (sem aviso, data sugerida
      "2027-06-29" batendo exato com o texto "Validade: 29/06/2027" do
      PDF) e outro com CNPJ de outra empresa (aviso de divergência
      exibido corretamente); validade indeterminada testada ponta a
      ponta (checkbox → salva com `data_vencimento = null` → selo
      correto → fora da lista de vencimentos); limpeza de blob órfão
      confirmada trocando de arquivo antes de salvar (upload antigo
      desaparece do Blob assim que o novo é selecionado)

**Ajuste — tipo de documento por empresa, busca rápida e vencimento agrupado (concluído, 2026-08-27)**
- [x] Nem toda empresa precisa controlar todo tipo de documento do
      catálogo (ex.: CNES só faz sentido pra empresa de saúde). Nova
      tabela `legalizacao_tipos_nao_aplicaveis` guarda só as *exceções*
      (empresa marcou que não se aplica) — ausência de linha continua
      significando "se aplica normalmente", então nenhuma migração de
      dados foi necessária pras 206 empresas já cadastradas. Toggle
      "Marcar como (não) aplicável" por tipo na tela da empresa; quando
      marcado como não aplicável, o formulário de upload some (a menos
      que já exista um documento cadastrado pra esse tipo — nesse caso o
      documento continua visível/gerenciável, só a contagem de pendência
      é que ignora esse tipo)
- [x] Dashboard (`/legalizacao`) passou a calcular "documentação
      incompleta" considerando as exceções por empresa: uma empresa só
      entra na lista de pendência se sobrar pelo menos um tipo aplicável
      sem documento. Card e lista que antes eram "sem nenhum documento"
      foram renomeados pra refletir isso
- [x] Painel de consulta rápida: campo de busca no topo do dashboard
      (`BuscaRapidaEmpresa.tsx`) filtra as 206 empresas no cliente
      (sem round-trip ao servidor a cada tecla) e linka direto pra
      `/legalizacao/empresas/{id}` — fluxo "seleciona o cliente e acessa
      o documento" pedido pra ser usado por toda a equipe, não só o
      Analista de Legalização (que já tinha acesso de qualquer forma via
      `is_soma_staff() OR is_legalizacao_analista()`; o que faltava era
      velocidade de navegação, não permissão)
- [x] Lista de "vencendo em 45 dias" do dashboard deixou de ser uma lista
      única misturando empresas e tipos de documento diferentes — agora
      vem agrupada em seções por tipo (Alvará, CNES, Certidão, ...), cada
      seção ordenada por dias até vencer
- [x] Validado ao vivo com usuário descartável (`ANALISTA_LEGALIZACAO`):
      marcar CNES como não aplicável pra uma empresa real fez o
      formulário sumir e criou a linha esperada em
      `legalizacao_tipos_nao_aplicaveis`; reverter apagou a linha; busca
      rápida testada digitando parte do nome de uma empresa e conferindo
      o link sugerido

**Ajuste — tela de consulta separada da tela de gerenciamento + confirmação de remoção (concluído, 2026-08-27)**
- [x] A tela `/legalizacao/empresas/{id}` misturava duas necessidades
      diferentes (consultar rapidamente o status/baixar um documento vs.
      cadastrar/editar), o que ficava visualmente poluído — link de
      "Baixar" e o toggle de aplicável lado a lado, formulário de upload
      sempre visível mesmo pra só olhar o status. Virou duas telas:
      `/legalizacao/empresas/{id}` (consulta, somente leitura — nome do
      tipo, selo de status colorido, vencimento e botão "Baixar" quando
      existe documento; tipos não aplicáveis saem da lista principal e
      aparecem só como uma linha de rodapé) e
      `/legalizacao/empresas/{id}/gerenciar` (upload, toggle de
      aplicável e remoção, um botão "Gerenciar documentos" leva de uma
      pra outra). Link de "toggle aplicável" virou um componente
      `Switch` de verdade (`components/ui/Switch.tsx`) em vez de um link
      de texto "Marcar como não aplicável" — mais claro visualmente qual
      é o estado atual
- [x] "Remover documento" não depende mais do `confirm()` nativo do
      navegador (fácil de clicar sem perceber) — o botão agora abre uma
      confirmação inline dentro do próprio card ("Remover este
      documento? / Sim, remover / Cancelar"), exigindo um segundo clique
      explícito antes de apagar o arquivo do Blob e a linha do banco
- [x] Validado ao vivo com usuário descartável: tela de consulta
      mostrando só os tipos aplicáveis com selo/baixar; "Gerenciar
      documentos" levando pra tela de edição; clicar "Remover" no Alvará
      real abriu a confirmação inline sem apagar nada, "Cancelar"
      manteve o documento intacto (conferido direto no banco); toggle do
      Switch pro CNES colapsando o card pra "não se aplica" e refletindo
      corretamente na tela de consulta (some da lista principal, aparece
      no rodapé "Não aplicáveis a esta empresa")

**Ajuste — vincular empresas pelo tipo de documento, não empresa por empresa (concluído, 2026-08-27)**
- [x] Até aqui, todo tipo novo aparecia automaticamente pras 206 empresas,
      e restringir um tipo de nicho (ex.: CNES) exigia entrar empresa por
      empresa desmarcando quem não precisa — inviável na prática. Cada
      tipo agora escolhe o próprio padrão: `aplica_a_todas` (comportamento
      de sempre — Alvará, Certidão, ...) ou restrito, caso em que ele não
      se aplica a ninguém até alguém escolher as empresas na tela do
      próprio tipo. A tabela de exceção (renomeada de
      `legalizacao_tipos_nao_aplicaveis` pra
      `legalizacao_tipos_empresas_excecao`) ganhou uma coluna `aplicavel`
      pra guardar a exceção nos dois sentidos: com o tipo em modo "todas",
      uma linha com `aplicavel=false` exclui; em modo restrito, uma linha
      com `aplicavel=true` inclui — ausência de linha sempre quer dizer
      "usa o padrão do tipo"
- [x] Tela "Tipos de documento" ganhou um `Switch` por tipo pra alternar
      entre os dois modos e um link "Gerenciar empresas" levando pra
      `/legalizacao/tipos/{id}/empresas` — lista com busca, "selecionar
      todas/filtradas" e "limpar seleção", salva o conjunto inteiro de
      empresas aplicáveis de uma vez (recria as exceções do zero,
      guardando só as que realmente divergem do padrão, mesmo princípio
      de tabela enxuta de sempre). Criar um tipo já marcado como restrito
      leva direto pra essa tela em vez de deixá-lo invisível até alguém
      lembrar de configurar
- [x] Validado ao vivo: criado tipo restrito de teste, confirmado
      `aplica_a_todas=false` no banco; selecionadas 2 de 206 empresas na
      tela de gerenciar empresas, salvo, e confirmadas as duas linhas de
      exceção certas (`aplicavel=true`) no banco; tela de consulta da
      empresa selecionada mostrando o tipo normalmente, e de uma empresa
      não selecionada mostrando ele só no rodapé "Não aplicáveis a esta
      empresa" — comportamento correto nos dois lados sem tocar em
      nenhuma empresa manualmente

**Ajuste — indicadores do dashboard, certificados vencendo e dados cadastrais na consulta (concluído, 2026-08-27)**
- [x] Card "Com algum documento" saiu; entrou "Empresas com tudo OK" —
      conta empresas com pelo menos um tipo aplicável (não conta quem não
      tem nenhum tipo aplicável) e ZERO pendência (nenhum tipo aplicável
      faltando nem vencido). "Documentação incompleta" continua contando
      o oposto
- [x] A lista antes chamada "Sem nenhum documento cadastrado" virou
      "Ranking de documentação incompleta" — ordenada por quantidade de
      pendência (faltando + vencido) decrescente em vez de alfabética, e
      cada linha mostra a contagem ("3 faltando, 1 vencido(s)", "4 de 4
      faltando", etc.) em vez de só o nome
- [x] Novo card + seção "Certificados digitais vencidos ou vencendo em
      até 45 dias" no dashboard — como a tabela `certificates` guarda
      campos cifrados (pfx e senha) e sua RLS é só `is_soma_staff()` de
      propósito, criei a function `certificados_vencendo_legalizacao()`
      (SECURITY DEFINER, mesmo padrão de `is_soma_staff()`) que devolve
      só `company_id` e `expires_at` pra quem for staff OU Analista de
      Legalização, sem abrir a tabela crua (e os campos cifrados) pra
      esse papel
- [x] Tela de consulta por empresa (`/legalizacao/empresas/{id}`) ganhou
      um card "Dados cadastrais" (somente leitura) com CNPJ formatado e
      regime tributário — únicos dois campos do cadastro da empresa que
      já existem no banco hoje. Endereço completo (rua, bairro, CEP) e
      nome de cidade/UF **não existem em lugar nenhum do sistema
      atualmente** — a empresa só guarda um código IBGE do município
      (`municipality_ibge_code`, sem nome legível) usado só na hora do
      cadastro pra achar a alíquota de ISS; ficou como pendência em
      aberto, junto do pedido de ranking de empresas por cidade que
      depende do mesmo dado
- [x] Validado ao vivo com usuário descartável: dashboard mostrando os
      2 certificados reais vencendo (21 e 29 dias, batendo com os dados
      de produção) linkando pra tela de consulta certa; ranking de
      documentação incompleta ordenado certo (2Z2S no topo com "3
      faltando, 1 vencido(s)"); card de CNPJ/regime tributário mostrando
      "65.064.501/0001-87" e "Simples Nacional" pra 2Z2S corretamente

**Ajuste — endereço completo e ranking por cidade a partir da Receita Federal (concluído, 2026-08-27)**
- [x] `companies` ganhou 7 colunas novas (`address_street`, `address_number`,
      `address_complement`, `address_neighborhood`, `address_zip`,
      `municipality_name`, `state`) — resolvendo a lacuna documentada no
      ajuste anterior. `lib/cnpj-lookup.ts` passou a capturar
      `logradouro`/`numero`/`complemento`/`bairro`/`cep` da resposta da
      BrasilAPI (já vinham na resposta, só não eram usados); cadastro
      manual de empresa (`NewCompanyForm.tsx`) e importação em lote
      (`lib/actions/empresas.ts`) passam a persistir tudo isso a partir de
      agora
- [x] Rodado um backfill único (script descartável, apagado depois de
      rodar) pras 205 empresas já cadastradas com CNPJ: consulta a
      BrasilAPI por CNPJ com intervalo de 400ms entre chamadas (mesmo
      padrão de `IMPORT_EMPRESAS_THROTTLE_MS` já usado na importação em
      lote) e retry com backoff em caso de 429. Resultado: 204 de 205
      atualizadas; 1 falha (CNPJ `36204726000166`, cadastrado pra
      "ASSOSCIAÇÃO BRASILEIRA DE ESTUDOS E DOENÇAS IMUNO", devolveu HTTP
      400 da BrasilAPI — provável CNPJ inválido/com dígito verificador
      errado no cadastro; não mexi nele, fica como pendência pontual pra
      confirmar o CNPJ certo dessa empresa)
- [x] Tela de consulta por empresa (`/legalizacao/empresas/{id}`) ganhou
      o campo Endereço no card de dados cadastrais, formatado como uma
      linha só ("Rua, Número - Complemento — Bairro, Cidade/UF — CEP");
      dashboard ganhou a seção "Ranking de empresas por cidade" (contagem
      por `município/UF`, decrescente, com "Sem cidade cadastrada" à parte
      pras que não têm)
- [x] Validado ao vivo com usuário descartável: card de endereço da 2Z2S
      mostrando "DOUTOR ALENCAR LIMA, 35 - SALA 1208 — CENTRO,
      PETROPOLIS/RJ — CEP 25620-050" (bate com o CNPJ real na Receita);
      ranking de cidade batendo com o perfil real da carteira de clientes
      (Petrópolis/RJ 87, Rio de Janeiro/RJ 72, ...) — confirma que o
      backfill populou os dados certos

**Novo módulo — Societário: contrato social, alterações e sócios (concluído, 2026-08-27)**
- [x] Documentos de legalização têm vencimento e um catálogo fixo de tipos
      por empresa; contrato social e suas alterações não têm vencimento
      nenhum e não têm quantidade fixa (uma empresa pode ter zero
      alterações, outra pode ter oito) — não cabiam no mesmo modelo.
      Passou a ser um histórico livre por empresa: data + descrição (texto
      livre, ex.: "Contrato Social", "2ª Alteração — entrada de sócio") +
      arquivo, sem catálogo de tipos (`societario_documentos`)
- [x] Sócios (`socios`) são uma entidade nova no sistema — não existia
      nada parecido antes. PF ou PJ, sem vínculo obrigatório com nenhuma
      `company` já cadastrada (sócio PJ pode ser de fora da carteira de
      clientes da SOMA): nome/razão social, CPF/CNPJ opcional, percentual
      de participação atual (não um histórico de mudanças — se o
      percentual mudar, o Analista só edita o campo; o documento que
      comprova a mudança já fica registrado no histórico societário da
      empresa), data de entrada/saída. Cada sócio tem sua própria
      mini-lista de documentos (`socios_documentos` — RG, CPF, comprovante
      de residência, ...), mesmo espírito de descrição livre sem
      vencimento
- [x] Reaproveita 100% a infraestrutura do módulo Legalização: mesma
      rota de upload (`/api/legalizacao/upload`, já gated por
      `requireLegalizacaoAccess()`, sem lógica específica de tabela — só
      mudou o prefixo do pathname), mesmo papel Analista de Legalização
      (nenhum papel novo, nenhuma migration de enum). Só 2 rotas de
      download novas (`/api/societario/documentos/[id]`,
      `/api/societario/socios-documentos/[id]`), réplicas diretas do
      padrão já usado em Legalização
- [x] Nova aba "Societário" na tela de consulta por empresa
      (`/legalizacao/empresas/{id}/societario`) com duas seções: histórico
      societário (lista + form de nova entrada) e sócios (lista com
      editar/expandir documentos inline + form de novo sócio). Botão de
      remoção usa o mesmo padrão de confirmação inline (não nativo) já
      adotado no resto do módulo Legalização
- [x] RLS pensada pra abrir consulta pra mais gente no futuro sem mexer
      em schema — hoje é `is_soma_staff() or is_legalizacao_analista()`
      nas 3 tabelas (igual ao resto de Legalização); ampliar quem pode só
      *ler* no futuro é adicionar mais um papel na cláusula `using`, não
      uma migration nova
- [x] Validado ao vivo com usuário descartável: upload real de documento
      societário (data + descrição + PDF) → salvo com blob real no Vercel
      Blob → baixado de volta byte a byte pela rota nova → removido
      (confirmado sumindo do banco); sócio PF criado (CPF formatado
      automaticamente na tela), documento anexado a ele, sócio removido e
      confirmado que a linha do sócio E o documento dele sumiram do banco
      juntos (cascade); sócio PJ criado (CNPJ formatado), percentual
      editado ao vivo (40% → 55%, refletindo na tela), removido depois

**Ajuste — botão Societário mais visível + atalho pra consultar CNPJ na Receita (concluído, 2026-08-27)**
- [x] O botão "Societário" na tela de consulta por empresa era `variant="ghost"`
      (texto sem fundo), pouco visível ao lado de "Gerenciar documentos"
      (`variant="secondary"`, com borda) — usuário reportou que não achou o
      botão. Virou `variant="primary"` (preenchido, mesmo peso visual de um
      botão principal)
- [x] Pedido de trazer o "Comprovante de Inscrição e de Situação Cadastral"
      (o PDF oficial que a Receita Federal emite) direto na tela — não dá
      pra automatizar: a consulta oficial exige resolver captcha a cada
      vez, de propósito, pra impedir automação. Não tentei contornar isso.
      Em vez disso, um botão "Consultar CNPJ na Receita ↗"
      (`ConsultarCnpjReceitaButton.tsx`) copia o CNPJ pra área de
      transferência e abre a página oficial
      (`solucoes.receita.fazenda.gov.br`) numa aba nova — usuário só cola,
      resolve o captcha e baixa o PDF de verdade, podendo depois subir esse
      arquivo no Societário ou em "Certidão RFB" de Legalização
- [x] Validado ao vivo: botão "Societário" com destaque de botão principal
      confirmado na tela; botão de CNPJ aparecendo corretamente sob o CNPJ
      formatado. O clique em si (copiar pro clipboard + abrir nova aba) não
      dá pra simular no navegador de automação headless desta sessão —
      `navigator.clipboard.writeText` e `window.open` exigem um gesto de
      usuário genuíno com o documento em foco, que um clique disparado via
      JavaScript não fornece (confirmado isoladamente: a chamada de
      clipboard retornou "Document is not focused", exatamente o erro
      esperado nesse cenário — não um bug do código). Em uso normal, com
      clique real do mouse, as duas chamadas funcionam

**Novo — Chat de IA interno (relatórios e análises do sistema) (concluído, 2026-08-27)**
- [x] Chat de IA só pra staff SOMA (`requireSomaStaff()`), em
      `/admin/chat`, usando Claude Sonnet 5 via Vercel AI SDK (`ai` +
      `@ai-sdk/anthropic` + `@ai-sdk/react`) — nova dependência de API paga
      (`ANTHROPIC_API_KEY`), passo manual já feito (chave criada e
      configurada em `.env.local` + Vercel)
- [x] Decisão de arquitetura: a IA nunca escreve SQL — chama um conjunto de
      ~12 ferramentas parametrizadas (`lib/ai/tools.ts`), cada uma fazendo
      exatamente uma consulta bem definida via `createClient()` (RLS do
      usuário logado, nunca service role). Cobre faturamento por período e
      por código de atividade/serviço (`dps` + `services`), erros de
      emissão de nota, folha mensal, certificados vencendo, pendências de
      legalização, extratos não entregues, sócios/societário, e busca de
      empresa por nome/CNPJ
- [x] Ferramenta extra: a IA consegue **ler o conteúdo real de um
      documento já anexado no sistema** (Legalização, Societário, Extratos)
      — busca o PDF no Vercel Blob e devolve como bloco de documento pro
      Claude ler nativamente (não é extração de texto via `pdf-parse`, é o
      modelo enxergando o PDF de verdade, inclusive tabela/layout/scan),
      pra responder "analisa o alvará da empresa X", "resume a última
      alteração contratual", etc.
- [x] Histórico de conversa persistido por usuário (`chat_ia_conversas` +
      `chat_ia_mensagens`, RLS restringindo cada staff à própria conversa —
      não é compartilhado entre a equipe mesmo todos sendo staff). Cada
      resposta grava um evento resumido em `audit_logs` (`logAudit`, mesmo
      padrão do resto do projeto)
- [x] **Bug real encontrado e corrigido durante o teste ao vivo**: a
      ferramenta de faturamento mensal total (`consultarFaturamentoMensal`)
      não excluía notas com evento de cancelamento (`nfse_events.type =
      'CANCELAMENTO'`), diferente da ferramenta de faturamento por serviço
      que já excluía — resultado: duas notas canceladas de R$1 cada
      estavam sendo contadas como R$2 de faturamento "manual" quando na
      verdade era R$0. Corrigido extraindo um helper `notaValida()`
      compartilhado pelas duas ferramentas
- [x] Validado ao vivo com 3 usuários descartáveis: pergunta real de
      faturamento por código de atividade pra "SOMA Contabilidade
      Integrada LTDA" batendo com consulta direta ao banco (inclusive
      confirmando o bug acima antes de corrigir); leitura de documento real
      (Alvará da 2Z2S) trazendo CNPJ, validade, data de emissão e até uma
      observação sobre CNAEs pendentes de licença — só possível lendo o
      PDF de verdade; acesso barrado tanto pela tela quanto por POST direto
      na API pra usuário não-staff; histórico completamente isolado entre
      dois usuários staff diferentes

**Ajuste — consulta/gerenciar em Extratos e autocomplete de banco (concluído, 2026-08-27)**
- [x] Tela por empresa de Extratos dividida em consulta/gerenciar, mesmo
      padrão já adotado em Legalização: `/extratos/empresas/{id}` virou
      somente leitura (lista de contas + status de entrega do mês atual,
      botão "Gerenciar contas e extratos" em destaque) e
      `/extratos/empresas/{id}/gerenciar` ficou com o cadastro de conta e a
      grade completa de 12 meses que já existia
- [x] Cadastro de conta bancária ganhou autocomplete de banco
      (`SelecionarBancoInput.tsx`, lista estática em `lib/bancos-brasil.ts`
      com ~75 bancos e códigos COMPE/Febraban reais) — digita código ou
      nome, seleciona, e só falta preencher agência e conta. Se o banco não
      estiver na lista (cooperativa local, banco raro), ainda dá pra salvar
      com o nome digitado, só sem código — não trava o cadastro
- [x] Nova coluna `codigo_banco` (nullable) em `extrato_contas_bancarias` —
      contas já cadastradas antes continuam funcionando sem código
- [x] Validado ao vivo: autocomplete filtrando "itau" e mostrando as 3
      entradas certas da lista; conta criada com banco selecionado da lista
      salvando nome + código corretos no banco; conta com banco fora da
      lista salvando só o nome (código null), confirmando o fallback; tela
      de consulta refletindo as 3 contas com status "pendente este mês"
      corretamente

**Ajuste — busca rápida e dados cadastrais na consulta de Extratos (concluído, 2026-08-27)**
- [x] `BuscaRapidaEmpresa` (o campo "Buscar empresa e acessar..." já usado
      em Legalização) virou componente compartilhado
      (`components/BuscaRapidaEmpresa.tsx`, com `basePath`/`placeholder`
      configuráveis) e passou a aparecer também no dashboard de Extratos —
      mesmo princípio: qualquer um da equipe acha a empresa rápido e cai
      direto na consulta dela
- [x] `formatarCnpj`/`formatarEndereco`/`STATUS_PILL_CLASSES` saíram de
      dentro de Legalização e viraram `lib/formatters.ts` (são genéricos,
      nada específico do módulo) — evita duplicar a mesma formatação ao
      trazer o mesmo card pra Extratos
- [x] Tela de consulta por empresa em Extratos
      (`/extratos/empresas/{id}`) ganhou o mesmo card "Dados cadastrais"
      (CNPJ, regime tributário, endereço) já usado em Legalização, e o
      controle mensal deixou de mostrar só o mês corrente — agora mostra os
      últimos 6 meses por conta, com selo "Entregue"/"Pendente" e link de
      baixar quando há arquivo, tudo somente leitura (edição continua em
      "Gerenciar")
- [x] **Dado de teste órfão encontrado e corrigido durante a validação**:
      uma operação de teste de sessões anteriores tinha marcado o tipo real
      "Certidão RFB" como não aplicável pra 203 das 206 empresas (claramente
      um teste do recurso "restringir tipo a empresas selecionadas" salvo
      sem querer sobre um tipo de produção, não um tipo de teste) — apagadas
      as 203 linhas de exceção, tipo voltou a se aplicar normalmente a
      todas
- [x] Validado ao vivo: busca rápida funcionando no dashboard de Extratos;
      card de dados cadastrais e controle de 6 meses corretos na consulta;
      confirmado que Legalização continua funcionando normalmente após o
      refactor dos helpers compartilhados

**Ajuste — grade de meses em colunas e período de controle por conta (concluído, 2026-08-27)**
- [x] Controle mensal na consulta de Extratos virou uma grade (mês em cima,
      selo Entregue/Pendente embaixo, lado a lado — `grid grid-cols-3
      sm:grid-cols-4 md:grid-cols-6`) em vez da lista vertical anterior
- [x] Cada conta bancária ganhou período de controle próprio —
      `data_inicio_controle`/`data_fim_controle` (nullable) em
      `extrato_contas_bancarias`. Sem essas datas, continua valendo o
      padrão de sempre (últimos 6 meses na consulta, 12 no gerenciar);
      com elas, a janela de meses mostrada (nas duas telas) fica limitada
      ao período real da conta — útil pra conta aberta há pouco tempo ou já
      encerrada. Nova função `competenciasNoIntervalo()` em
      `lib/competencia.ts` (com trava de 5 anos contra intervalo
      configurado errado)
- [x] Formulário de nova conta ganhou os dois campos (opcionais); contas já
      existentes ganham um mini-formulário inline
      (`PeriodoContaForm.tsx`) na tela de gerenciar pra setar/editar o
      período depois, sem precisar recriar a conta
- [x] Validado ao vivo: grade em colunas confirmada geometricamente (todos
      os meses na mesma linha, selo na linha de baixo, mesma coluna X);
      período aplicado a uma conta (início = 06/2026) reduziu a lista de 12
      pra 3 meses no gerenciar e de 6 pra 3 na consulta, refletindo em
      tempo real nas duas telas; conta sem período configurado manteve o
      padrão de sempre

**Ajuste — conciliação de extrato, evidência de empresa recém-aberta e
categorias no Societário (concluído, 2026-08-27)**
- [x] `extratos_mensais` ganhou a coluna `conciliado` (boolean, independente
      de `entregue`) — "entregue" é só o cliente ter mandado o extrato,
      "conciliado" é o time contábil ter batido esse extrato com o razão.
      Checkbox próprio no gerenciar, selo próprio (embaixo do selo
      Entregue/Pendente) na grade de consulta
- [x] Visão geral da Legalização reordenada: "Ranking de empresas por
      cidade" passou pra depois de "Documentos de legalização vencidos...
      separado por tipo" (antes vinha logo após os KPIs)
- [x] Nova seção "Empresas abertas nos últimos 90 dias com documentação
      pendente" na Visão geral da Legalização — usa a `data_abertura` já
      cadastrada da empresa (helper `ehRecente()`, extraído pra fora do
      componente por causa da regra de lint `react-hooks/purity` contra
      `Date.now()` direto no corpo do componente, mesmo padrão já usado por
      `diasAteVencer()`). Só aparece quando existe pelo menos uma empresa
      recente com pendência, logo após os KPIs e antes de Certificados
- [x] Societário ganhou duas categorias novas de documento, além do
      histórico (contrato social + alterações) que já existia: **IPTU**
      (validade indeterminada, aceita vários arquivos ao longo do tempo) e
      **Outros documentos** (repositório livre — contrato de locação e
      qualquer outro documento societário relevante). Implementado como
      coluna `categoria` (check constraint) em `societario_documentos`
      em vez de tabelas novas — reaproveita 100% do upload/download/exclusão
      já existente, só filtra e separa visualmente em três seções
- [x] Validado ao vivo com usuário descartável: "Conciliado" marcado
      independente de "Entregue" num mês real, refletindo corretamente nos
      dois selos da consulta; ordem das seções da Visão geral da Legalização
      conferida (Certificados → Documentos vencidos → Ranking de cidades →
      Ranking de documentação incompleta); seção de empresa recém-aberta
      aparecendo com a pendência certa ao simular uma `data_abertura`
      recente numa empresa real; documento salvo em cada uma das três
      categorias do Societário aparecendo só na seção correspondente, e
      categoria inválida rejeitada pelo check constraint do banco

**Ajuste — Contatos por setor no cadastro geral do cliente (concluído,
2026-08-27)**
- [x] Nova aba "Contatos" no cadastro geral da empresa (`/admin/empresas/
      {id}/contatos`, ao lado de "Usuários") — telefone/e-mail de quem
      recebe cada tipo de assunto por setor (Pessoal, Fiscal, Financeiro
      etc., campo livre com sugestões via `datalist`), pra não depender de
      descobrir isso de memória a cada contato com o cliente
- [x] Tabela `company_contatos_setor` nova (não módulo-específica — vive no
      cadastro geral, mesmo padrão de acesso de `certificates`/`services`:
      só staff SOMA lê e escreve). CRUD completo (criar, editar, remover)
      no mesmo padrão inline já usado em Sócios (Societário)
- [x] Validado ao vivo: contato criado, editado e removido com sucesso via
      usuário staff descartável; usuário com papel `ANALISTA_LEGALIZACAO`
      barrado da rota (redirecionado pro próprio módulo dele, não chega
      no `/admin`)

**Ajuste — Cofre de senhas por empresa (concluído, 2026-08-27)**
- [x] Credenciais reais que o cliente entrega (gov.br, portal do ISS
      municipal, conselho profissional/Cremerge etc.) — cifradas em repouso
      com o mesmo esquema AES-256-GCM já usado pro certificado digital
      (`encryptSecret`/`decryptSecret`/`toBytea`/`fromBytea`, reaproveitados
      de `lib/certificate.ts` sem alteração — já eram genéricos, não
      específicos de certificado apesar do nome do arquivo)
- [x] Modelo de acesso perguntado ao usuário antes de implementar, por ser
      dado sensível de verdade: cadastrar/editar/apagar fica restrito à
      SOMA completa (`/admin/empresas/{id}/cofre-senhas`, nova aba);
      **consultar e revelar** (decifrar sob demanda) também é liberado pro
      Analista de Legalização (`/legalizacao/empresas/{id}/cofre-senhas`,
      somente leitura + botão "Revelar") — pedido explícito do usuário
      ("consultar isso lá na legalização"), mas nenhum outro papel
      (ex.: Analista Contábil) tem acesso a nenhuma das duas rotas
- [x] Toda revelação de senha grava evento `REVEAL` em `audit_logs` (quem,
      quando, qual serviço — nunca a senha em si), decisão confirmada com o
      usuário antes de implementar. Criar/editar/apagar também logam
      normalmente, sempre sem o valor da senha no log
- [x] `RevelarSenhaButton` compartilhado entre as duas telas
      (`components/RevelarSenhaButton.tsx`) — botão "Revelar" chama a
      Server Action, mostra a senha em texto claro só depois do clique, com
      "Esconder" pra voltar a ocultar
- [x] Validado ao vivo com três usuários descartáveis: staff criou uma
      senha, revelou (valor decifrado batendo exatamente com o que foi
      digitado) e a revelação apareceu em `/admin/logs` com usuário, ação
      `reveal` e empresa corretos; Analista de Legalização acessou a
      consulta e revelou a mesma senha com sucesso; Analista Contábil
      (papel do módulo Extratos, sem relação com Legalização) barrado da
      rota, redirecionado pro próprio módulo dele

**Ajuste — Varredura de `data_abertura` via Brasil API (concluído,
2026-08-27)**
- [x] `lib/cnpj-lookup.ts` (já usado no cadastro manual de empresa e na
      importação em lote) passou a extrair também `data_inicio_atividade`
      da Brasil API (`dataAbertura` no tipo `DadosCnpj`) — sem isso, a seção
      "Empresas abertas nos últimos 90 dias" da Legalização não tinha como
      funcionar de verdade, já que nenhuma empresa tinha essa data
      preenchida
- [x] Rodada uma varredura única (script descartável, não fica no repo)
      em todas as 202 empresas com CNPJ e sem `data_abertura` cadastrada —
      201 atualizadas com sucesso, 1 falhou por CNPJ com dígito verificador
      inválido já cadastrado no sistema (`ASSOSCIAÇÃO BRASILEIRA DE
      ESTUDOS E DOENÇAS IMUNO`, CNPJ `36.204.726/0001-66` — precisa de
      correção manual do CNPJ pra poder ser consultado)

**Fase Q — Cliente Pessoa Física (cadastro + emissão de NFS-e como
autônomo) (concluído, 2026-08-27)**
- [x] `companies` ganhou `person_type` (reaproveita o enum `customer_type`
      'PF'/'PJ' que já existia só pra `customers`) e `cpf`, com check
      constraint garantindo que só um dos dois documentos (CNPJ ou CPF)
      é preenchido conforme o tipo
- [x] **Achado que reduziu bastante o risco da mudança**: o padrão nacional
      da DPS já foi projetado com CPF-prestador em mente — `_tipo_
      inscricao_federal` (`backend/dps_builder.py`) já detecta CPF/CNPJ
      genericamente pelo tamanho, o domínio de `regEspTrib` já tem o código
      5 = "Profissional Autônomo", e o bloco `<toma>` (tomador) já emitia
      `<CPF>`/`<CNPJ>` condicionalmente. Só faltava o bloco `<prest>`
      (prestador), ainda hardcoded pra CNPJ — ajustado pra aceitar 11 ou 14
      dígitos e emitir a tag certa, espelhando exatamente o que já existia
      pro tomador. Nenhuma outra mudança foi necessária no backend:
      `opSimpNac` já cai em "não optante" quando não há regime tributário
      (que é o caso de toda empresa PF), sem precisar de nenhum código novo
- [x] Testado isoladamente (sem precisar de certificado real): chamada
      direta a `gerar_xml_dps()` com CPF de teste como prestador, conferindo
      que o XML sai com `<CPF>` (não `<CNPJ>`) dentro de `<prest>` e que o
      `Id` da DPS usa `tpInsc=1` — e que o caminho CNPJ/PJ de sempre
      continua gerando exatamente igual a antes
- [x] `NewCompanyForm.tsx` ganhou um toggle "Tipo de pessoa" — quando PF,
      troca CNPJ+busca automática por CPF simples (sem API pública
      equivalente por sigilo), "Razão social" vira "Nome completo", esconde
      CNAE/Regime tributário, e os campos de endereço (que antes só
      existiam ocultos, preenchidos pela busca de CNPJ) viram Inputs
      visíveis pra digitação manual — sem isso um cliente PF nunca teria
      endereço nem código IBGE do município cadastrado
- [x] Aba "Dados fiscais" esconde, pra empresa PF, o Select de Regime
      Tributário e a seção inteira de "Cálculo de imposto" (Simples
      Nacional/Fator R, Lucro Presumido/IRPJ-CSLL) — nenhum dos dois existe
      pra autônomo (ele paga IRPF via carnê-leão, não regime corporativo).
      Novo cadastro PF já vem com "Regime especial de tributação" pré-
      selecionado em "5 - Profissional Autônomo"
- [x] Emissão e cancelamento de nota (`notas.ts`) trocaram o gate/payload
      de `company.cnpj` isolado pelo novo helper `documentoEmpresa()`
      (CNPJ ou CPF, o que estiver preenchido) — mesmo ajuste replicado em
      `sync-notas.ts` (sincronização diária de notas distribuídas)
- [x] Toda tela que mostrava só "CNPJ" (lista de empresas, cabeçalho do
      cadastro, portal do próprio cliente, cards de consulta em Legalização
      e Extratos) passou a mostrar o rótulo e o valor certos (CNPJ ou CPF)
      via `formatarDocumentoEmpresa()`
- [x] **Fora do escopo desta rodada, sinalizado no código/commit**:
      importação de fechamento por XML e o restante de `sync-notas.ts`
      continuam com alguns pontos assumindo CNPJ — não bloqueiam o pedido
      (cliente PF novo não tem histórico externo pra importar ainda), mas
      precisam de atenção quando o primeiro cliente PF de verdade chegar
      nessa etapa
- [x] Validado ao vivo com usuário descartável: empresa PF criada com CPF
      (`111.444.777-35`) e endereço manual; CPF aparecendo corretamente em
      todas as telas (inclusive busca por CPF na lista de empresas); aba
      Dados fiscais sem as seções de Simples/Presumido e com regime
      especial 5 pré-selecionado; fluxo completo de emissão (tomador +
      serviço reais, formulário de 2 passos) avançando sem bloqueio pelo
      gate de CNPJ/CPF+município e parando exatamente no próximo bloqueio
      legítimo ("certificado digital não cadastrado") — confirma que o
      relaxamento do gate funciona ponta a ponta pela UI real, sem precisar
      forjar um certificado/assinatura de verdade
- [ ] **Ainda não validado**: aceite real do Sefin Nacional pra um
      prestador Pessoa Física — como em todo o resto do motor fiscal deste
      projeto, a estrutura do XML foi conferida campo a campo contra o
      padrão nacional, mas nunca contra uma emissão de valor real aceita em
      produção. Testar com cautela redobrada (ambiente de homologação
      primeiro) assim que houver um certificado real de pessoa física
      disponível

**Ajuste — Importação em lote de cliente Pessoa Física (concluído,
2026-08-27)**
- [x] Usuário testou a importação de planilha logo depois da Fase Q e viu
      67 linhas rejeitadas com "Sem CNPJ preenchido" — eram clientes Pessoa
      Física, que só tinham CPF na planilha. `importarEmpresasPlanilha`
      (`lib/actions/empresas.ts`) passou a aceitar uma coluna `cpf` junto
      da `cnpj` (cada linha usa uma ou outra, nunca as duas): valida o
      checksum do CPF (`isCpfValido`), não tenta nenhuma busca automática
      (não existe API pública de CPF por sigilo — por isso a coluna
      "nome" é obrigatória só pra linha de CPF), e grava
      `person_type: 'PF'` + `regime_especial_tributacao: 5` igual ao
      cadastro manual da Fase Q
- [x] Texto da tela de importação atualizado explicando as duas colunas
      possíveis
- [x] Validado contra o banco real (upload de arquivo não é automatizável
      no navegador headless desta sessão, então a lógica foi replicada
      linha a linha num script contra o Supabase de verdade — mesmas
      chamadas, mesmas condições do código): CPF válido cria a empresa
      corretamente com `person_type`/`cpf`/regime especial certos; CPF com
      checksum inválido (`111.111.111-11`) rejeitado com a mensagem
      esperada; linha sem CNPJ nem CPF rejeitada com a mensagem esperada
- [x] **Confirmado ao vivo em produção**: usuário reimportou a planilha com
      as 67 linhas de CPF depois do ajuste e todas entraram — indicador
      novo (ver ajuste seguinte) mostrando exatamente 67 empresas PF logo
      em seguida

**Ajuste — Indicador de CNPJ × CPF na Visão geral (concluído, 2026-08-27)**
- [x] Card "Empresas cadastradas" da Visão geral (`/admin`) ganhou uma
      linha de detalhamento "N CNPJ · M CPF" logo abaixo do total, contando
      `person_type` de cada empresa — sem precisar abrir a lista pra saber
      a proporção de clientes Pessoa Física
- [x] Validado ao vivo contra dado real de produção: total de 273 empresas
      detalhado corretamente como 206 CNPJ · 67 CPF (batendo com a
      reimportação da planilha do ajuste anterior)

**Correção — Retry em falha de conexão/TLS na sincronização de notas
(concluído, 2026-08-27)**
- [x] Usuário reportou "não busca notas" numa empresa (VERSATILE
      ODONTOLOGIA), com o erro "Falha no handshake TLS com certificado do
      cliente (mTLS)" contra `adn.nfse.gov.br`. Investigação nos logs de
      `ultima_sincronizacao_erro` de TODAS as empresas mostrou o padrão
      real: no mesmo dia, empresas diferentes — com certificados
      diferentes, incluindo o da própria SOMA (certificado validado há
      meses, usado desde a primeira emissão real do sistema) — tomaram o
      mesmo tipo de erro (SSLError ou conexão resetada) em horários
      distintos. **Não é certificado inválido de ninguém — é instabilidade
      intermitente do lado do `adn.nfse.gov.br`**, o mesmo tipo de
      comportamento já documentado neste projeto pro endpoint de DANFSe
- [x] `nfse_client.py` (`_get_com_retry`) já tinha retry com backoff pra
      erros HTTP temporários (429/502/503/504), mas erros de conexão/TLS
      (que acontecem ANTES de qualquer resposta HTTP chegar — `SSLError`,
      conexão resetada, timeout) iam direto pro erro final, sem nenhuma
      segunda tentativa. Adicionado retry curto (até 3 tentativas, backoff
      exponencial de poucos segundos) especificamente pra esses casos,
      igual ao raciocínio já usado pro 429 — só que com tolerância bem
      menor, já que não é rate-limit, é só dar uma segunda chance pra uma
      instabilidade passageira
- [x] Testado isoladamente com sessão HTTP simulada (sem precisar de
      certificado real nem depender do `adn.nfse.gov.br` estar instável na
      hora do teste): `SSLError` intermitente seguido de sucesso passa a
      funcionar (antes falhava direto); `SSLError`/conexão resetada
      persistentes além do limite ainda levantam o erro final, com a
      mensagem agora deixando claro que já tentou de novo
- [ ] **Atenção**: este backend roda separado do frontend (Railway, via
      `backend/Procfile`) — não tenho acesso ao CLI/dashboard do Railway
      pra confirmar ou disparar o redeploy como fiz com o Vercel do
      frontend. Confirme que o deploy do backend pegou essa mudança antes
      de considerar o problema resolvido

**Correção — Retry insuficiente + suspeita de conexão "grudada" (concluído,
2026-08-27)**
- [x] O retry de 3 tentativas acima chegou a rodar em produção (confirmado
      pela própria mensagem de erro, que já dizia "persistente após 3
      tentativas" — prova de que o deploy do Railway pegou a mudança) mas
      não foi suficiente pra VERSATILE: as 3 tentativas (~14s no total)
      esgotaram e a falha continuou. Cruzando os horários de TODOS os
      certificados × resultado de sincronização, ficou claro que não é
      "certificado recém-cadastrado que falha" — dezenas de certificados
      cadastrados na mesma hora sincronizaram com sucesso; os poucos que
      falharam (incluindo a própria SOMA, certificado de semanas atrás)
      estão espalhados sem relação com quando o certificado foi cadastrado
- [x] Usuário levantou a hipótese de "algum cache" — motivada por outro
      sistema (fora deste projeto) conseguir falar com o mesmo servidor
      usando o mesmo tipo de certificado sem problema. Levou a uma segunda
      causa real, já documentada no próprio código (`certificado.py`,
      `_AdaptadorTLS12`): esse endpoint do governo (`adn.nfse.gov.br`) é
      conhecido por só aceitar TLS 1.2 vindo desse cliente Python — e o
      `requests.Session`/urllib3 reaproveita a mesma conexão (e a mesma
      resolução de IP, se o servidor responde por múltiplos servidores
      atrás de um balanceador) entre tentativas de retry. Se uma tentativa
      grudar num caminho ruim, toda tentativa seguinte usando a MESMA
      sessão bate na mesma conexão quebrada — o que bate exatamente com
      "sempre falha pra essa empresa, nunca melhora sozinho"
- [x] Duas mudanças em `nfse_client.py`: (1) limite de tentativas por falha
      de conexão/TLS subiu de 3 pra 5 (backoff também subiu o teto, de 15s
      pra 20s); (2) nova `_recriar_sessao()` — fecha a sessão atual e monta
      uma completamente nova (nova pool de conexão, nova resolução de DNS,
      novo handshake) a cada tentativa de retry por conexão/TLS, em vez de
      reusar `self._session` (que só é recriada por padrão uma vez, na
      criação do cliente)
- [x] Testado isoladamente (sessão HTTP simulada, sem depender de rede
      real): confirmado que cada tentativa de retry agora passa por um
      objeto de sessão genuinamente diferente — nunca reaproveitando a
      sessão que acabou de falhar — e que o novo limite de 5 tentativas é
      respeitado antes de desistir
- [ ] Mesma ressalva de antes: confirme que o Railway já publicou essa
      segunda correção antes de testar de novo

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

**Correção — "Buscar últimos 12 meses (todas)" estourando o tempo limite do
servidor (concluído, 2026-08-31)**
- [x] Com 138 empresas já com certificado cadastrado, o botão "Buscar
      últimos 12 meses (todas)" em `/admin/fechamento` passou a falhar com
      um erro genérico de página ("This page couldn't load"). Causa: a
      Server Action `buscarHistoricoTodasAgora` escaneava as ~140 empresas
      em sequência dentro de uma ÚNICA requisição — cada empresa pode levar
      dezenas de segundos (histórico de 12 meses + retry em caso de
      instabilidade do `adn.nfse.gov.br`), então o total passou do tempo
      limite de execução da função serverless (`maxDuration = 300`, na
      página) assim que o número de empresas cresceu o suficiente
- [x] Reescrito pra rodar uma empresa por vez a partir do navegador
      (`BuscarHistoricoTodasButton.tsx` chama a Server Action já existente
      `buscarHistoricoAgora` — a mesma usada pelo botão de uma empresa só —
      em loop sequencial), com barra de progresso ("X/138 — nome da
      empresa") em vez de uma tela travada até o fim. Nenhuma requisição
      individual passa perto do tempo limite, então o problema não volta
      nem com o número de empresas continuando a crescer. A Server Action
      antiga que fazia tudo de uma vez foi removida (ficou inútil e
      arriscada de reintroduzir o mesmo bug)
- [x] **Ajuste correlato, ainda não corrigido**: o botão "Buscar todas
      agora" (mês corrente, não o histórico de 12 meses) usa o mesmo padrão
      antigo — mais leve por escanear só um mês, mas sujeito ao mesmo
      problema conforme o número de empresas continuar crescendo. Mesma
      solução se aplicaria lá quando for necessário
- [x] Validado ao vivo com usuário descartável: as 138 empresas passaram
      uma por vez, progresso atualizando em tempo real, resumo final
      correto. Como o teste rodou contra o backend local (não disponível),
      todas retornaram erro esperado — isso também sujou o campo "última
      sincronização" das 138 empresas reais no banco (mesmo projeto do
      `.env.local` de produção); restaurado o valor original de cada uma a
      partir do backup de `backups/2026-08-28_0041/` feito horas antes

**Correção — mesmo problema no "Buscar todas agora" e no cron diário
(concluído, 2026-09-01)**
- [x] Usuário reportou o mesmo erro de tempo limite no botão "Buscar todas
      agora" (mês corrente, ao lado do de 12 meses) — corrigido do mesmo
      jeito: `BuscarTodasButton.tsx` passou a rodar uma empresa por vez a
      partir do navegador (reaproveitando a Server Action `buscarAgora` já
      existente), com progresso em tempo real. A Server Action antiga
      (`buscarTodasAgora`, que escaneava tudo numa chamada só) foi removida
- [x] **Investigando o botão, achei o mesmo problema também no cron
      diário** (`/api/cron/sync-notas`, roda 1x por dia via
      `vercel.json`) — e aqui **corrigi minha própria conclusão em tempo
      real**: a primeira leitura (105 de 183 empresas sincronizadas,
      parado havia ~30min) parecia confirmar que o cron trava no limite de
      300s e abandona o resto silenciosamente. Investigando mais fundo
      (checando de novo minutos depois), o cron antigo continuava
      avançando — ele não estava travado, só **extremamente lento**: uma
      única execução rodando havia mais de 40 minutos, bem além do
      `maxDuration = 300` declarado no código (o valor real permitido
      nesse ambiente aparentemente é maior, ou não é estritamente
      aplicado a Cron Jobs). Ele de fato terminou sozinho, chegando a
      182 de 183. Ainda assim, depender de uma única execução de 40+
      minutos é frágil (qualquer instabilidade no meio derruba o processo
      inteiro sem nenhum progresso salvo), então a correção (lotes
      encadeados) segue válida e foi mantida
- [x] `syncAllCompanies` (`lib/sync-notas.ts`) ganhou paginação opcional
      (`{ offset, limite }`) — sem ela, comportamento idêntico a antes,
      compatível com qualquer outro uso futuro. `app/api/cron/sync-notas/
      route.ts` passou a processar lotes de 20 empresas por chamada e,
      antes de responder, agenda a chamada do próximo lote via `after()`
      (API nativa do Next.js 16 pra trabalho em segundo plano depois da
      resposta) — nenhuma chamada individual nem chega perto do tempo
      limite, e o processo continua mesmo se uma chamada específica falhar
      (só aquele lote fica incompleto, não a sincronização inteira)
- [x] Validado ao vivo: disparado manualmente contra o servidor local,
      confirmado nos logs que cada lote (offset 0, 20, 40... até 260)
      disparou o próximo sozinho via `after()`, cobrindo as 273 empresas
      cadastradas em ~14 chamadas encadeadas, cada uma respondendo em menos
      de 2 segundos
- [x] **Efeito colateral do teste, corrigido**: como o teste local ainda
      aponta pro banco de produção, ele sobrescreveu o campo "última
      sincronização" de ~159 empresas com o erro de teste ("fetch failed",
      esperado sem o backend rodando local) bem na hora em que o cron real
      de produção estava terminando de verdade. Só afeta o texto informativo
      de "última sincronização" — nenhuma nota real foi perdida ou duplicada
- [x] **Achado de segurança real, corrigido no processo**: tentei disparar o
      cron corrigido direto contra produção pra já sobrescrever o dado
      sujo, e percebi que `CRON_SECRET` nunca tinha sido configurado no
      Vercel (só existe localmente) — provavelmente um esquecimento no
      setup inicial. Pior: o código antigo comparava contra
      `` `Bearer ${process.env.CRON_SECRET}` ``, e com a variável ausente
      isso vira literalmente a string `"Bearer undefined"` — confirmado ao
      vivo que mandar esse header exato passava pela autenticação e
      disparava a sincronização de verdade, sem segredo nenhum. Corrigido
      o código pra falhar fechado (nunca autoriza se `CRON_SECRET` não
      estiver configurado) e comparar em tempo constante
      (`crypto.timingSafeEqual`, evita timing attack) em vez de `!==`
      direto — e configurado um `CRON_SECRET` de verdade em produção
      (gerado aleatoriamente, 32 bytes)
- [x] Disparei o cron corrigido contra produção pra reprocessar as ~159
      empresas sujas pelo teste — confirmado que corrigiu todas (verificado
      contra o banco em tempo real, acompanhando o progresso)

**Correção — "Baixar tudo (ZIP)" também estourava o tempo limite (concluído,
2026-09-01)**
- [x] Mesmo dia, mesmo padrão: usuário reportou 504 Gateway Timeout ao
      clicar em "Baixar tudo (ZIP)" no Fechamento. Causa raiz diferente das
      anteriores (não é rede instável, é volume real): a rota gerava um PDF
      (DANFSe) por nota chamando o backend sequencialmente, uma de cada vez
      — e agosto/2026 sozinho já tem **3.603 notas**. Nenhuma quantidade de
      paralelismo dentro de uma única resposta HTTP resolveria isso de
      forma duradoura, então virou um job em lotes por empresa, com
      progresso, em vez de tentar tudo numa chamada só
- [x] Nova tabela `exportacoes_fechamento` (status, progresso, caminho do
      ZIP final no Blob). `iniciarExportacaoFechamento` cria o job listando
      só as empresas que têm nota na competência (evita processar quem não
      tem nada pra exportar). `processarEmpresaExportacao` — chamada uma
      empresa por vez a partir do navegador, mesmo padrão dos outros
      consertos de hoje — gera o ZIP daquela empresa (XML + PDF de cada
      nota, com até 8 chamadas de PDF em paralelo já que é renderização
      local no backend, não bate em servidor do governo) e guarda no Vercel
      Blob. `finalizarExportacaoFechamento` junta os ZIPs de cada empresa
      num ZIP final, apaga os intermediários, e marca o job como pronto
- [x] `ExportarZipButton.tsx` mostra "X/Y empresas" durante o processamento
      e um link de download quando terminar — a rota antiga
      (`/admin/fechamento/exportar`, tudo numa chamada só) foi removida
- [x] Validado ao vivo contra dado real de produção (agosto/2026): job
      completo do início ao fim, ZIP final baixado com sucesso (sem os
      PDFs — backend local não estava disponível pro teste, mas o XML de
      cada nota, que é o documento fiscal válido, saiu certo), confirmado
      que os ZIPs intermediários de cada empresa foram apagados do Blob
      depois da junção

**Correção — exportação perdendo empresa silenciosamente (concluído,
2026-09-01)**
- [x] Usuário reportou que o ZIP de agosto/2026 só trouxe 26 empresas —
      número exatamente igual ao do meu teste de validação, o que já era
      suspeito. Causa: `iniciarExportacaoFechamento` buscava as empresas
      com nota via um `.select("company_id")` sem paginar contra
      `notas_distribuidas` — e o PostgREST (por trás do Supabase) corta
      silenciosamente qualquer consulta sem `.range()` em 1000 linhas. Com
      3.603 notas em agosto, só as primeiras 1000 (26 empresas) entravam
      na exportação — as outras 91 empresas ficavam de fora sem erro
      nenhum. Esse é o mesmo bug já documentado em `lib/supabase/
      paginacao.ts`, que existe justamente por essa tabela já ter causado
      isso antes na Visão geral — eu simplesmente não usei o helper que já
      existia pra isso
- [x] Corrigido usando `buscarTudoPaginado` (já usado em outros lugares do
      projeto) tanto na consulta de "quais empresas têm nota" quanto na
      consulta de notas por empresa dentro de `gerarZipDaEmpresa` (essa
      segunda não tinha esse problema ainda — nenhuma empresa isolada
      passou de 1000 notas num mês —, mas corrigida por segurança, já que o
      custo de paginar é zero)
- [x] Validado ao vivo: reconferido o número certo de empresas com nota em
      agosto/2026 direto no banco com paginação manual (117, não 26) e
      rodado o "Baixar tudo (ZIP)" de novo do zero — progresso foi
      corretamente até 117/117 e o ZIP final saiu com todas. Job e arquivo
      de teste removidos depois de validado

**Correção — clientes Pessoa Física ficando de fora da exportação de ZIP
(concluído, 2026-09-01)**
- [x] Rodando contra o backend real em produção pra validar o retry acima,
      117/117 empresas foram processadas mas **18 continuaram fora do ZIP
      mesmo depois de 3 tentativas cada** — não era mais falha transitória
      (retry não resolve algo estrutural). As 18 eram todas clientes
      Pessoa Física (confirmado no banco: `cnpj: null, cpf: <valor>,
      person_type: 'PF'`)
- [x] Causa: `gerarZipDaEmpresa` (`lib/fechamento-export.ts`) tinha
      `if (!company.cnpj) return null` — rejeitava silenciosamente
      qualquer cliente PF, mesmo que sinceramente tivesse nota de verdade
      naquele mês. Exatamente o tipo de lacuna já sinalizada na Fase Q
      ("fechamento.ts... continua assumindo CNPJ"), só que dessa vez numa
      função escrita DEPOIS da Fase Q — eu esqueci de aplicar o mesmo
      helper (`documentoEmpresa()`) que já uso em `notas.ts`/`sync-notas.ts`
      pra esse exato problema
- [x] Corrigido: `gerarZipDaEmpresa` e o select de `processarEmpresaExportacao`
      passaram a considerar `cpf` também, via `documentoEmpresa()`
- [x] Validado ao vivo: rodado "Baixar tudo (ZIP)" de novo contra produção
      pra agosto/2026 — `exportacoes_fechamento` fechou em 117/117
      (`progresso_atual = progresso_total`, sem nenhuma falha), e conferido
      byte a byte que o ZIP final contém a pasta das 17 empresas PF que
      antes falhavam e que de fato têm nota em agosto (a 18ª do diagnóstico
      original, "Mauriano Machado Ferraz (CEI)", conferida direto no banco:
      zero notas em agosto — corretamente fora do ZIP, mesmo comportamento
      que qualquer empresa PJ sem nota no mês teria)
- [x] Achado à parte durante essa validação (não é do escopo desta
      correção, sinalizado como próximo passo): duas empresas com
      `trade_name`/`legal_name` idênticos ("CLINICA MEDICA AMILCAR MARTINS
      BETTINI LTDA", cadastros diferentes) fazem `gerarZipDaEmpresa` colidir
      no mesmo nome de pasta dentro do ZIP final — `zip.folder(nomeArquivo(...))`
      não desambigua por `company.id`. Não perde dado (os arquivos das duas
      entram, só ficam misturados na mesma pasta), mas confunde quem abre o
      ZIP. Ajuste natural: incluir um sufixo curto do `company.id` no nome
      da pasta quando houver colisão

**Fase U — Integração MIT (IRPJ/CSLL/PIS/COFINS) pra Lucro Presumido
(concluído, 2026-09-01, pendente aplicar migration)**
- [x] Pedido: automatizar o envio do MIT (Módulo de Inclusão de Tributos)
      pelo Integra Contador pra gerar as guias de IRPJ/CSLL/PIS/COFINS de
      clientes Lucro Presumido — hoje feito manualmente pelo contador no
      e-CAC. O terreno já estava preparado: o conector `integra-contador/`
      já tinha os 2 serviços de consulta do MIT prontos
      (`LISTAAPURACOES317`/`CONSAPURACAO316`) e catalogava (sem expor) o
      serviço de declarar (`MIT.ENCAPURACAO314`)
- [x] A documentação pública da Serpro pro MIT não detalha em tabela 4
      campos de domínio que o payload exige (`QualificacaoPj`,
      `TributacaoLucro`, `RegimePisCofins`, e os códigos de receita de
      cada tributo) — só dá exemplos soltos. Em vez de arriscar um
      palpite numa declaração com efeito legal real, consultei ao vivo
      (via os 2 serviços de consulta que já existiam) as apurações do MIT
      já encerradas de 5 clientes Lucro Presumido reais da SOMA, em
      múltiplos períodos de 2025 e 2026 — todos idênticos:
      `QualificacaoPj=1`, `TributacaoLucro=3`, `RegimePisCofins=2`,
      códigos de débito IRPJ `208901`, CSLL `237201`, PIS `810902`,
      COFINS `217201`. De quebra, confirmei ao vivo que IRPJ/CSLL só
      aparecem no mês de fechamento do trimestre (PIS/COFINS sempre
      mensais) — validando a mesma regra que já estava em
      `calculo-impostos.ts`
- [x] `calculo-impostos.ts` ganhou `valoresDevidosNoPeriodoMit()` —
      diferente de `calcularLucroPresumido()` (que sempre mostra a
      estimativa do MÊS pra exibição), essa calcula o valor REALMENTE
      devido no período pra fins de declarar: zera IRPJ/CSLL nos meses
      que não são fechamento de trimestre (a não ser que a empresa tenha
      antecipação mensal habilitada)
- [x] Backend (`integra-contador/`): 3 endpoints novos —
      `POST /mit/apuracao/declarar` (`ENCAPURACAO314`, nunca cacheado,
      efeito legal real), `GET /mit/situacao-encerramento/{protocolo}`
      (`SITUACAOENC315`, TTL de cache reduzido pra 30s pra servir
      polling), `GET /dctfweb/guia/{ano}/{mes}` (`DCTFWEB.GERARGUIA31` —
      o encerramento do MIT vira declaração da DCTFWeb por baixo dos
      panos, então a guia sai por lá, não por um serviço próprio do MIT).
      `ResponsavelApuracao` (contador da SOMA, não a empresa cliente) é
      preenchido no backend a partir de env vars novas
      (`SOMA_CONTADOR_*`), nunca vindo do frontend
- [x] Frontend: `lib/mit-declaracao.ts` (payload builder puro, mesmo
      molde de `pgdas-declaracao.ts`) + rotas
      `mit/declarar`/`mit/situacao/{protocolo}`/`mit/guia/{ano}/{mes}`
      (mesmo padrão de nunca confiar em payload vindo do navegador — o
      valor devido é sempre remontado a partir do faturamento real) +
      `DeclararMitCard.tsx` na aba Impostos, com confirmação explícita
      antes de encerrar (o MIT não tem modo de simulação como o PGDAS-D —
      todo `ENCAPURACAO314` já tem efeito real) e polling do status até
      ENCERRADA
- [x] Nova tabela `integra_contador_mit_encerramentos` (migration
      `20260901220000_fase_u_mit_encerramentos.sql`) — histórico auditável
      de exatamente o que foi declarado em nome de cada cliente, e permite
      a UI mostrar "já encerrado esse mês" mesmo depois de um refresh da
      página
- [ ] **Migration ainda não aplicada em produção** — `npx supabase db
      push --linked` precisa ser rodado manualmente (bloqueado pelo
      classificador de permissões do Claude Code neste ambiente). Até lá,
      o card na aba Impostos funciona normalmente pra encerrar/consultar
      (a escrita/leitura do histórico é melhor esforço, com try/catch —
      não quebra o fluxo principal), só o "lembrar entre refreshes" fica
      inativo
- [x] **Validação ao vivo contra produção — 6 rodadas de correção até a
      primeira apuração real sair (ORTOP, competência 2026-08)**:
      1) `ResponsavelApuracao` vazio (env vars nunca configuradas no
      Railway — resolvido movendo pra `configuracao_contador_responsavel`
      dentro do app, só SUPER_ADMIN edita, ver Fase U abaixo); 2) faltava
      `DadosIniciais.VariacoesMonetarias` (campo obrigatório que a doc
      pública não deixa claro — valor `2` confirmado em apurações reais
      já encerradas); 3) sobrava `DadosIniciais.RegimePisCofins` (só
      aparece ao CONSULTAR uma apuração — a Receita deriva sozinha, não
      se envia); 4) `TransmissaoImediata` só pode ser enviado quando
      `SemMovimento=true`; 5) `ValorDebito` chegava com erro de ponto
      flutuante do JS (391.90788000000003 em vez de 391.91) — Serpro só
      aceita 2 casas, corrigido com round2(); 6) o protocolo de
      encerramento (base64, com `/`) quebrava o polling de status por
      não estar com `encodeURIComponent` na chamada do navegador. De
      quebra, corrigido `serpro_client.py` pra extrair o array
      `mensagens` da resposta de erro em vez de cortar em 1000
      caracteres (o eco do envelope de requisição sozinho já passa
      disso) — foi assim que a maioria dos motivos acima pôde ser
      diagnosticada ao vivo em vez de adivinhada
- [x] **Descoberta**: o encerramento do MIT sozinho não fecha a
      declaração da DCTFWeb — só "prepara" os dados. A declaração fica
      "Em Andamento" e `GERARGUIA31` recusa até ela ficar "Ativa", o que
      exige um passo à parte: consultar o XML da declaração
      (`DCTFWEB.CONSXMLDECLARACAO38`), assiná-lo digitalmente
      (elemento `ConteudoDeclaracao`, atributo `id` minúsculo — diferente
      do `Id` da DPS) e transmitir (`DCTFWEB.TRANSDECLARACAO310`).
      Confirmado pelo usuário: a assinatura tem que ser com o certificado
      da própria SOMA (contratante do Integra Contador, atuando por
      procuração), nunca o certificado da empresa cliente
- [x] **Concluído e confirmado em produção (ORTOP, competência 2026-08,
      02/09/2026): fluxo completo MIT → DCTFWeb → guia funcionando de
      ponta a ponta.** Recibo real da transmissão: `50000522858502`.
      Guia (DARF) gerada com sucesso (PDF real, 122KB). Levou 6 tentativas
      reais até acertar a assinatura da DCTFWeb — histórico completo,
      porque cada erro ensinou algo específico que vale registrar:
      1. RSA-SHA1 (perfil da DPS) → `[TRANS09] SignatureMethod inválido`
      2. RSA-SHA256 só no SignatureMethod → `[TRANS09] DigestMethod inválido` (os dois têm que trocar juntos)
      3. RSA-SHA256 completo + C14N não-exclusivo **hand-rolled** → "assinatura inválida" genérico
      4. C14N **exclusivo** (supondo o par "moderno" que o NFS-e usa) → `[TRANS09] CanonicalizationMethod inválido` (explicitamente rejeitado — tinha que ser não-exclusivo mesmo)
      5. C14N não-exclusivo via **lxml nativo + cópia destacada** (corrige um bug real do lxml com `xmlns=""` espúrio) → ainda "assinatura inválida" genérico
      6. Instalei **`signxml`** (biblioteca de terceiros madura — o comentário antigo dizendo que não estava disponível no ambiente não era mais verdade) só pra *verificar* a tentativa 5, e ela confirmou que a assinatura realmente não validava — minha "autoverificação" até então era circular (validava contra a mesma canonicalização que eu mesmo implementei, então sempre "passava"). Troquei a assinatura em si pra usar `signxml.XMLSigner` (RSA-SHA256 + C14N 1.0) em vez de qualquer implementação própria — **sucesso**
      - Causa raiz do hand-roll nunca ter funcionado pra DCTFWeb: `_c14n`
        (usado pela DPS) foi escrito assumindo 1 namespace só — a DPS
        realmente só tem 1. O XML da DCTFWeb tem 3 (default + `tns1` +
        `xsi`) e um atributo com namespace próprio (`xsi:type`), exatamente
        o caso que o hand-roll documentava não suportar
      - Certificado: confirmado com o usuário e com a doc oficial
        (`entregar_declaracao` — "o certificado usado na assinatura deve
        ser o do autor do pedido de dados") que é o da própria SOMA
        (contratante do Integra Contador), nunca o da empresa cliente
      - O erro `303001`/"SUSPENDED" que apareceu em alguns testes no meio
        do caminho era mesmo intermitente do lado da Serpro (apareceu ora
        no `TRANSDECLARACAO310`, ora no `GERARGUIA31`, em tentativas
        diferentes) — não relacionado ao conteúdo enviado, resolvia
        sozinho tentando de novo
      - `xml_signer.py` (hand-rolled, usado pela DPS) **não foi alterado**
        — nunca teve o problema que motivou essa investigação (documento
        de 1 namespace só), e trocar a implementação lá seria risco sem
        benefício num fluxo já testado e aceito em produção

**Fase V — Retenções na fonte abatidas do imposto apurado (concluído,
02/09/2026)**
- [x] Pedido: resumir as retenções (IRRF/PIS/COFINS/CSLL) que aparecem
      nas notas do mês e abater do imposto apurado, tanto no Lucro
      Presumido quanto no Simples Nacional — a aba Impostos já avisava
      "não desconta retenções" desde que existe, isso resolve a lacuna
- [x] `notas_distribuidas` já guardava `valor_ret_cp` (INSS) e
      `valor_ret_irrf`, mas faltava `valor_ret_csll` — apesar do nome,
      esse é o campo `vRetCSLL` do layout nacional, que é a SOMA de
      PIS+COFINS+CSLL retidos (código de receita 5952, IN RFB 1234/2012),
      não só CSLL. Adicionado em `backend/nfse_client.py` (sincronização
      diária), `frontend/src/lib/xml-nota.ts` (importação manual de XML)
      e a coluna nova via migration
- [x] `lib/calculo-impostos.ts`: `valoresDevidosNoPeriodoMit()` (já usada
      pelo MIT) passou a abater retenção — IRRF do IRPJ, e a retenção
      combinada de PIS/COFINS/CSLL dividida proporcionalmente (0,65% /
      3% / 1%, a alíquota padrão da retenção combinada — assumida, pode
      precisar de ajuste se algum cliente tiver uma combinação diferente)
      entre PIS/COFINS/CSLL. PIS/COFINS sempre abatidos com a retenção do
      MÊS (são sempre mensais); IRPJ/CSLL abatidos com a retenção do
      MÊS ou do TRIMESTRE, dependendo de qual base foi usada pro valor
      bruto — nunca mistura janela errada. Essa função virou fonte única
      pro valor mostrado na aba Impostos E pro que é realmente declarado
      no MIT, pra nunca mostrar um valor e declarar outro
- [x] Nova `abaterRetencaoDoDas()` faz o equivalente pro DAS do Simples
      Nacional (sempre mensal, sem conceito de trimestre)
- [ ] **Fora desta rodada**: a retenção NÃO foi encaixada no payload de
      transmissão do PGDAS-D (`montarDeclaracaoPgdasD`) — só na exibição
      da aba Impostos pro Simples Nacional. Antes de declarar isso de
      verdade pro Simples, preciso confirmar contra a documentação oficial
      (ou apurações reais, mesmo processo usado pro MIT) os campos exatos
      que a Serpro espera pra informar retenção no PGDAS-D — não é
      seguro adivinhar isso numa declaração com efeito legal real, mesma
      lição do MIT acima

## Backend (Fase C em diante)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
