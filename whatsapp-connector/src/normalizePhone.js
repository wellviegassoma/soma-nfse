function digitosTelefone(valor) {
  if (!valor) return "";
  return String(valor).replace(/\D/g, "");
}

// Compara só os últimos 8 dígitos — ignora DDI e o 9º dígito, que variam
// entre como o WhatsApp manda o JID e como o número está digitado em
// company_contatos_setor. Heurística suficiente pro MVP: o resultado só
// preenche atendimento_contatos.company_id como contexto pro atendente,
// nunca é usado em RLS nem em nenhuma decisão que precise de certeza.
function telefonesCorrespondem(a, b) {
  const da = digitosTelefone(a);
  const db = digitosTelefone(b);
  if (da.length < 8 || db.length < 8) return false;
  return da.slice(-8) === db.slice(-8);
}

module.exports = { digitosTelefone, telefonesCorrespondem };
