// Sugestão automática de atividade do Simples Nacional a partir do
// código de tributação nacional (LC 116/2003, Lista de Serviços anexa) já
// cadastrado em cada `services.national_tax_code`.
//
// IMPORTANTE: LC 116 (lista municipal de serviço, pra ISS) e a
// classificação do Simples Nacional (LC 123/2006, §§5º-B/D/I — ver
// simples-nacional-atividades.ts) são leis diferentes, sem tabela de
// correspondência oficial entre elas. Isso aqui é uma SUGESTÃO
// (pré-seleciona o campo no cadastro), nunca uma aplicação automática —
// quem confirma é sempre o contador. Só incluí abaixo os subitens onde a
// correspondência é inequívoca (o próprio texto da LC 116 já nomeia a
// atividade e ela cai claramente num único item da LC 123). Quando um
// código da LC 116 mistura mais de uma atividade com tratamentos
// diferentes, ou não tem correspondência clara, deixei de fora de
// propósito — `sugerirAtividade` devolve `undefined` nesses casos, e o
// cadastro deve pedir escolha manual, sem chute.
//
// Texto da LC 116 conferido direto no Planalto em 27/08/2026:
// https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm
//
// Começa só pelo item 4 (Serviços de saúde, assistência médica e
// congêneres) — outros itens (8 = educação, 7 = engenharia/construção,
// 17 = profissionais técnicos/científicos) ficam pra quando forem
// necessários; item 17 em especial mistura profissões com tratamentos
// bem diferentes, então merece mapeamento código por código, não em bloco.

import { buscarAtividade, type AtividadeSimplesNacional } from "./simples-nacional-atividades";

// Chave: código LC 116 (com o ponto, ex. "04.01"). Valor: id de
// simples-nacional-atividades.ts.
const MAPA_LC116_PARA_ATIVIDADE: Record<string, string> = {
  "04.01": "medicina", // "Medicina e biomedicina" — §5º-B, XIX
  "04.05": "psicologia_terapias", // "Acupuntura" — nomeada explicitamente no §5º-B, XXI
  "04.06": "medicina", // "Enfermagem, inclusive serviços auxiliares" — §5º-B, XIX inclui "e enfermagem"
  "04.08": "fisioterapia", // "Terapia ocupacional, fisioterapia e fonoaudiologia" — mistura 3 atividades, mas todas caem em Fator R (fisioterapia é §5º-B XVI; terapia ocupacional/fonoaudiologia são §5º-B XXI) — tratamento final é o mesmo, citação usa a mais específica
  "04.09": "psicologia_terapias", // "Terapias de qualquer espécie" — "terapias" nomeado no §5º-B, XXI
  "04.10": "psicologia_terapias", // "Nutrição" — "clínicas de nutrição" nomeado no §5º-B, XXI
  "04.11": "medicina", // "Obstetrícia" — especialidade médica, mesma lógica de 04.01
  "04.12": "odontologia", // "Odontologia" — §5º-B, XX
  "04.14": "proteses_gerais", // "Próteses sob encomenda" — "serviços de prótese em geral", §5º-D, XIV
  "04.15": "psicologia_terapias", // "Psicanálise" — nomeada explicitamente no §5º-B, XXI
  "04.16": "psicologia_terapias", // "Psicologia" — nomeada explicitamente no §5º-B, XXI

  // Deixados de fora de propósito (ambíguos ou sem correspondência clara):
  // 04.02 (análises clínicas/patologia = laboratório; radioterapia/quimioterapia
  //   = tratamento médico geral; ressonância/radiologia/tomografia = diagnóstico
  //   por imagem — um único código LC 116 cobrindo 3 atividades diferentes
  //   da LC 123, sem como saber qual sem perguntar);
  // 04.03 (hospitais/clínicas/laboratórios — descreve o tipo de
  //   estabelecimento, não a atividade prestada);
  // 04.04 (instrumentação cirúrgica — sem menção equivalente na LC 123);
  // 04.07 (serviços farmacêuticos — sem menção equivalente na LC 123);
  // 04.13 (ortóptica — especialidade sem menção equivalente clara);
  // 04.17 a 04.21 (casas de repouso/creche geriátrica/inseminação/bancos de
  //   sangue/unidade móvel — atividades de apoio/infraestrutura, não a
  //   prestação profissional em si);
  // 04.22/04.23 (planos de saúde/convênios — administração de plano, não
  //   prestação do serviço médico).
};

export function sugerirAtividade(codigoLC116: string | null | undefined): AtividadeSimplesNacional | undefined {
  if (!codigoLC116) return undefined;
  const id = MAPA_LC116_PARA_ATIVIDADE[codigoLC116.trim()];
  return id ? buscarAtividade(id) : undefined;
}
