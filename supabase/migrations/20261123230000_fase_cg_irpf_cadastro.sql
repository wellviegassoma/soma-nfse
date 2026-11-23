-- IRPF: cadastro completo do contribuinte, lido da ficha Identificação do
-- .DEC (registro 16) da declaração mais recente importada (pedido do
-- Wellington 23/11/2026). cadastro_exercicio diz de qual exercício veio;
-- uma importação de exercício mais antigo não sobrescreve.
alter table public.irpf_contribuintes
  add column if not exists tipo_logradouro text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cep text,
  add column if not exists municipio text,
  add column if not exists municipio_codigo_rfb text,
  add column if not exists uf text,
  add column if not exists celular text,
  add column if not exists telefone_fixo text,
  add column if not exists titulo_eleitor text,
  add column if not exists ocupacao_codigo text,
  add column if not exists natureza_ocupacao_codigo text,
  add column if not exists tem_conjuge boolean,
  add column if not exists cpf_conjuge text,
  add column if not exists banco text,
  add column if not exists agencia text,
  add column if not exists conta text,
  add column if not exists conta_dv text,
  add column if not exists tipo_conta text,
  add column if not exists doenca_grave boolean,
  add column if not exists cadastro_exercicio int;
