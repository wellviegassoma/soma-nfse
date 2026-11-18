-- Mensagem "NOVO CLIENTE | SOMA CONTABILIDADE" no card Cliente Ativo do
-- Comercial: o que o sistema já sabe vem de companies/legalização; o que
-- só existe na cabeça de quem fechou o cliente fica nestas colunas do
-- prospect, preenchidas na própria seção da mensagem.

alter table public.comercial_prospects
  add column novo_cliente_inicio_responsabilidade date,
  add column novo_cliente_funcionarios int
    check (novo_cliente_funcionarios is null or novo_cliente_funcionarios >= 0),
  add column novo_cliente_pro_labore text,
  add column novo_cliente_fase_legalizacao text,
  add column novo_cliente_obs text;

comment on column public.comercial_prospects.novo_cliente_funcionarios is
  'Quantidade de funcionários pra mensagem de novo cliente. Null = não informado; 0 = "Não".';
comment on column public.comercial_prospects.novo_cliente_fase_legalizacao is
  'Texto livre da "Fase atual do processo de legalização". Vazio = usa a primeira fase não concluída do processo vinculado (legalizacao_processo_id).';

-- Dados da empresa + fase atual do processo pra quem só tem comercial.ver
-- (sem empresas.ver / legalizacao.ver) — mesmo padrão de
-- comercial_status_processo_legalizacao.
create or replace function public.comercial_dados_novo_cliente(p_prospect_id uuid)
returns table (
  codigo_cliente text,
  legal_name text,
  cnpj text,
  person_type text,
  tax_regime text,
  equiparacao_hospitalar boolean,
  sujeito_fator_r boolean,
  fase_legalizacao_atual text,
  processo_concluido boolean
)
language sql security definer set search_path = public stable as $$
  select c.codigo_cliente, c.legal_name, c.cnpj, c.person_type::text, c.tax_regime::text,
    c.equiparacao_hospitalar, c.sujeito_fator_r,
    (select f.nome from public.legalizacao_processo_fases f
      where f.processo_id = cp.legalizacao_processo_id and f.data_conclusao is null
      order by f.ordem limit 1),
    case when cp.legalizacao_processo_id is null then null
      else not exists (select 1 from public.legalizacao_processo_fases f
        where f.processo_id = cp.legalizacao_processo_id and f.data_conclusao is null)
    end
  from public.comercial_prospects cp
  join public.companies c on c.id = cp.company_id
  where cp.id = p_prospect_id
    and public.tem_permissao('comercial.ver')
$$;
revoke all on function public.comercial_dados_novo_cliente(uuid) from public;
grant execute on function public.comercial_dados_novo_cliente(uuid) to authenticated;
