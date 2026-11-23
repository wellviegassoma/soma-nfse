-- Fase CN — SEI: processo cadastrado à mão (só clientes de Petrópolis).
-- Casos: deu entrada sem dar acesso à SOMA (cliente/outro escritório) ou
-- protocolo físico/fora do SEI. Conta para a cobertura. Se um processo com
-- número do SEI passar a aparecer no acesso da SOMA, a sincronização assume
-- (mesmo `numero`) e mantém cliente e anotações. Spec: docs/sei.md.

alter table public.sei_processos
  add column if not exists origem text not null default 'SEI' check (origem in ('SEI', 'FISICO')),
  add column if not exists cadastrado_em timestamptz,
  add column if not exists cadastrado_por uuid references public.profiles(id) on delete set null,
  add column if not exists data_entrada date,
  add column if not exists observacao text;

-- Andamentos e anexos lançados à mão (convivem com os do SEI na linha do tempo).
alter table public.sei_andamentos
  add column if not exists manual boolean not null default false,
  add column if not exists criado_por uuid references public.profiles(id) on delete set null;

alter table public.sei_documentos
  add column if not exists manual boolean not null default false,
  add column if not exists criado_por uuid references public.profiles(id) on delete set null;
