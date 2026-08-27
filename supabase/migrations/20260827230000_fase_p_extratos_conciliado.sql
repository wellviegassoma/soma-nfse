-- "Entregue" (o cliente mandou e a gente anexou) e "conciliado" (a
-- contabilidade já bateu o extrato) são estados independentes — dá pra
-- estar entregue e ainda não conciliado, mas não o contrário na prática
-- (por isso não travamos com CHECK, só documentamos a expectativa aqui).
alter table public.extratos_mensais add column conciliado boolean not null default false;
