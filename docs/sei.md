# Módulo SEI (Legalização) — acompanhamento de processos do SEI Petrópolis

Status: **Fase 1 em produção desde 23/11/2026** (commits fcc5086 e 4bed646; migrations fase_ck e
fase_cl aplicadas). Situação após a carga: 80 processos, 858 documentos — 803 baixados e 55
marcados "sem acesso no SEI" (`sem_acesso_em`), 0 pendentes; 69 vinculados automaticamente
(56 por CNPJ/CPF do requerimento, 7 pelo interessado, 5 pela IM, 1 manual), 11 sem cliente.
Rodada de conferência em produção terminou OK, sem erros, e já trouxe 1 andamento novo.
Pendências:
- Os 55 "sem acesso" estão em 14 processos onde o SEI não monta o link nem com a página
  renderizada — provável acesso externo só "para disponibilização de documentos". Confirmar
  abrindo um deles no SEI (ex.: PMP.035166/2025); se for isso, pedir acesso integral.
- 9 dos 11 sem cliente têm CNPJ/CPF lido, mas a empresa não está em `companies`.
- Anexos até 500 MB sobem num PUT só (testado com 2 PDFs de ~104 MB).

Arquivamento e cobertura (fase_cm, commit 3182ccd):
- **Arquivar** processo (motivo + observação): sai da lista/contagens/novidades e a extensão não
  abre mais no SEI (o `iniciar` devolve os números arquivados). Cliente inativo = sugestão de arquivar.
- **Cobertura** em `/legalizacao/sei/cobertura`: todo cliente **ativo** de Petrópolis (IBGE 3303906)
  deve ter processo não arquivado no SEI ou dispensa. Dispensa manual em `sei_cobertura_dispensas`
  (motivo, quem, quando; desfazível) ou automática quando "Vigilância Sanitária" está como
  "não se aplica" em Alvarás e licenças. Meta: zero em "Sem processo" (eram 96 em 23/11).
- Extensão 0.3.0 lê também "Ver expirados" (formato do link não verificado: três estratégias +
  aviso no log se nenhuma servir); processo só com acesso vencido que não abre é registrado com
  `somente_registro` (não sobrescreve dados já lidos).

Processo manual (fase_cn, commit c452b44) — **só clientes de Petrópolis**; outros municípios
seguem em Alvarás e licenças › Renovações:
- `/legalizacao/sei/novo` (e atalho por cliente na cobertura). Origem `SEI` (entrada sem acesso
  da SOMA; número PMP.000123/2026) ou `FISICO` (protocolo do balcão/outro sistema, número livre).
  `vinculo_origem = MANUAL`, `cadastrado_em/por`, `data_entrada`, `observacao`.
- Enquanto `sincronizado_em` é nulo a situação é escolhida à mão. Andamentos e anexos à mão
  (`manual = true`, chave aleatória / `numero_sei` "M-…") convivem com os do SEI e podem ser excluídos.
- Se o número do SEI passar a aparecer no acesso da SOMA, o upsert por `numero` assume o processo:
  mantém cliente (MANUAL), origem, observação e lançamentos; situação passa a vir do SEI.

Aprendizados da implementação (valem para manutenção da extensão `extensao-sei/`):
- Acessar o SEI **de dentro da aba do SEI** (`chrome.scripting`); da página da extensão o cookie
  de sessão não vai.
- A lista de acessos lembra a última página vista: pedir todas as páginas pelo POST, inclusive a 1.
- Links de documentos internos vêm como `javascript:void(0)` e são montados por script: a página do
  processo é lida num iframe escondido na aba do SEI, depois dos scripts rodarem.
- PUT ao Blob a partir da origem do SEI: `x-add-random-suffix` não passa no CORS (sufixo vai no nome).

## Objetivo

Trazer para o SOMA Gestão todos os processos do SEI da Prefeitura de Petrópolis em que a SOMA
tem acesso externo (73 de 80 são Licença Sanitária; o resto é Fazenda/Alvará: ISS, taxas,
paralisação, inscrição de autônomo). Para cada processo: cabeçalho, documentos (com o arquivo) e andamentos. Também
avisar quando aparecer andamento novo, sem ninguém ter que abrir processo por processo.

## O que existe no SEI (mapeamento)

