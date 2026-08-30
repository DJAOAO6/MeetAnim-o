import type { EmailMessage } from "@/lib/email/provider";

/**
 * Les gabarits de demande de rendez-vous interpolent des valeurs saisies
 * via le formulaire public non authentifié (nom, animal, motif...) dans le
 * corps HTML de l'email — échappées pour ne jamais laisser une saisie
 * casser le balisage ou injecter du HTML, contrairement aux gabarits
 * existants (réinitialisation, code 2FA) dont les valeurs sont générées
 * côté serveur.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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

export type BookingRequestClientParams = {
  clientFirstName: string;
  animalName: string;
  serviceName: string;
  dateLabel: string;
  time: string;
  modeLabel: string;
  locationLabel: string;
  professionalFirstName: string;
  professionalCompany: string;
  professionalPhone: string;
  totalPrice: number;
  reference: string;
};

/**
 * Confirmation envoyée au client à la soumission d'une demande publique
 * (statut PENDING, pas encore un rendez-vous confirmé) — voir
 * submitPublicBookingAction (src/lib/appointments-actions.ts). Best-effort :
 * un échec d'envoi n'annule jamais la demande déjà enregistrée en base.
 */
export function bookingRequestClientTemplate(params: BookingRequestClientParams): Pick<EmailMessage, "subject" | "html" | "text"> {
  const { clientFirstName, animalName, serviceName, dateLabel, time, modeLabel, locationLabel, professionalFirstName, professionalCompany, professionalPhone, totalPrice, reference } = params;
  return {
    subject: `Demande de rendez-vous envoyée à ${professionalCompany}`,
    text: [
      `Bonjour ${clientFirstName},`,
      "",
      `Votre demande de rendez-vous pour ${animalName} a bien été envoyée à ${professionalFirstName} (${professionalCompany}). Elle est en attente de validation.`,
      "",
      `Prestation : ${serviceName}`,
      `Date : ${dateLabel} à ${time}`,
      `Mode : ${modeLabel}${locationLabel ? ` — ${locationLabel}` : ""}`,
      `Tarif estimé : ${totalPrice} €`,
      `Référence : ${reference}`,
      "",
      `Pour toute question, contactez directement ${professionalFirstName} au ${professionalPhone}.`,
    ].join("\n"),
    html: `
      <p>Bonjour ${escapeHtml(clientFirstName)},</p>
      <p>Votre demande de rendez-vous pour <strong>${escapeHtml(animalName)}</strong> a bien été envoyée à ${escapeHtml(professionalFirstName)} (${escapeHtml(professionalCompany)}). Elle est <strong>en attente de validation</strong>.</p>
      <ul>
        <li>Prestation : ${escapeHtml(serviceName)}</li>
        <li>Date : ${dateLabel} à ${time}</li>
        <li>Mode : ${modeLabel}${locationLabel ? ` — ${escapeHtml(locationLabel)}` : ""}</li>
        <li>Tarif estimé : ${totalPrice} €</li>
        <li>Référence : ${escapeHtml(reference)}</li>
      </ul>
      <p>Pour toute question, contactez directement ${escapeHtml(professionalFirstName)} au ${escapeHtml(professionalPhone)}.</p>
    `,
  };
}

export type BookingRequestProfessionalParams = {
  professionalFirstName: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  animalName: string;
  animalSpecies: string;
  serviceName: string;
  dateLabel: string;
  time: string;
  modeLabel: string;
  locationLabel: string;
  notes: string;
};

/** Notification envoyée au praticien à chaque nouvelle demande publique. */
export function bookingRequestProfessionalTemplate(params: BookingRequestProfessionalParams): Pick<EmailMessage, "subject" | "html" | "text"> {
  const { professionalFirstName, clientName, clientPhone, clientEmail, animalName, animalSpecies, serviceName, dateLabel, time, modeLabel, locationLabel, notes } = params;
  return {
    subject: `Nouvelle demande de rendez-vous — ${clientName} (${animalName})`,
    text: [
      `Bonjour ${professionalFirstName},`,
      "",
      `Une nouvelle demande de rendez-vous vient d'être envoyée depuis votre page de réservation.`,
      "",
      `Client·e : ${clientName} — ${clientPhone} — ${clientEmail}`,
      `Animal : ${animalName} (${animalSpecies})`,
      `Prestation : ${serviceName}`,
      `Date : ${dateLabel} à ${time}`,
      `Mode : ${modeLabel}${locationLabel ? ` — ${locationLabel}` : ""}`,
      notes ? `Motif : ${notes}` : "",
      "",
      "Retrouvez cette demande dans votre tableau de bord pour la confirmer.",
    ].filter(Boolean).join("\n"),
    html: `
      <p>Bonjour ${escapeHtml(professionalFirstName)},</p>
      <p>Une nouvelle demande de rendez-vous vient d'être envoyée depuis votre page de réservation.</p>
      <ul>
        <li>Client·e : ${escapeHtml(clientName)} — ${escapeHtml(clientPhone)} — ${escapeHtml(clientEmail)}</li>
        <li>Animal : ${escapeHtml(animalName)} (${escapeHtml(animalSpecies)})</li>
        <li>Prestation : ${escapeHtml(serviceName)}</li>
        <li>Date : ${dateLabel} à ${time}</li>
        <li>Mode : ${modeLabel}${locationLabel ? ` — ${escapeHtml(locationLabel)}` : ""}</li>
        ${notes ? `<li>Motif : ${escapeHtml(notes)}</li>` : ""}
      </ul>
      <p>Retrouvez cette demande dans votre tableau de bord pour la confirmer.</p>
    `,
  };
}

/**
 * Rappel de suivi envoyé à un client — le corps du message est
 * intégralement rédigé par le praticien (ReminderModal, éditable avant
 * envoi) : ce gabarit ne fait qu'y appliquer une mise en forme minimale,
 * pas de contenu généré ici. Saisie libre, donc échappée comme les
 * gabarits de réservation publique.
 */
export function reminderEmailTemplate(params: { professionalCompany: string; message: string }): Pick<EmailMessage, "subject" | "html" | "text"> {
  const { professionalCompany, message } = params;
  return {
    subject: `Un petit rappel de ${professionalCompany}`,
    text: message,
    html: `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
  };
}
