# SOMA · SEI (extensão do Chrome)

Lê o SEI de Petrópolis com a sessão já logada no Chrome e manda processos,
andamentos e documentos para o SOMA Gestão › Legalização › SEI. Spec em `docs/sei.md`.

Só lê o SEI: faz GET das telas e dos documentos (mais o POST de paginação da
lista de acessos). Nunca peticiona, assina nem clica em nada.

## Instalar (uma vez)
1. Chrome → `chrome://extensions` → ligar **Modo do desenvolvedor** (canto superior direito).
2. **Carregar sem compactação** → escolher a pasta `soma-nfse\extensao-sei`.
3. Fixar o ícone "SOMA · SEI" na barra (ícone de quebra-cabeça → alfinete).

Depois de mudar os arquivos da extensão: botão ↻ no card dela em `chrome://extensions`.

## Usar
1. Logar no SEI (gov.br) numa aba e deixar a aba aberta.
2. Estar logado no SOMA Gestão no mesmo Chrome (produção ou `localhost:3000`, conforme o seletor).
3. Clicar no ícone → **Sincronizar agora**. A primeira carga baixa todos os documentos;
   as seguintes só o que for novo.

## Como funciona
- Parte do link "Controle de Acessos Externos" do menu da aba do SEI aberta
  (os links do SEI levam um `infra_hash` da sessão; não dá para montar a URL).
- Para cada processo: lê cabeçalho, documentos e andamentos, manda para `/api/sei/sync`,
  e sobe ao Blob privado só os documentos que o SOMA ainda não tem (token em `/api/sei/upload`,
  PUT direto no Blob — há anexos maiores que o limite de corpo de uma função).
- Usa a sessão do SOMA do próprio Chrome (exige `legalizacao.editar`).
