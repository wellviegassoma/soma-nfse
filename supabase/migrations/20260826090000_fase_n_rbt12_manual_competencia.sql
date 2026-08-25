-- Fase N (correção) — RBT12 é uma janela móvel de 12 meses que muda todo
-- mês; o campo rbt12_manual sozinho (sem saber a que mês ele se refere)
-- ficava parado e era reaplicado igual em qualquer competência depois —
-- bug real confirmado: alíquota de agosto/2026 saiu igual à de julho/2026
-- porque o valor manual tinha sido informado com base em julho.
--
-- Agora o valor manual só é usado quando bate exatamente com a
-- competência de referência em que foi informado; fora disso, o sistema
-- avisa que está desatualizado em vez de aplicar silenciosamente errado.

alter table public.companies
  add column rbt12_manual_competencia text;

comment on column public.companies.rbt12_manual_competencia is
  'Competência ("YYYY-MM") a que o rbt12_manual se refere — o valor manual só é usado quando essa competência bate exatamente com a apuração; senão o sistema avisa que está desatualizado em vez de reaplicar o número errado.';
