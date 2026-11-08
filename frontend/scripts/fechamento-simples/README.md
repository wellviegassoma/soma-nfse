# Fechamento do Simples Nacional — planilha única

Gera e atualiza a planilha `Fechamento Simples AAAA.xlsx`, com todas as empresas do Simples. Ela tem Painel, Fechamento, ficha por Empresa, Folha, Histórico, Empresas e Tabelas.

## Fluxo de todo mês

1. **Importar a folha.** No sistema, vá em Fechamento › Importar folha e importe o Resumo da folha de todas as empresas. Isso grava a `folha_mensal`, que é a base do Fator R.
2. **Buscar as notas.** Em Fechamento, use "Buscar todas agora" ou o histórico.
3. **Opcional: buscar os extratos do PGDAS-D do mês.** Isso traz a receita e o DAS declarados para a conferência. **Tem custo no Serpro:** são cerca de 2 consultas por empresa.
   ```bash
   npm run fechamento:simples -- --buscar-extratos 2026-10
   ```
   Esse primeiro comando só mostra quantas consultas faria. Para consultar de verdade:
   ```bash
   npm run fechamento:simples -- --buscar-extratos 2026-10 --confirmar
   ```
   Precisa de `INTEGRA_CONTADOR_URL` e `INTEGRA_CONTADOR_INTERNAL_TOKEN` no `frontend/.env.local`.
4. **Atualizar a planilha.** Na pasta `frontend`, com a planilha **fechada** no Excel:
   ```bash
   npm run fechamento:simples
   ```

### Atalho (sem terminal)

Dê dois cliques em `atualizar.cmd`. Uma cópia de atalho fica em `Documentos\ClaudeCode\fechamento-simples\Atualizar Fechamento Simples.cmd`. O menu tem duas opções:

- **[1] Atualizar a planilha:** sem custo.
- **[2] Buscar os extratos de um mês e atualizar:** primeiro mostra quantas consultas vai fazer e só consulta depois que você digitar SIM.

No fim, a planilha abre sozinha.

## O que o script faz

- Lê as notas emitidas e distribuídas, a receita manual, a folha e o cadastro (Sujeita ao Fator R) direto do banco.
- Lê os extratos do PGDAS-D que já estão no cache do Integra Contador. Isso não custa nada. Deles saem a receita declarada, os 12 meses anteriores (usados no RBT12) e o DAS declarado.
- **Mantém o que foi digitado na planilha:**
  - compensação, valor pago e observação;
  - receita lançada à mão (vale sobre a do sistema);
  - receita e DAS declarados à mão, quando não há extrato.
- Guarda uma cópia da versão anterior em `versoes-anteriores/`.
- Usa o Excel instalado nesta máquina (via PowerShell) para recalcular e montar os gráficos. Por isso só roda no Windows com o Excel.

## Opções

| Opção | Padrão |
|---|---|
| `--ano 2026` | ano corrente |
| `--saida "C:\...\Fechamento Simples 2026.xlsx"` | `Documentos\ClaudeCode\fechamento-simples\` |

## Regras de cálculo

As regras ficam na aba **Como usar** da planilha.

- **Tabelas dos anexos:** estão em `tabelas-sn.json`, copiadas da planilha 064-SN. A aba **Tabelas** pode ser editada na própria planilha.
- **Fator R sem receita anterior:** quando não há receita nos 12 meses anteriores, o Fator R fica em 0,28 se houve folha e em 0,01 se não houve (Res. CGSN 140, art. 26).
