-- Tomador: inscrição municipal e telefone (campos opcionais do <toma> da DPS nacional).
alter table public.customers
  add column if not exists municipal_registration text,
  add column if not exists phone text;
