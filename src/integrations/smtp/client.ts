import nodemailer from "nodemailer";

export function createSmtpSender() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  return async ({ to, subject, text }: { to: string; subject: string; text: string }) => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM_EMAIL) throw new Error("SMTP não configurado.");
    await transport.sendMail({ from: { name: process.env.SMTP_FROM_NAME ?? "LeadHunter", address: process.env.SMTP_FROM_EMAIL }, to, subject, text });
  };
}
