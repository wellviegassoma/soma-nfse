-- Fase Z — Novo regime tributário "Imune/Isento", para associações e
-- sociedades sem fins lucrativos (não se enquadram em Simples/Presumido/Real).
alter type public.tax_regime add value 'IMUNE_ISENTO';
