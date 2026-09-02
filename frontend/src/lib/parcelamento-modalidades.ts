// As 8 modalidades de parcelamento do Simples Nacional/MEI já
// confirmadas por chamada real (versão 1.0, 2026-09-02) — `id` é a
// chave usada tanto na URL das rotas proxy quanto no backend
// (_MODALIDADES_PARCELAMENTO em integra-contador/main.py) e no valor
// gravado em integra_contador_parcelamentos_sn.modalidade. `idSistema`/
// `idServicoListar` são os mesmos usados pra ler o cache genérico
// (integra_contador_cache) e mostrar "já verificado hoje".
export type ModalidadeParcelamento = {
  id: string;
  label: string;
  idSistema: string;
  idServicoListar: string;
};

export const MODALIDADES_PARCELAMENTO: ModalidadeParcelamento[] = [
  { id: "parcsn", label: "Simples Nacional", idSistema: "PARCSN", idServicoListar: "PEDIDOSPARC163" },
  { id: "parcsn-esp", label: "Simples Nacional Especial", idSistema: "PARCSN-ESP", idServicoListar: "PEDIDOSPARC173" },
  { id: "pertsn", label: "PERT-SN", idSistema: "PERTSN", idServicoListar: "PEDIDOSPARC183" },
  { id: "relpsn", label: "RELP-SN", idSistema: "RELPSN", idServicoListar: "PEDIDOSPARC193" },
  { id: "parcmei", label: "MEI", idSistema: "PARCMEI", idServicoListar: "PEDIDOSPARC203" },
  { id: "parcmei-esp", label: "MEI Especial", idSistema: "PARCMEI-ESP", idServicoListar: "PEDIDOSPARC213" },
  { id: "pertmei", label: "PERT-MEI", idSistema: "PERTMEI", idServicoListar: "PEDIDOSPARC223" },
  { id: "relpmei", label: "RELP-MEI", idSistema: "RELPMEI", idServicoListar: "PEDIDOSPARC233" },
];

export function modalidadePorId(id: string): ModalidadeParcelamento {
  return MODALIDADES_PARCELAMENTO.find((m) => m.id === id) ?? MODALIDADES_PARCELAMENTO[0];
}