Acesso: `https://sei.petropolis.rj.gov.br/sei/controlador_externo.php?acao=md_gov_br_acessar&id_orgao_acesso_externo=14`
— login gov.br com o certificado CPF do Wellington.

### Menu do usuário externo
| Tela | `acao` | Uso para nós |
|---|---|---|
| Controle de Acessos Externos | `usuario_externo_controle_acessos` | **Fonte principal.** Lista paginada (50 por página; 128 registros em 23/11) com Processo, Tipo, Liberação, Validade e link para o processo. Mesmo processo aparece várias vezes (um registro por liberação). Tem "Ver expirados". |
| Recibos Eletrônicos de Protocolo | `md_pet_usu_ext_recibo_listar` | 80 recibos: data/hora, processo, nº recibo, tipo de peticionamento. Dá a data em que **nós** protocolamos. |
| Intimações Eletrônicas | `md_pet_intimacao_usu_ext_listar` | Vazia hoje. Filtros por processo, período, tipo, situação. Vale monitorar: intimação tem prazo. |
| Peticionar | — | Fora de escopo (escrita). |

Paginação: formulário com `hdnInfraPaginaAtual` / `selInfraPaginacaoSuperior` (POST na mesma tela).

### Página do processo
`modulos/inteiro-teor-pmp/processo_acesso_externo_consulta.php?id_acesso_externo=…&id_orgao_acesso_externo=14&infra_hash=…`

Três tabelas fáceis de ler:
- `#tblSeiCabecalhoProcesso`: Processo (ex.: `PMP.000927/2026`), Tipo (`LICENÇA SANITÁRIA / INICIAL`),
  Data de Geração, Nível de Acesso, Interessados (razão social do cliente + o Wellington).
- `#tblDocumentos`: nº SEI (7 dígitos), tipo + descrição, data, unidade, link
  `documento_consulta_externa.php?id_documento=…`.
- `#tblHistorico`: andamentos com data/hora, unidade e **texto completo** (é aí que aparecem
  "Aguardando cumprimento integral do Despacho…", "Lavrado o Termo de Intimação…",
  "EXPEDIDA E ASSINADA LS…").

Botões "Gerar PDF" / "Gerar ZIP" do processo inteiro também existem (`gerarPdf()` / `gerarZip()`).

### Documentos
Download direto por GET em `/sei/documento_consulta_externa.php` (o link na página do processo
é relativo, `../../documento_consulta_externa.php`, cuidado ao resolver fora da página), já com
`Content-Disposition`. HTML vem em ISO-8859-1 com entidades (`&Atilde;`):
- gerados no SEI (requerimento, despacho, **Licença Sanitária**): `text/html` (~180 KB);
- anexados: `application/pdf` ou `image/jpeg` (uma foto de Termo de Intimação tinha 7,7 MB).

### Restrições que definem a arquitetura
1. **Tudo depende da sessão logada.** Sem os cookies da sessão, o link do processo e o do documento
   abrem uma página vazia. Os links têm `infra_hash` por sessão, então não dá para guardar e reusar.
2. **Login só com gente.** gov.br + certificado, ou o login nativo do SEI (e-mail + senha), que tem
   **captcha de imagem** (`infraCaptcha`). Robô não loga sozinho; contornar captcha está fora de questão.
3. Cookies de sessão são HttpOnly: não dá para copiá-los para um servidor (nem queremos).
4. **A sessão do SEI cai em menos de 1 hora parada** (medido em 23/11: a aba redireciona para
   `md_gov_br_desconectar`). Sincronizar logo depois do login; a rodada automática da Fase 2 só
   funciona enquanto alguém estiver usando o SEI.
5. Acesso externo **expira** (validade de 1 ano em vários). Depois de expirar perdemos a consulta,
   então guardar o arquivo do nosso lado tem valor de arquivo morto.

## Arquitetura proposta

**A sincronização roda dentro do Chrome logado**, por uma extensão própria e pequena ("SOMA · SEI").
O servidor nunca loga no SEI.

```
[Chrome com SEI logado] --extensão--> lê telas do SEI (mesma sessão)
        |                               baixa documentos novos
        v
POST /api/sei/sync  (token de integração da SOMA, não a sessão do SEI)
        v
Supabase: sei_processos / sei_documentos / sei_andamentos  +  Blob: arquivos
        v
/legalizacao/sei  (lista, linha do tempo, documentos, "novidades")
```

