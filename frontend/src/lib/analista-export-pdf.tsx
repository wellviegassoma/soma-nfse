import "server-only";
/* eslint-disable jsx-a11y/alt-text -- <Image> do react-pdf não tem alt (não é <img>) */

// PDF da tela da Serena / do Newton (A4 deitado): logo da SOMA, cartões de
// resumo, a esteira de cada empresa em bolinhas coloridas (como na tela) e,
// no fim, os motivos pendentes e aceitos. Fonte Helvetica embutida (sem ✓:
// a cor da bolinha diz o estado; legenda no topo da tabela).
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { EstadoEtapa } from "@/lib/serena";
import { SOMA_LOGO_PNG_BASE64, SOMA_LOGO_PROPORCAO } from "@/lib/soma-logo-base64";
import { FOTO_NEWTON_PNG_BASE64, FOTO_SERENA_PNG_BASE64 } from "@/lib/analista-fotos-base64";
import {
  COR,
  ROTULO_ESTADO,
  ROTULO_SITUACAO,
  formatarValor,
  rotuloCompetenciaLonga,
  type RelatorioAnalista,
  type SituacaoRel,
} from "@/lib/analista-export";

// Sem hifenização automática ("ES-PECIALIZADA", "verifica-do"): quebra só entre palavras.
Font.registerHyphenationCallback((palavra) => [palavra]);

// Paginação por altura estimada (pt): a 1ª página tem cabeçalho e cartões;
// as outras repetem só o cabeçalho da tabela (cada página é uma <Page>).
const ALTURA_PRIMEIRA = 360;
const ALTURA_DEMAIS = 500;
const RECADO_MAX = 260; // no PDF o recado é resumido; o texto inteiro está no Excel

const recadoPdf = (r: string) => (r.length > RECADO_MAX ? `${r.slice(0, RECADO_MAX - 1).trimEnd()}…` : r);

function alturaLinha(l: RelatorioAnalista["linhas"][number], larguraRecado: number) {
  const porLinha = Math.max(20, Math.floor(larguraRecado / 3.15));
  const linhasRecado = Math.ceil(recadoPdf(l.recado).length / porLinha) || 1;
  const linhasNome = Math.ceil(l.nome.length / 30);
  return Math.max(28, linhasRecado * 7.8 + 10, linhasNome * 9 + 16);
}

function larguras(nEtapas: number) {
  const etapa = Math.max(26, Math.min(40, Math.floor(330 / Math.max(nEtapas, 1))));
  const recado = 790 - (26 + 136 + 58 + 2 * 60) - etapa * nEtapas;
  return { etapa, recado };
}

function paginar(rel: RelatorioAnalista) {
  const { recado } = larguras(rel.etapas.length);
  const paginas: RelatorioAnalista["linhas"][] = [[]];
  let usado = 0;
  for (const l of rel.linhas) {
    const h = alturaLinha(l, recado);
    const limite = paginas.length === 1 ? ALTURA_PRIMEIRA : ALTURA_DEMAIS;
    if (usado + h > limite && paginas[paginas.length - 1].length) {
      paginas.push([]);
      usado = 0;
    }
    paginas[paginas.length - 1].push(l);
    usado += h;
  }
  return paginas;
}

const COR_ESTADO: Record<EstadoEtapa, string> = { ok: COR.ok, pendente: "#F59E0B", problema: COR.problema, na: "#D1D5DB" };
const MARCA_ESTADO: Record<EstadoEtapa, string> = { ok: "", pendente: "", problema: "!", na: "" };
const COR_SIT: Record<SituacaoRel, [string, string]> = {
  acao: [COR.pendente, COR.pendenteFundo],
  ia: [COR.ia, COR.iaFundo],
  concluida: [COR.ok, COR.okFundo],
};

