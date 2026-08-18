import "server-only";
import crypto from "node:crypto";
import forge from "node-forge";

export type CertificateInfo = {
  expiresAt: Date;
  fingerprint: string;
};

/**
 * Lê um .pfx/.p12, confirmando a senha e extraindo validade + fingerprint.
 * Levanta erro com mensagem já amigável (senha errada, arquivo corrompido).
 */
export function parseCertificate(
  fileBytes: Buffer,
  password: string,
): CertificateInfo {
  let p12Asn1;
  try {
    p12Asn1 = forge.asn1.fromDer(fileBytes.toString("binary"));
  } catch {
    throw new Error("Arquivo inválido — selecione um certificado .pfx ou .p12.");
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch {
    throw new Error("Senha do certificado incorreta.");
  }

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = bags[forge.pki.oids.certBag]?.[0]?.cert;
  if (!cert) {
    throw new Error("Não foi possível encontrar o certificado dentro do arquivo.");
  }

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fingerprintHex = forge.md.sha256.create().update(der).digest().toHex();
  const fingerprint = (fingerprintHex.match(/.{2}/g) ?? [])
    .join(":")
    .toUpperCase();

  return { expiresAt: cert.validity.notAfter, fingerprint };
}

function getMasterKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY não configurada (necessária para guardar o certificado).",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MASTER_ENCRYPTION_KEY precisa ser uma chave de 32 bytes em base64.");
  }
  return key;
}

/** AES-256-GCM. Blob = iv(12) || authTag(16) || ciphertext. */
export function encryptSecret(data: Buffer): Buffer {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Formato de bytea aceito pelo PostgREST: string hex prefixada com \x. */
export function toBytea(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

/** Inverso de toBytea — como o PostgREST devolve uma coluna bytea ao ler. */
export function fromBytea(hexWithPrefix: string): Buffer {
  const hex = hexWithPrefix.startsWith("\\x") ? hexWithPrefix.slice(2) : hexWithPrefix;
  return Buffer.from(hex, "hex");
}

/** Inverso de encryptSecret. Levanta erro se a MASTER_ENCRYPTION_KEY mudou
 * ou o blob foi corrompido (a tag de autenticação do GCM não bate). */
export function decryptSecret(blob: Buffer): Buffer {
  const key = getMasterKey();
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