Por que extensão e não as alternativas:
- **Bookmarklet**: funciona, mas depende de alguém clicar e não roda sozinho com a aba aberta.
- **Claude no Chrome agendado**: caro por execução e frágil para 100+ processos.
- **Robô no servidor (Playwright)**: barrado pelo login com captcha/gov.br.

A extensão faz:
1. Botão **"Sincronizar agora"** e, enquanto houver aba do SEI logada, uma rodada automática a cada X horas
   (`chrome.alarms`). Se a sessão caiu, mostra um selo "faça login no SEI".
2. Lê as 3 páginas de Controle de Acessos (e "Ver expirados" na primeira carga), deduplica por nº do processo.
3. Para cada processo, abre a página (fetch, sem abrir aba), extrai as 3 tabelas e manda para a API.
   **Incremental**: a API devolve quais nºs de documento ela já tem; a extensão só baixa os novos.
4. Lê Recibos e Intimações.
5. Ritmo educado: 1 processo por vez, com pausa de ~1 s (não martelar o SEI da Prefeitura).

## Modelo de dados (rascunho)

- `sei_processos`: `numero` (único, ex. `PMP.000927/2026`), `tipo`, `data_geracao`, `nivel_acesso`,
  `interessados text[]`, `company_id` (vínculo), `legalizacao_processo_id` / renovação (vínculo opcional),
  `acesso_validade`, `acesso_expirado`, `ultimo_andamento_em`, `ultimo_andamento_texto`,
  `concluido` (último andamento "Conclusão do processo na unidade"), `sincronizado_em`.
- `sei_documentos`: `processo_id`, `numero_sei` (único), `tipo`, `descricao`, `data`, `unidade`,
  `mime`, `tamanho`, `blob_url`, `blob_pathname`, `baixado_em`.
- `sei_andamentos`: `processo_id`, `data_hora`, `unidade`, `descricao`, `hash` (único, para não duplicar),
  `visto_em` / `visto_por` (para o "novidades").
- `sei_intimacoes` e `sei_recibos`: quando houver dados.
- `sei_sincronizacoes`: log de cada rodada (início, fim, processos lidos, docs novos, erro).

## Vínculo com o cliente

### O problema
O campo "Interessados" não é confiável. Em parte dos processos ele traz a empresa do cliente
junto com o Wellington; em outros traz **só o Wellington** (quem peticionou), e os anexos são do
cliente. Amostra completa em 23/11 (80 processos únicos):

| Situação | Qtde |
|---|---|
| Interessado inclui o cliente | 68 |
| Interessado é só o Wellington | 12 |
| …desses, cliente identificado pelo formulário/requerimento | 10 |
| …desses, sem identificação automática | 2 (PMP.020777/2026: requerimento preenchido no nome do Wellington; PMP.035068/2026: primeiro doc é imagem) |

Não é só Vigilância Sanitária: 73 de Licença Sanitária / Inicial, e o resto da Fazenda/Alvará
(cancelamento de débito, paralisação, ISS pago em duplicidade, inscrição de autônomo, juntada).
Entre os clientes há **pessoa física autônoma** (CPF), não só empresa.

### Onde o cliente aparece
O **primeiro documento** do processo quase sempre é um formulário gerado no próprio SEI (HTML,
texto pesquisável), com campos rotulados:
- *Requerimento de Licença Sanitária*: RAZÃO SOCIAL, INSCRIÇÃO MUNICIPAL (ALVARÁ), CNPJ
  (que traz CPF quando é autônomo), endereço, atividade, responsável técnico;
- *Formulário do ISS* / *Formulário para Baixa de Inscrição*: nome, CPF/CNPJ, inscrição;
- *Requerimento Padrão Fazenda*: "DADOS DO REQUERENTE" (pode estar no nome do Wellington).

`companies` já tem `cnpj`, `cpf`, `person_type` e `municipal_registration`, então o cruzamento é direto.

### Regra de vínculo (em ordem, para do primeiro que achar)
1. **Vínculo manual** já feito: sempre ganha e nunca é sobrescrito pela sincronização.
2. **CNPJ/CPF do formulário** (primeiro documento HTML) → `companies.cnpj` / `companies.cpf`,
   ignorando o CPF do Wellington.