const st = StyleSheet.create({
  pagina: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 26, fontFamily: "Helvetica", fontSize: 7.5, color: COR.texto },
  topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: COR.dourado },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 16, color: COR.marinho },
  sub: { fontSize: 9, color: COR.dourado, fontFamily: "Helvetica-Bold", marginTop: 2 },
  meta: { fontSize: 7, color: COR.suave, marginTop: 2 },
  cartoes: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 12 },
  cartao: { flex: 1, borderWidth: 1, borderColor: COR.linha, borderRadius: 6, padding: 8, backgroundColor: COR.fundo },
  cartaoTit: { fontSize: 6.5, color: COR.suave, textTransform: "uppercase", letterSpacing: 0.4 },
  cartaoVal: { fontFamily: "Helvetica-Bold", fontSize: 13, color: COR.marinho, marginTop: 3 },
  cartaoDet: { fontSize: 6.5, color: COR.suave, marginTop: 2 },
  cab: { flexDirection: "row", backgroundColor: COR.marinho, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 6.5, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  celCab: { paddingVertical: 5, paddingHorizontal: 3, justifyContent: "center" },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COR.linha, minHeight: 24 },
  cel: { paddingVertical: 4, paddingHorizontal: 3, justifyContent: "center" },
  bolinha: { width: 11, height: 11, borderRadius: 6, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  pill: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 5, alignSelf: "flex-start" },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 10, color: COR.marinho, marginTop: 14, marginBottom: 6 },
  rodape: { position: "absolute", bottom: 14, left: 26, right: 26, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: COR.suave, borderTopWidth: 0.5, borderTopColor: COR.linha, paddingTop: 4 },
});

// Larguras (pt) — A4 deitado tem 790 úteis.
const W = { cod: 26, empresa: 136, sit: 58, valor: 60 };

function Tabela({ rel, linhas }: { rel: RelatorioAnalista; linhas: RelatorioAnalista["linhas"] }) {
  const larguraEtapa = larguras(rel.etapas.length).etapa;
  // Valor de abertura (receita) e de fechamento (DAS / total de tributos)
  const iValores = [0, rel.colunasValor.length - 1];
  return (
    <View>
      <View style={st.cab}>
        <View style={[st.celCab, { width: W.cod }]}>
          <Text>Cód.</Text>
        </View>
        <View style={[st.celCab, { width: W.empresa }]}>
          <Text>Empresa</Text>
        </View>
        <View style={[st.celCab, { width: W.sit }]}>
          <Text>Situação</Text>
        </View>
        {iValores.map((i) => (
          <View key={i} style={[st.celCab, { width: W.valor, alignItems: "flex-end" }]}>
            <Text>{rel.colunasValor[i].titulo}</Text>
          </View>
        ))}
        {rel.etapas.map((e) => (
          <View key={e.chave} style={[st.celCab, { width: larguraEtapa, alignItems: "center" }]}>
            <Text style={{ fontSize: 5.8, textAlign: "center" }}>{e.nome}</Text>
          </View>
        ))}
        <View style={[st.celCab, { flex: 1 }]}>
          <Text>Recado</Text>
        </View>
      </View>
      {linhas.map((l, i) => (
        <View key={i} style={[st.linha, { backgroundColor: i % 2 ? COR.fundo : "#FFFFFF" }]} wrap={false}>
          <View style={[st.cel, { width: W.cod, alignItems: "center" }]}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: COR.marinho }}>{l.codigo}</Text>
          </View>
          <View style={[st.cel, { width: W.empresa }]}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: COR.marinho }}>{l.nome}</Text>
            <Text style={{ fontSize: 6, color: COR.suave, marginTop: 1 }}>
              {[l.municipio, ...l.etiquetas].join(" · ")}
              {l.responsaveis.fiscal.includes("+") ? ` · apoio ${l.responsaveis.fiscal.split("+ ")[1]}` : ""}
            </Text>
          </View>
          <View style={[st.cel, { width: W.sit }]}>
            <View style={[st.pill, { backgroundColor: COR_SIT[l.situacao][1] }]}>
              <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", color: COR_SIT[l.situacao][0] }}>{ROTULO_SITUACAO[l.situacao]}</Text>
            </View>
          </View>
          {iValores.map((k) => (
            <View key={k} style={[st.cel, { width: W.valor, alignItems: "flex-end" }]}>
              <Text>{formatarValor(l.valores[k], rel.colunasValor[k].tipo)}</Text>
            </View>
          ))}
          {rel.etapas.map((e) => {
            const et = l.etapas[e.chave];
            return (
              <View key={e.chave} style={[st.cel, { width: larguraEtapa, alignItems: "center" }]}>
                {et ? (
                  <>
                    <View style={[st.bolinha, { backgroundColor: COR_ESTADO[et.estado] }]}>
                      <Text style={{ color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7 }}>{MARCA_ESTADO[et.estado]}</Text>
                    </View>
                    <Text style={{ fontSize: 4.8, color: COR.suave, textAlign: "center", marginTop: 1.5 }}>
                      {et.titulo.length > 22 ? `${et.titulo.slice(0, 21)}…` : et.titulo}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: COR.na }}>—</Text>
                )}
              </View>
            );
          })}
          <View style={[st.cel, { flex: 1 }]}>
            <Text style={{ fontSize: 6.3 }}>{recadoPdf(l.recado)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Legenda() {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 5, alignItems: "center" }}>
      <Text style={{ fontSize: 6.5, color: COR.suave }}>Etapas:</Text>
      {(["ok", "pendente", "problema", "na"] as EstadoEtapa[]).map((s) => (
        <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View style={[st.bolinha, { width: 8, height: 8, backgroundColor: COR_ESTADO[s] }]} />
          <Text style={{ fontSize: 6.5 }}>{ROTULO_ESTADO[s]}</Text>
        </View>
      ))}
    </View>
  );
}

