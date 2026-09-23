-- Pedido do dono: equipe SOMA pode precisar emitir/cancelar nota de
-- QUALQUER cliente sem burocracia de vincular empresa por empresa.
-- portal.ver/notas.emitir/notas.cancelar passam de escopo EMPRESA pra
-- AMBOS — podem continuar sendo concedidas por empresa (cliente,
-- ADMIN_CLIENTE/EMISSOR, sem mudança nenhuma aí) OU globalmente (equipe
-- SOMA, aplicando a toda empresa ativa). tomadores.editar fica EMPRESA
-- (não foi pedido, e cadastro de tomador continua sendo tela do cliente).
update public.permissoes_catalogo
set escopo = 'AMBOS'
where chave in ('portal.ver', 'notas.emitir', 'notas.cancelar');