3. **Inscrição municipal do formulário** → `companies.municipal_registration`.
4. **Interessado ≠ Wellington** → razão social normalizada (sem acento, sem LTDA/ME/EIRELI) contra
   `legal_name` / `trade_name`.
5. **Razão social do formulário** pelo mesmo critério do item 4.
6. Nada casou → fila **"Processos sem cliente"**, mostrando o que foi lido (nome, documento,
   inscrição) para vincular com um clique. Fase 2: ler o texto dos PDFs anexos (procuração,
   comprovante de CNPJ) para tentar o CNPJ antes de cair na fila.

O formulário vale mais que o interessado: mesmo quando o interessado traz a empresa, o CNPJ do
requerimento é o que confirma (o nome no SEI vem com grafia livre, ex. "HELTHY SERVIÇOS MÉDICOS").
Gravar em `sei_processos`: `vinculo_origem` (`MANUAL` | `FORMULARIO_DOC` | `FORMULARIO_IM` |
`INTERESSADO` | `FORMULARIO_NOME` | `ANEXO`), `requerente_nome`, `requerente_documento`,
`requerente_im`, para dar para auditar de onde veio o vínculo.

Se o documento lido não existir em `companies` (cliente ainda não cadastrado, como acontece em
abertura), a fila mostra "cadastrar cliente" com os dados do formulário já preenchidos.
- Ligar à **renovação**: `legalizacao_processos.protocolo_numero` (fase_bz) já guarda nº de protocolo;
  quando bater com um `sei_processos.numero`, a renovação ganha a linha do tempo do SEI.
- Quando sair um documento "Licença Sanitária" (como o `0587379`), sugerir cadastrar em
  Alvarás e licenças com o arquivo já anexado (a data de validade a pessoa confirma).

## Telas no SOMA Gestão

Nova aba **SEI** em `LegalizacaoNav`:
1. **Lista**: processo, cliente, tipo, situação (com a unidade/ completo), último andamento + data,
   selo "novo" se houve andamento desde a última vez que alguém viu. Filtros: cliente, tipo,
   "com novidade", "aguardando exigência", "concluído", "acesso expirando".
2. **Processo**: linha do tempo legível (andamentos agrupados por dia, tramitação interna
   "remetido/recebido" recolhida, despachos e exigências em destaque) + lista de documentos com
   visualização e download.
3. **Novidades**: andamentos novos desde a última sincronização, para a rotina diária.
4. Na página da empresa e do processo de Legalização: card com os processos SEI dela.

Destaques automáticos por texto do andamento (regras simples, sem IA no começo):
"Aguardando cumprimento", "Termo de Intimação", "exigências" → **exigência pendente**;
"EXPEDIDA E ASSINADA LS" → **licença emitida**; "Conclusão do processo" → **concluído**.

## Fases

1. **Fase 1 — leitura e carga inicial**: migration + API `/api/sei/sync` + extensão com o botão
   "Sincronizar agora" (sem agendamento) + tela de lista e de processo. Carga completa dos 128 acessos.
2. **Fase 2 — rotina**: alarme na extensão, aba Novidades, destaques de exigência/licença,
   vínculo com renovação e com Alvarás e licenças.
3. **Fase 3 — avisos**: notificação para o responsável / Tarefas quando surgir exigência ou
   intimação; Recibos e Intimações.

## Em aberto (decidir antes de codar)

- **Arquivos**: baixar tudo na carga inicial (estimativa grosseira: ~100 processos × ~25 docs,
  ~1 a 3 GB por causa das fotos) ou só os metadados e baixar sob demanda? Recomendação: baixar
  tudo (o acesso expira) e, se pesar, comprimir JPEG grande antes de subir.
- **Quanto dura a sessão do SEI** parada: medir. Define se a rodada automática vale ou se fica
  "1 clique por dia depois do login".
- **Quem instala a extensão**: só no Chrome do Wellington (o certificado é dele) ou também na
  máquina de quem cuida da Legalização.
- **Outros órgãos do SEI** (`id_orgao_acesso_externo` ≠ 14)? Hoje só Secretaria de Saúde.
