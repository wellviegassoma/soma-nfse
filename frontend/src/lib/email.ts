import "server-only";

import nodemailer from "nodemailer";

// Envio de e-mail do próprio sistema (alertas de Tarefas). Usa o mesmo SMTP
// do Gmail que o Supabase Auth usa (senha de app), configurado nas variáveis
// SMTP_* da Vercel. Sem SMTP_USER/SMTP_PASS o envio fica desligado — quem
// chama recebe `false` e segue.

export function emailConfigurado(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporte: nodemailer.Transporter | null = null;

function obterTransporte() {
  transporte ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporte;
}

export async function enviarEmail(msg: { para: string; assunto: string; html: string; texto: string }): Promise<boolean> {
  if (!emailConfigurado()) return false;
  await obterTransporte().sendMail({
    from: process.env.SMTP_FROM || `SOMA Gestão <${process.env.SMTP_USER}>`,
    to: msg.para,
    subject: msg.assunto,
    html: msg.html,
    text: msg.texto,
  });
  return true;
}
