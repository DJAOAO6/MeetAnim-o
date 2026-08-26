import type { EmailMessage } from "@/lib/email/provider";

export function passwordResetTemplate(resetUrl: string): Pick<EmailMessage, "subject" | "html" | "text"> {
  return {
    subject: "Réinitialisation de votre mot de passe Animéo",
    text: `Vous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur ce lien (valable 30 minutes) : ${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    html: `
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p><a href="${resetUrl}">Réinitialiser mon mot de passe</a> (valable 30 minutes)</p>
      <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    `,
  };
}

export function twoFactorCodeTemplate(code: string): Pick<EmailMessage, "subject" | "html" | "text"> {
  return {
    subject: `${code} — votre code de connexion Animéo`,
    text: `Votre code de connexion est : ${code}\n\nIl est valable 10 minutes et à usage unique. Si vous n'êtes pas à l'origine de cette tentative de connexion, ignorez cet email.`,
    html: `
      <p>Votre code de connexion est :</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:4px;">${code}</p>
      <p>Il est valable 10 minutes et à usage unique. Si vous n'êtes pas à l'origine de cette tentative de connexion, ignorez cet email.</p>
    `,
  };
}
