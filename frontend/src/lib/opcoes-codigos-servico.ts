import type { DestaqueCodigo, OpcaoCodigo } from "@/components/ui/CodigoBusca";
import { LISTA_SERVICO_NACIONAL } from "@/lib/lista-servico-nacional";
import { NBS_DESCRICOES } from "@/lib/nbs-tabela";
import { CODIGO_MUNICIPAL_USADO, NBS_USADAS_POR_CODIGO } from "@/lib/servico-uso-clientes";

/** "040101" → "04.01.01" */
export function formatarCodigoNacional(c: string) {
  const d = c.replace(/\D/g, "").padStart(6, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}`;
}

/** "123012200" → "1.2301.22.00" */
export function formatarNbs(c: string) {
  const d = c.replace(/\D/g, "");
  if (d.length !== 9) return c;
  return `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7, 9)}`;
}

// Sinônimos do dia a dia por subitem (4 primeiros dígitos), pra quem busca
// "consulta", "dentista", "psicólogo" em vez do texto da lei.
const PALAVRAS_CHAVE: Record<string, string> = {
  "0401": "consulta consultas medico medica medicos clinico clinica geral atendimento ambulatorial plantao cirurgia cirurgiao pediatra cardiologista dermatologista ginecologista psiquiatra anestesista biomedico",
  "0402": "exame exames laboratorio imagem ultrassom ultrassonografia raio x radiografia tomografia ressonancia mamografia patologia quimioterapia radioterapia",
  "0403": "clinica hospital laboratorio pronto socorro ambulatorio casa de saude internacao",
  "0405": "acupunturista",
  "0406": "enfermeiro enfermeira tecnico de enfermagem home care cuidador",
  "0407": "farmacia farmaceutico manipulacao",
  "0408": "fisioterapeuta fisio pilates rpg fonoaudiologo fono terapeuta ocupacional reabilitacao",
  "0409": "terapeuta terapia massoterapia osteopatia quiropraxia",
  "0410": "nutricionista dieta",
  "0411": "obstetra parto",
  "0412": "dentista dentario odontologico ortodontia implante protese dentaria",
  "0413": "ortoptista",
  "0414": "protese protetico laboratorio de protese",
  "0415": "psicanalista",
  "0416": "psicologo psicologa psicoterapia terapia",
  "0417": "creche asilo casa de repouso idosos",
  "0419": "banco de sangue leite",
  "0501": "veterinario veterinaria pet animal",
  "0601": "barbearia barbeiro cabeleireiro manicure pedicure salao",
  "0602": "estetica esteticista depilacao limpeza de pele massagem",
  "0604": "academia personal trainer ginastica danca",
  "0801": "escola faculdade curso ensino regular",
  "0802": "curso aula aulas treinamento palestra professor mentoria",
  "1701": "consultoria assessoria consultor",
  "1719": "contabilidade contador contabil",
  "1716": "auditor",
  "1720": "consultoria financeira economica planejamento financeiro",
  "1712": "administracao gestao de negocios",
};

export const OPCOES_SERVICO_NACIONAL: OpcaoCodigo[] = LISTA_SERVICO_NACIONAL.map((c) => ({
  codigo: c.codigo,
  rotulo: formatarCodigoNacional(c.codigo),
  descricao: c.descricao.replace(/\.$/, ""),
  detalhe:
    c.subitem && c.subitem !== c.descricao
      ? `${c.subitem.replace(/\.$/, "")} — ${c.item.replace(/\.$/, "")}`
      : c.item.replace(/\.$/, ""),
  busca: PALAVRAS_CHAVE[c.codigo.slice(0, 4)],
}));

export const OPCOES_NBS: OpcaoCodigo[] = Object.entries(NBS_DESCRICOES).map(([codigo, descricao]) => ({
  codigo,
  rotulo: formatarNbs(codigo),
  descricao,
}));

function notas(n: number) {
  return n === 1 ? "1 nota" : `${n.toLocaleString("pt-BR")} notas`;
}

/** NBS que os clientes usaram junto com esse código nacional (mais usada primeiro). */
export function nbsSugeridasPara(codigoNacional: string): DestaqueCodigo[] {
  return (NBS_USADAS_POR_CODIGO[codigoNacional] ?? []).map(([codigo, n]) => ({
    codigo,
    nota: `usada em ${notas(n)} dos clientes com este serviço`,
  }));
}

/** Códigos municipais aceitos em notas de clientes do mesmo município com esse código nacional. */
export function codigosMunicipaisSugeridos(
  municipioIbge: string | null | undefined,
  codigoNacional: string,
): { codigo: string; nota: string }[] {
  if (!municipioIbge || !codigoNacional) return [];
  return (CODIGO_MUNICIPAL_USADO[`${municipioIbge}|${codigoNacional}`] ?? []).map(([codigo, n]) => ({
    codigo,
    nota: notas(n),
  }));
}
