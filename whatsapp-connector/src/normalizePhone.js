function digitosTelefone(valor) {
  if (!valor) return "";
  return String(valor).replace(/\D/g, "");
}

module.exports = { digitosTelefone };
