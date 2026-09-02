# integra-contador

Conector com a API Integra Contador (Serpro) — puxa dados fiscais dos
clientes da SOMA (Simples Nacional, e depois DCTFWeb/Parcelamentos/Caixa
Postal/Sitfis/Procurações — ver plano de implementação) pros sistemas
internos de apuração.

**Diferente do backend/nfse-engine (stateless).** Este serviço tem acesso
próprio ao Supabase: decifra sozinho o certificado e-CNPJ da SOMA — a
mesma linha da tabela `certificates` que o soma-nfse/frontend já usa pra
emitir NFS-e — pra poder autenticar na Serpro e rodar pulls agendados sem
depender de ninguém logado no navegador. Ver `certificado_escritorio.py`.

Toda rota exige o header `X-Internal-Token` (ver `auth.py`), mesmo padrão
do backend/nfse-engine.

## Por que cada requisição real importa

Cada chamada de negócio contra o gateway de produção da Serpro tem custo.
Por isso:

- Toda chamada passa primeiro pelo cache (`integra_contador_cache`, TTL
  por serviço definido em `catalogo.py`) antes de tocar a Serpro.
- O token OAuth2 (`access_token`/`jwt_token`) fica em memória do processo
  — não reautentica a cada chamada, só quando expira ou o gateway
  responde 401.
- Toda chamada (cache hit ou real) é logada em
  `integra_contador_requests_log`, pra dar visibilidade de quanto está
  sendo gasto de verdade.

## Módulos

| Arquivo | Responsabilidade |
|---|---|
| `certificado.py` | Cópia de `backend/certificado.py` — ler `.pfx`/`.p12`, gravar PEM temporário, apagar depois. |
| `certificado_escritorio.py` | Busca a linha da SOMA em `certificates`, decifra (AES-256-GCM) com `MASTER_ENCRYPTION_KEY` — pra mTLS (`obter_certificado_temporario`) ou pra assinatura XMLDSig (`obter_chave_e_certificado_para_assinatura`). |
| `xml_signer.py` | Cópia de `backend/xml_signer.py` — assina digitalmente (XMLDSig) um elemento do XML da declaração da DCTFWeb antes de `TRANSDECLARACAO310`, com o certificado da própria SOMA. |
| `serpro_auth.py` | OAuth2 + mTLS: obtém e cacheia `access_token`/`jwt_token`. |
| `catalogo.py` | Mapa idSistema/idServico → rota do gateway, versão, TTL de cache. |
| `cache.py` | Lê/grava `integra_contador_cache` respeitando o TTL. |
| `serpro_client.py` | Monta o envelope (`contratante`/`autorPedidoDados`/`contribuinte`/`pedidoDados`) e chama o gateway. |
| `scheduler.py` | APScheduler: job diário (3h) que pré-aquece o cache de todos os contribuintes ativos. |
| `supabase_client.py` | Cliente Supabase (service role). |

## Ainda não implementado

**Demais módulos do catálogo** (DEFIS, DCTFWeb, Parcelamentos, Caixa
Postal, Sitfis, Procurações) — entram como novas entradas em
`catalogo.py` seguindo o mesmo padrão, confirmando rota/versão de cada um
no Catálogo de Serviços oficial antes de ligar.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/contribuintes/{cnpj}/simples/extrato-das/{numero_das}` | Consulta extrato do DAS (`PGDASD.CONSEXTRATO16`, cache-first) |
| GET | `/contribuintes/{cnpj}/mit/apuracoes/{ano_apuracao}` | Lista apurações do MIT do ano, opcionalmente por mês (`MIT.LISTAAPURACOES317`, só leitura) |
| GET | `/contribuintes/{cnpj}/mit/apuracao/{id_apuracao}` | Detalhe de uma apuração do MIT (`MIT.CONSAPURACAO316`, só leitura) |
| POST | `/contribuintes/{cnpj}/mit/apuracao/declarar` | Encerra uma apuração do MIT — IRPJ/CSLL/PIS/COFINS de Lucro Presumido/Real (`MIT.ENCAPURACAO314`, **efeito legal real**, nunca cacheado) |
| GET | `/contribuintes/{cnpj}/mit/situacao-encerramento?protocolo_encerramento=...` | Acompanha o encerramento de uma apuração do MIT (`MIT.SITUACAOENC315`, cache de 30s pra polling) — protocolo vai como query, não path (é base64, pode ter `/`) |
| GET | `/contribuintes/{cnpj}/dctfweb/guia/{ano_pa}/{mes_pa}` | Gera o PDF da guia (DARF) de um período já encerrado na DCTFWeb, inclusive vindo do MIT (`DCTFWEB.GERARGUIA31`) |
| GET | `/contribuintes/{cnpj}/dctfweb/xml/{ano_pa}/{mes_pa}` | Consulta o XML (assinado ou rascunho) de uma declaração da DCTFWeb (`DCTFWEB.CONSXMLDECLARACAO38`, só leitura) |
| POST | `/contribuintes/{cnpj}/dctfweb/transmitir/{ano_pa}/{mes_pa}` | Fecha uma declaração "Em Andamento" (ex.: vinda de um encerramento do MIT) — consulta o XML, assina com o certificado da SOMA, transmite (`DCTFWEB.TRANSDECLARACAO310`, **efeito legal real**) |

## Job agendado

Todo dia às 3h (horário de São Paulo), pré-aquece o cache com
`PGDASD.CONSDECLARACAO13` ("Consultar declaração por ano/período") pro
período de apuração atual, pra todo CNPJ marcado como `ativo` em
`integra_contador_contribuintes`. Esse serviço foi escolhido porque só
pede CNPJ + período — nenhum `numeroDas`/`numeroDeclaracao` prévio —
então dá pra rodar em lote sem precisar já saber o que existe pra cada
cliente. Ele devolve um índice das declarações/DAS do período (com
`numeroDas` de cada), que pode alimentar consultas mais específicas
depois (ex.: `CONSEXTRATO16`).

## Rodando localmente

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy .env.example .env      # preencher com os valores reais
uvicorn main:app --reload
```

Durante o desenvolvimento, aponte `INTEGRA_CONTADOR_AUTH_URL` e
`INTEGRA_CONTADOR_GATEWAY_URL` pro ambiente de demonstração/trial do
Integra Contador, não para produção — evita gastar chamada de verdade
testando código.

## Deploy

Mesma convenção do `backend/`: sem config de deploy no git. Criar um
serviço novo no Railway com "root directory" = `integra-contador/`, e
configurar as env vars listadas em `.env.example` (`MASTER_ENCRYPTION_KEY`
precisa ser **exatamente** o mesmo valor já usado no `frontend/`).
