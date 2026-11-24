-- Backfill de valor_ret_csll (vRetCSLL = PIS+COFINS+CSLL retidos).
-- A coluna nasceu em 02/09/2026 (fase_v) e a sincronização diária usa
-- upsert com ignoreDuplicates: notas guardadas antes disso nunca
-- ganharam o valor, embora o XML tenha a tag. Resultado: MIT, Simples e
-- fechamento não abatiam essas retenções (caso da Chrisorto em 08/2026).
update public.notas_distribuidas
set valor_ret_csll = (substring(xml from '<vRetCSLL>([0-9.]+)</vRetCSLL>'))::numeric
where valor_ret_csll is null
  and xml like '%<vRetCSLL>%'
  and substring(xml from '<vRetCSLL>([0-9.]+)</vRetCSLL>') is not null;