function Motivos({ rel }: { rel: RelatorioAnalista }) {
  const com = rel.linhas.filter((l) => l.motivos.length || l.aceitos.length);
  if (!com.length) return null;
  return (
    <View>
      <Text style={st.secao}>Motivos da conferência</Text>
      {com.map((l, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COR.linha, paddingVertical: 4 }}>
          <Text style={{ width: 180, paddingRight: 10, fontFamily: "Helvetica-Bold", color: COR.marinho }}>
            {l.codigo} · {l.nome}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            {l.motivos.map((m, k) => (
              <Text key={`m${k}`} style={{ color: m.startsWith("[bloqueio]") ? COR.problema : COR.pendente }}>
                • {m}
              </Text>
            ))}
            {l.aceitos.map((m, k) => (
              <Text key={`a${k}`} style={{ color: COR.ok }}>
                Aceito: {m}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Relatorio({ rel }: { rel: RelatorioAnalista }) {
  const foto = rel.analista === "SERENA" ? FOTO_SERENA_PNG_BASE64 : FOTO_NEWTON_PNG_BASE64;
  const gerado = rel.geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const paginas = paginar(rel);
  return (
    <Document title={`${rel.nomeIa} · ${rel.regime} · ${rel.competencia}`} author="SOMA Contabilidade Integrada" creator="SOMA Gestão">
      {paginas.map((linhas, p) => (
        <Page key={p} size="A4" orientation="landscape" style={st.pagina}>
          {p === 0 ? (
            <>
              <View style={st.topo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Image src={`data:image/png;base64,${foto}`} style={{ width: 40, height: 40 }} />
                  <View>
                    <Text style={st.titulo}>
                      {rel.nomeIa} · {rel.regime}
                    </Text>
                    <Text style={st.sub}>Fechamento da competência {rotuloCompetenciaLonga(rel.competencia)}</Text>
                    <Text style={st.meta}>
                      {rel.filtroDescricao} · gerado em {gerado}
                    </Text>
                  </View>
                </View>
                <Image src={`data:image/png;base64,${SOMA_LOGO_PNG_BASE64}`} style={{ height: 46, width: 46 * SOMA_LOGO_PROPORCAO }} />
              </View>
              <View style={st.cartoes}>
                {rel.cartoes.map((c) => (
                  <View key={c.titulo} style={st.cartao}>
                    <Text style={st.cartaoTit}>{c.titulo}</Text>
                    <Text style={st.cartaoVal}>{c.valor}</Text>
                    <Text style={st.cartaoDet}>{c.detalhe}</Text>
                  </View>
                ))}
              </View>
              <Legenda />
            </>
          ) : (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: COR.marinho }}>
                {rel.nomeIa} · {rel.regime} · {rotuloCompetenciaLonga(rel.competencia)}
              </Text>
              <Image src={`data:image/png;base64,${SOMA_LOGO_PNG_BASE64}`} style={{ height: 22, width: 22 * SOMA_LOGO_PROPORCAO }} />
            </View>
          )}
          {linhas.length > 0 && <Tabela rel={rel} linhas={linhas} />}
          {p === paginas.length - 1 && <Motivos rel={rel} />}
          <View style={st.rodape} fixed>
            <Text>
              SOMA Contabilidade Integrada · {rel.nomeIa} · {rel.regime} · {rotuloCompetenciaLonga(rel.competencia)}
            </Text>
            <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function gerarPdfAnalista(rel: RelatorioAnalista): Promise<Buffer> {
  return renderToBuffer(<Relatorio rel={rel} />);
}
