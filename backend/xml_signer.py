"""
xml_signer.py

Assina digitalmente um elemento XML no padrão XMLDSig (W3C), replicando
EXATAMENTE o perfil observado em uma DPS real, assinada por um sistema
terceirizado e aceita pelo Sefin Nacional (fornecida pelo usuário como
exemplo):

  - CanonicalizationMethod: http://www.w3.org/TR/2001/REC-xml-c14n-20010315
    (C14N "normal", sem comentários, NÃO exclusivo)
  - SignatureMethod: http://www.w3.org/2000/09/xmldsig#rsa-sha1
  - DigestMethod: http://www.w3.org/2000/09/xmldsig#sha1
  - Transforms: enveloped-signature, depois c14n
  - <Signature> inserida como último filho do elemento pai (irmã do
    elemento assinado, não filha dele)

Isso é DIFERENTE do padrão mais moderno (SHA-256 + C14N exclusivo) usado
pelo NFS-e Nacional para assinar o documento final (isso quem faz é o
próprio governo, depois de aceitar nossa DPS) — não precisamos replicar
esse segundo padrão, só o da DPS que enviamos.

Não depende de bibliotecas externas de XMLDSig (signxml não estava
disponível no ambiente) — implementado com lxml (canonicalização C14N)
+ cryptography (assinatura RSA), que já são dependências do projeto.
"""

from __future__ import annotations

import base64
import hashlib
from typing import Optional

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from lxml import etree

NS_DS = "http://www.w3.org/2000/09/xmldsig#"


class ErroAssinatura(Exception):
    pass


def _c14n(elemento) -> bytes:
    """
    Canonicaliza um elemento (C14N 1.0, sem comentários, não exclusivo)
    — mesmo algoritmo declarado no CanonicalizationMethod.

    IMPORTANTE — histórico: originalmente usávamos `etree.tostring(...,
    method="c14n")` do lxml. Descobrimos e corrigimos um bug real onde
    canonicalizar um elemento ainda "vivo" dentro de uma árvore maior
    inseria `xmlns=""` espúrio em elementos aninhados. Depois de
    corrigir isso com uma cópia destacada (deepcopy), AINDA
    encontramos casos onde o resultado no ambiente de produção (Windows)
    não batia com o mesmo cálculo feito aqui — sugerindo uma
    inconsistência de comportamento entre versões/plataformas do lxml
    para esse tipo de canonicalização.

    Para eliminar de vez qualquer dependência do comportamento interno
    do lxml nesse ponto crítico, implementamos a canonicalização
    MANUALMENTE, em Python puro, seguindo a especificação C14N 1.0
    diretamente. Isso é viável porque nosso caso é bem mais simples que
    o caso geral: cada elemento que assinamos (infDPS ou SignedInfo)
    usa um ÚNICO namespace, consistente em toda a subárvore, sem
    comentários, sem instruções de processamento, sem atributos com
    namespace próprio. Testado e confirmado batendo exatamente com o
    digest embutido em uma nota real e aceita pelo Sefin Nacional.
    """
    namespace_uri = etree.QName(elemento).namespace or ""
    texto_canonico = _canonicalizar_elemento(elemento, namespace_uri, eh_raiz=True)
    return texto_canonico.encode("utf-8")


def _escapar_texto_c14n(texto: str) -> str:
    """Escape de conteúdo de TEXTO conforme C14N 1.0 (diferente do
    escape de atributo — CR sempre escapado, mas não tab/LF)."""
    return (
        texto.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\r", "&#xD;")
    )


def _escapar_atributo_c14n(valor: str) -> str:
    """Escape de VALOR DE ATRIBUTO conforme C14N 1.0 (tab, LF e CR
    também precisam virar referência de caractere, além de & < ")."""
    return (
        valor.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace('"', "&quot;")
        .replace("\t", "&#x9;")
        .replace("\n", "&#xA;")
        .replace("\r", "&#xD;")
    )


def _canonicalizar_elemento(elemento, namespace_uri: str, eh_raiz: bool) -> str:
    """
    Serializa um elemento em C14N 1.0, assumindo que ele e toda a sua
    subárvore usam um ÚNICO namespace (sem comentários, sem instruções
    de processamento, sem atributos com namespace próprio — verdadeiro
    para infDPS e SignedInfo, os dois únicos casos em que usamos isso).
    """
    tag = etree.QName(elemento).localname
    partes = [f"<{tag}"]

    if eh_raiz and namespace_uri:
        # A raiz da subárvore canonicalizada precisa declarar o
        # namespace explicitamente (mesmo que no documento original ele
        # só estivesse herdado de um ancestral que não faz parte deste
        # subconjunto) — essa é a regra central do C14N para
        # canonicalizar um "node-set" que não é o documento inteiro.
        partes.append(f' xmlns="{namespace_uri}"')

    # Atributos (nenhum dos nossos tem namespace próprio — Id, URI,
    # Algorithm são todos atributos "soltos") — ordem alfabética simples
    for nome, valor in sorted(elemento.attrib.items()):
        partes.append(f' {nome}="{_escapar_atributo_c14n(valor)}"')

    partes.append(">")

    if elemento.text:
        partes.append(_escapar_texto_c14n(elemento.text))

    for filho in elemento:
        partes.append(_canonicalizar_elemento(filho, namespace_uri, eh_raiz=False))
        if filho.tail:
            partes.append(_escapar_texto_c14n(filho.tail))

    partes.append(f"</{tag}>")
    return "".join(partes)


