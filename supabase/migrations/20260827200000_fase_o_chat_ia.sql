-- Chat de IA interno — histórico de conversa privado por usuário staff.
create table public.chat_ia_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_chat_ia_conversas_user on public.chat_ia_conversas(user_id);

create table public.chat_ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.chat_ia_conversas(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
create index idx_chat_ia_mensagens_conversa on public.chat_ia_mensagens(conversa_id);

create trigger chat_ia_conversas_set_updated_at before update on public.chat_ia_conversas
  for each row execute function public.set_updated_at();

alter table public.chat_ia_conversas enable row level security;
alter table public.chat_ia_mensagens enable row level security;

-- Só staff usa o chat, e cada um só enxerga a própria conversa — histórico
-- privado, não compartilhado entre a equipe mesmo sendo todos staff.
create policy chat_ia_conversas_all on public.chat_ia_conversas
  for all
  using (public.is_soma_staff() and user_id = auth.uid())
  with check (public.is_soma_staff() and user_id = auth.uid());

create policy chat_ia_mensagens_all on public.chat_ia_mensagens
  for all
  using (
    public.is_soma_staff()
    and exists (
      select 1 from public.chat_ia_conversas c
      where c.id = conversa_id and c.user_id = auth.uid()
    )
  )
  with check (
    public.is_soma_staff()
    and exists (
      select 1 from public.chat_ia_conversas c
      where c.id = conversa_id and c.user_id = auth.uid()
    )
  );
