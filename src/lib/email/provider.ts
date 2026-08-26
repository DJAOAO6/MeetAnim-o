import "server-only";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `\n[email:dev] → ${message.to}\n[email:dev] Sujet : ${message.subject}\n${message.text}\n`,
    );
  }
}

class MailjetEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly fromEmail: string,
    private readonly fromName: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
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
            Subject: message.subject,
            TextPart: message.text,
            HTMLPart: message.html,
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
  const fromName = process.env.MAIL_FROM_NAME ?? "Animéo";

  cachedProvider = apiKey && apiSecret && fromEmail
    ? new MailjetEmailProvider(apiKey, apiSecret, fromEmail, fromName)
    : new ConsoleEmailProvider();

  return cachedProvider;
}