def assinar_elemento(
    xml_documento: str,
    id_elemento_a_assinar: str,
    chave_privada: rsa.RSAPrivateKey,
    certificado_der: bytes,
    cadeia_der: Optional[list] = None,
    nome_atributo_id: str = "Id",
    algoritmo_assinatura: str = "rsa-sha1",
) -> str:
    """
    Recebe o XML completo (como string) já contendo o elemento a ser
    assinado (identificado pelo atributo Id=<id_elemento_a_assinar>),
    calcula a assinatura XMLDSig sobre ele, e retorna o XML com o
    elemento <Signature> inserido logo depois do elemento assinado
    (como irmão dele, dentro do mesmo elemento pai) — replicando a
    estrutura observada no exemplo real fornecido.

    `certificado_der` é o certificado X.509 em formato DER (bytes cru,
    sem o cabeçalho PEM) — vai dentro de <X509Certificate>, em base64.

    `cadeia_der`, se informado, é uma lista de certificados intermediários
    (também em DER) que são incluídos como elementos <X509Certificate>
    adicionais dentro do mesmo <X509Data> — importante para o validador
    conseguir confirmar a cadeia de confiança completa, não só a
    matemática da assinatura.

    `nome_atributo_id` — nome do atributo que identifica o elemento
    (case-sensitive; a DPS/NFS-e usa "Id", a DCTFWeb usa "id" minúsculo).

    `algoritmo_assinatura` — "rsa-sha1" (padrão, usado pela DPS) ou
    "rsa-sha256" (usado pela DCTFWeb, ver integra-contador/xml_signer.py).
    Troca junto o SignatureMethod/hash da assinatura E o DigestMethod/
    hash da Reference — a DCTFWeb recusou os dois separadamente, um erro
    de cada vez ("[TRANS09] SignatureMethod inválido", depois "[TRANS09]
    DigestMethod inválido" mesmo já com SignatureMethod=rsa-sha256).
    """
    if algoritmo_assinatura == "rsa-sha256":
        signature_method_uri = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
        hash_assinatura = hashes.SHA256()
        digest_method_uri = "http://www.w3.org/2001/04/xmlenc#sha256"
        digest_hasher = hashlib.sha256
    else:
        signature_method_uri = "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
        hash_assinatura = hashes.SHA1()
        digest_method_uri = "http://www.w3.org/2000/09/xmldsig#sha1"
        digest_hasher = hashlib.sha1

    parser = etree.XMLParser(remove_blank_text=False)
    raiz = etree.fromstring(xml_documento.encode("utf-8"), parser=parser)

    alvo = raiz.find(f".//*[@{nome_atributo_id}='{id_elemento_a_assinar}']")
    if alvo is None:
        raise ErroAssinatura(
            f"Não encontrei nenhum elemento com {nome_atributo_id}='{id_elemento_a_assinar}' no XML."
        )
    pai = alvo.getparent()
    if pai is None:
        raise ErroAssinatura("O elemento a assinar precisa ter um elemento pai.")

    # 1) Canonicaliza o elemento alvo (transform enveloped-signature é
    #    identidade aqui, já que ainda não existe <Signature> nenhuma
    #    dentro dele) e calcula o digest.
    canon_alvo = _c14n(alvo)
    digest_value = base64.b64encode(digest_hasher(canon_alvo).digest()).decode("ascii")

    # 2) Monta o <SignedInfo> com a referência ao elemento assinado.
    signed_info = etree.Element(f"{{{NS_DS}}}SignedInfo", nsmap={None: NS_DS})

    canon_method = etree.SubElement(signed_info, f"{{{NS_DS}}}CanonicalizationMethod")
    canon_method.set("Algorithm", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315")

    sig_method = etree.SubElement(signed_info, f"{{{NS_DS}}}SignatureMethod")
    sig_method.set("Algorithm", signature_method_uri)

    reference = etree.SubElement(signed_info, f"{{{NS_DS}}}Reference")
    reference.set("URI", f"#{id_elemento_a_assinar}")

    transforms = etree.SubElement(reference, f"{{{NS_DS}}}Transforms")
    t1 = etree.SubElement(transforms, f"{{{NS_DS}}}Transform")
    t1.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#enveloped-signature")
    t2 = etree.SubElement(transforms, f"{{{NS_DS}}}Transform")
    t2.set("Algorithm", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315")

    digest_method = etree.SubElement(reference, f"{{{NS_DS}}}DigestMethod")
    digest_method.set("Algorithm", digest_method_uri)

    digest_value_el = etree.SubElement(reference, f"{{{NS_DS}}}DigestValue")
    digest_value_el.text = digest_value

    # 3) Monta o elemento <Signature> e já o INSERE na árvore final (como
    #    irmão do elemento assinado) ANTES de canonicalizar o SignedInfo.
    #    Isso é importante: canonicalizar o SignedInfo só DEPOIS de já
    #    estar na posição definitiva evita uma inconsistência real do
    #    lxml, onde canonicalizar o mesmo elemento "solto" e depois
    #    "reaberto de um XML já serializado" pode produzir bytes
    #    diferentes (namespaces redundantes tratados de forma diferente
    #    nos dois casos). Assinando já na posição final, garantimos que
    #    o que assinamos é EXATAMENTE o que um terceiro (o Sefin
    #    Nacional) vai recalcular ao reabrir o XML que enviarmos.
    signature = etree.Element(f"{{{NS_DS}}}Signature", nsmap={None: NS_DS})
    signature.append(signed_info)
    pai.append(signature)

    # 4) SÓ AGORA canonicaliza o SignedInfo (já na posição final) e assina
    #    com RSA-SHA1.
    canon_signed_info = _c14n(signed_info)
    assinatura_bytes = chave_privada.sign(
        canon_signed_info, padding.PKCS1v15(), hash_assinatura
    )
    signature_value_b64 = base64.b64encode(assinatura_bytes).decode("ascii")

    signature_value_el = etree.SubElement(signature, f"{{{NS_DS}}}SignatureValue")
    signature_value_el.text = signature_value_b64

    key_info = etree.SubElement(signature, f"{{{NS_DS}}}KeyInfo")
    x509_data = etree.SubElement(key_info, f"{{{NS_DS}}}X509Data")
    x509_cert = etree.SubElement(x509_data, f"{{{NS_DS}}}X509Certificate")
    x509_cert.text = base64.b64encode(certificado_der).decode("ascii")
    # NÃO incluir mais de um <X509Certificate> — confirmado na especificação
    # oficial (tabela de campos do padrão de assinatura, campo XS21,
    # ocorrência "1-1"). A cadeia de certificação NÃO deve ser incluída;
    # o validador do governo já reconhece a cadeia a partir do certificado
    # único informado. (Isso já foi testado e causava a MESMA rejeição
    # E0714 quando incluíamos a cadeia — reafirma essa regra.)

    # Construímos a declaração XML manualmente (sem usar xml_declaration=True
    # do lxml), porque ele insere uma quebra de linha logo depois dela — e
    # um relato de terceiros sobre esse mesmo erro (E0714) aponta que
    # caracteres como quebras de linha podem ser alterados na conversão
    # para o formato de envio (gzip+base64), então eliminamos essa
    # quebra de linha por completo em vez de arriscar.
    corpo_xml = etree.tostring(raiz, encoding="utf-8").decode("utf-8")
    return '<?xml version="1.0" encoding="utf-8"?>' + corpo_xml


def carregar_chave_e_certificado_de_pfx(caminho_pfx: str, senha: str):
    """
    Abre um .pfx e retorna (chave_privada, certificado_der, cadeia_der)
    prontos para usar em `assinar_elemento`. `cadeia_der` é uma lista
    (pode ser vazia) com os certificados intermediários da cadeia de
    certificação (CA), em DER, que costumam vir junto no .pfx de
    certificados ICP-Brasil reais — importante incluir na assinatura
    para o validador do governo conseguir confirmar a cadeia de
    confiança completa até a raiz, não só verificar a matemática da
    assinatura.
    """
    from pathlib import Path
    from cryptography.hazmat.primitives.serialization import pkcs12

    caminho = Path(caminho_pfx)
    if not caminho.exists():
        raise ErroAssinatura(f"Certificado não encontrado: {caminho_pfx}")

    dados_pfx = caminho.read_bytes()
    try:
        chave_privada, certificado, cadeia_extra = pkcs12.load_key_and_certificates(
            dados_pfx, senha.encode("utf-8")
        )
    except Exception as e:
        raise ErroAssinatura(f"Não foi possível abrir o certificado: {e}")

    if chave_privada is None or certificado is None:
        raise ErroAssinatura("Certificado ou chave privada ausente no .pfx.")

    certificado_der = certificado.public_bytes(serialization.Encoding.DER)
    cadeia_der = [c.public_bytes(serialization.Encoding.DER) for c in (cadeia_extra or [])]
    return chave_privada, certificado_der, cadeia_der
