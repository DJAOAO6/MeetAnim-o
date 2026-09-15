import "server-only";

export type EmailAttachment = {
  filename: string;
  contentType: string;
  // Contenu déjà encodé en base64 — construit une fois à l'appel (ex.
  // Buffer.from(icsText, "utf8").toString("base64")), jamais recalculé côté
  // fournisseur.
  base64Content: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  // Adresse de réponse propre au message (ex. le cabinet pour un email client) :
  // sinon MAIL_REPLY_TO, pour qu'une réponse n'arrive jamais sur l'adresse
  // d'expédition des notifications.
  replyTo?: { email: string; name?: string };
};

/**
 * Un client qui répond à un email de rendez-vous ou de rappel s'adresse au
 * cabinet, pas à la plateforme : réponse dirigée vers l'email du profil
 * professionnel quand il est renseigné.
 */
export function professionalReplyTo(professional: { email: string; company: string }): EmailMessage["replyTo"] {
  const email = professional.email.trim();
  return email ? { email, name: professional.company.trim() || undefined } : undefined;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const attachmentsLabel = message.attachments?.length ? ` [pièce(s) jointe(s) : ${message.attachments.map((item) => item.filename).join(", ")}]` : "";
    console.log(
      `\n[email:dev] → ${message.to}\n[email:dev] Sujet : ${message.subject}${attachmentsLabel}\n${message.text}\n`,
    );
  }
}

class MailjetEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly fromEmail: string,
    private readonly fromName: string,
    private readonly defaultReplyTo: string | undefined,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const replyTo = message.replyTo?.email ? message.replyTo : this.defaultReplyTo ? { email: this.defaultReplyTo } : null;

    const response = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: this.fromEmail, Name: this.fromName },
            To: [{ Email: message.to }],
            ...(replyTo ? { ReplyTo: { Email: replyTo.email, ...(replyTo.name ? { Name: replyTo.name } : {}) } } : {}),
            Subject: message.subject,
            TextPart: message.text,
            HTMLPart: message.html,
            ...(message.attachments?.length
              ? { Attachments: message.attachments.map((item) => ({ ContentType: item.contentType, Filename: item.filename, Base64Content: item.base64Content })) }
              : {}),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Échec de l'envoi Mailjet (${response.status}) : ${body}`);
    }
  }
}

let cachedProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;

  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  const fromEmail = process.env.MAIL_FROM_ADDRESS;
  const fromName = process.env.MAIL_FROM_NAME || "1002 Pattes";
  const replyTo = process.env.MAIL_REPLY_TO || undefined;

  cachedProvider = apiKey && apiSecret && fromEmail
    ? new MailjetEmailProvider(apiKey, apiSecret, fromEmail, fromName, replyTo)
    : new ConsoleEmailProvider();

  return cachedProvider;
}
