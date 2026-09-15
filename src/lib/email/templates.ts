import type { EmailMessage } from "@/lib/email/provider";

/**
 * Les gabarits interpolent des valeurs saisies via le formulaire public non
 * authentifié (nom, animal, motif...) ou rédigées par le praticien (rappels)
 * dans le corps HTML de l'email — toujours échappées pour ne jamais laisser
 * une saisie casser le balisage ou injecter du HTML.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type EmailContent = Pick<EmailMessage, "subject" | "html" | "text">;

// Palette du thème 1002 Pattes (src/data/dashboard-theme.ts) : primaire #A9531C
// en texte blanc sur bouton (contraste 5,3:1), fond crème chaleureux.
const brand = {
  primary: "#A9531C",
  secondary: "#7A4A2A",
  accentSoft: "#FBEBD3",
  background: "#F7F1EA",
  card: "#FFFFFF",
  border: "#EADBCB",
  text: "#2E2520",
  muted: "#7C6D63",
};

const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

type LayoutOptions = {
  // Texte d'aperçu affiché par les messageries sous l'objet, jamais visible dans le corps.
  preheader: string;
  title: string;
  body: string;
  // Signature du bas : le cabinet pour un email client, la plateforme sinon.
  footer: string;
};

/**
 * Mise en page commune à tous les emails : tableaux et styles en ligne, seule
 * construction rendue de façon fiable par Outlook, Gmail et les webmails
 * (pas de flex/grid ni de feuille de style externe).
 */
function layout({ preheader, title, body, footer }: LayoutOptions): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.background};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:0 0 20px;">
            <img src="${appUrl()}/1002-pattes-logo.png" width="140" height="82" alt="1002 Pattes" style="display:block;border:0;width:140px;height:auto;">
          </td>
        </tr>
        <tr>
          <td style="background:${brand.card};border:1px solid ${brand.border};border-radius:16px;padding:32px 28px;font-family:${fontStack};color:${brand.text};font-size:15px;line-height:1.6;">
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${brand.secondary};font-weight:700;">${escapeHtml(title)}</h1>
            ${body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 12px 0;font-family:${fontStack};color:${brand.muted};font-size:12px;line-height:1.5;">
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;">${html}</p>`;
}

function mutedParagraph(html: string): string {
  return `<p style="margin:14px 0 0;color:${brand.muted};font-size:13px;">${html}</p>`;
}

/** Récapitulatif libellé → valeur ; les valeurs sont échappées ici, jamais par l'appelant. */
function detailsTable(rows: Array<[label: string, value: string]>): string {
  const cells = rows
    .filter(([, value]) => value)
    .map(([label, value]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;color:${brand.muted};font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:6px 0;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
      </tr>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:${brand.accentSoft};border-radius:12px;">
    <tr><td style="padding:12px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${fontStack};color:${brand.text};font-size:14px;">${cells}</table></td></tr>
  </table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">
    <tr><td style="border-radius:10px;background:${brand.primary};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:${fontStack};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

// replyReachesSupport : faux quand la réponse est dirigée ailleurs (ex. vers le
// client pour une notification de réservation), l'aide passe alors par l'adresse.
function platformFooter(replyReachesSupport = true): string {
  const help = replyReachesSupport ? "Besoin d'aide ? Répondez simplement à cet email." : "Besoin d'aide ? Écrivez à support@1002pattes.fr.";
  return `1002 Pattes — l'agenda des professionnels du soin animal<br>${help}`;
}

function professionalFooter(professionalCompany: string, professionalPhone: string): string {
  const phone = professionalPhone.trim() ? ` · ${escapeHtml(professionalPhone)}` : "";
  return `${escapeHtml(professionalCompany)}${phone}<br>Envoyé via 1002 Pattes — répondez à cet email pour écrire au cabinet.`;
}

function contactLine(professionalFirstName: string, professionalPhone: string): { text: string; html: string } {
  if (!professionalPhone.trim()) {
    return { text: `Pour toute question, répondez simplement à cet email.`, html: `Pour toute question, répondez simplement à cet email.` };
  }
  return {
    text: `Pour toute question, contactez ${professionalFirstName} au ${professionalPhone} ou répondez à cet email.`,
    html: `Pour toute question, contactez ${escapeHtml(professionalFirstName)} au <strong>${escapeHtml(professionalPhone)}</strong> ou répondez simplement à cet email.`,
  };
}

function modeValue(modeLabel: string, locationLabel: string): string {
  return locationLabel ? `${modeLabel} — ${locationLabel}` : modeLabel;
}

export function passwordResetTemplate(resetUrl: string): EmailContent {
  return {
    subject: "Réinitialisation de votre mot de passe 1002 Pattes",
    text: `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe 1002 Pattes.\n\nChoisissez un nouveau mot de passe avec ce lien (valable 30 minutes) :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé.`,
    html: layout({
      preheader: "Choisissez un nouveau mot de passe — lien valable 30 minutes.",
      title: "Réinitialisation du mot de passe",
      body: [
        paragraph("Bonjour,"),
        paragraph("Vous avez demandé la réinitialisation de votre mot de passe 1002 Pattes. Cliquez sur le bouton ci-dessous pour en choisir un nouveau."),
        button(resetUrl, "Choisir un nouveau mot de passe"),
        paragraph(`Ce lien est valable <strong>30 minutes</strong>.`),
        mutedParagraph("Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé."),
        mutedParagraph(`Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br><a href="${escapeHtml(resetUrl)}" style="color:${brand.primary};word-break:break-all;">${escapeHtml(resetUrl)}</a>`),
      ].join(""),
      footer: platformFooter(),
    }),
  };
}

export function twoFactorCodeTemplate(code: string): EmailContent {
  return {
    subject: `${code} — votre code de connexion 1002 Pattes`,
    text: `Votre code de connexion 1002 Pattes est : ${code}\n\nIl est valable 10 minutes et à usage unique. Si vous n'êtes pas à l'origine de cette tentative de connexion, ignorez cet email et pensez à changer votre mot de passe.`,
    html: layout({
      preheader: `Votre code de connexion : ${code}`,
      title: "Votre code de connexion",
      body: [
        paragraph("Saisissez ce code pour terminer votre connexion à 1002 Pattes :"),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td align="center" style="background:${brand.accentSoft};border-radius:12px;padding:18px 12px;font-family:${fontStack};font-size:32px;font-weight:800;letter-spacing:8px;color:${brand.secondary};">${escapeHtml(code)}</td></tr></table>`,
        paragraph(`Il est valable <strong>10 minutes</strong> et à usage unique.`),
        mutedParagraph("Si vous n'êtes pas à l'origine de cette tentative de connexion, ignorez cet email et pensez à changer votre mot de passe."),
      ].join(""),
      footer: platformFooter(),
    }),
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
export function bookingRequestClientTemplate(params: BookingRequestClientParams): EmailContent {
  const { clientFirstName, animalName, serviceName, dateLabel, time, modeLabel, locationLabel, professionalFirstName, professionalCompany, professionalPhone, totalPrice, reference } = params;
  const contact = contactLine(professionalFirstName, professionalPhone);
  return {
    subject: `Demande de rendez-vous envoyée à ${professionalCompany}`,
    text: [
      `Bonjour ${clientFirstName},`,
      "",
      `Votre demande de rendez-vous pour ${animalName} a bien été envoyée à ${professionalFirstName} (${professionalCompany}). Elle est en attente de validation : vous recevrez un email dès qu'elle sera confirmée.`,
      "",
      `Prestation : ${serviceName}`,
      `Date : ${dateLabel} à ${time}`,
      `Mode : ${modeValue(modeLabel, locationLabel)}`,
      `Tarif estimé : ${totalPrice} €`,
      `Référence : ${reference}`,
      "",
      contact.text,
    ].join("\n"),
    html: layout({
      preheader: `Demande pour ${animalName} le ${dateLabel} à ${time} — en attente de validation.`,
      title: "Demande de rendez-vous envoyée",
      body: [
        paragraph(`Bonjour ${escapeHtml(clientFirstName)},`),
        paragraph(`Votre demande de rendez-vous pour <strong>${escapeHtml(animalName)}</strong> a bien été envoyée à ${escapeHtml(professionalFirstName)} (${escapeHtml(professionalCompany)}). Elle est <strong>en attente de validation</strong> : vous recevrez un email dès qu'elle sera confirmée.`),
        detailsTable([
          ["Prestation", serviceName],
          ["Date", `${dateLabel} à ${time}`],
          ["Mode", modeValue(modeLabel, locationLabel)],
          ["Tarif estimé", `${totalPrice} €`],
          ["Référence", reference],
        ]),
        paragraph(contact.html),
      ].join(""),
      footer: professionalFooter(professionalCompany, professionalPhone),
    }),
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
export function bookingRequestProfessionalTemplate(params: BookingRequestProfessionalParams): EmailContent {
  const { professionalFirstName, clientName, clientPhone, clientEmail, animalName, animalSpecies, serviceName, dateLabel, time, modeLabel, locationLabel, notes } = params;
  const dashboardUrl = `${appUrl()}/dashboard`;
  const animalValue = animalSpecies ? `${animalName} (${animalSpecies})` : animalName;
  return {
    subject: `Nouvelle demande de rendez-vous — ${clientName} (${animalName})`,
    text: [
      `Bonjour ${professionalFirstName},`,
      "",
      `Une nouvelle demande de rendez-vous vient d'être envoyée depuis votre page de réservation.`,
      "",
      `Client·e : ${clientName}`,
      clientPhone ? `Téléphone : ${clientPhone}` : "",
      clientEmail ? `Email : ${clientEmail}` : "",
      `Animal : ${animalValue}`,
      `Prestation : ${serviceName}`,
      `Date : ${dateLabel} à ${time}`,
      `Mode : ${modeValue(modeLabel, locationLabel)}`,
      notes ? `Motif : ${notes}` : "",
      "",
      `Confirmez ou refusez cette demande depuis votre tableau de bord : ${dashboardUrl}`,
      clientEmail ? "Répondre à cet email écrit directement au client." : "",
    ].filter(Boolean).join("\n"),
    html: layout({
      preheader: `${clientName} demande un rendez-vous le ${dateLabel} à ${time} pour ${animalName}.`,
      title: "Nouvelle demande de rendez-vous",
      body: [
        paragraph(`Bonjour ${escapeHtml(professionalFirstName)},`),
        paragraph("Une nouvelle demande de rendez-vous vient d'être envoyée depuis votre page de réservation."),
        detailsTable([
          ["Client·e", clientName],
          ["Téléphone", clientPhone],
          ["Email", clientEmail],
          ["Animal", animalValue],
          ["Prestation", serviceName],
          ["Date", `${dateLabel} à ${time}`],
          ["Mode", modeValue(modeLabel, locationLabel)],
          ["Motif", notes],
        ]),
        button(dashboardUrl, "Voir la demande"),
        clientEmail ? mutedParagraph("Répondre à cet email écrit directement au client.") : "",
      ].join(""),
      footer: platformFooter(!clientEmail),
    }),
  };
}

/**
 * Rappel de suivi envoyé à un client — le corps du message est
 * intégralement rédigé par le praticien (ReminderModal, éditable avant
 * envoi) : ce gabarit ne fait qu'y appliquer la mise en page commune, pas de
 * contenu généré ici. Les liens du message restent cliquables.
 */
export function reminderEmailTemplate(params: { professionalCompany: string; message: string }): EmailContent {
  const { professionalCompany, message } = params;
  const messageHtml = escapeHtml(message)
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:${brand.primary};word-break:break-all;">${url}</a>`)
    .replace(/\n/g, "<br>");
  return {
    subject: `Un petit rappel de ${professionalCompany}`,
    text: message,
    html: layout({
      preheader: message.replace(/\s+/g, " ").slice(0, 120),
      title: `Un petit rappel de ${professionalCompany}`,
      body: paragraph(messageHtml),
      footer: professionalFooter(professionalCompany, ""),
    }),
  };
}

/**
 * Les quatre gabarits ci-dessous couvrent le suivi d'un rendez-vous après
 * la demande initiale (AUDIT-PRODUIT-2026-08-30.md, finding P0 §3) : avant
 * ce chantier, updateAppointmentStatusAction/saveAppointmentAction ne
 * prévenaient jamais le client d'une confirmation, d'un refus, d'une
 * annulation ou d'un déplacement. Même mise en page et même récapitulatif
 * que bookingRequestClientTemplate, pour rester cohérents avec le premier
 * email que le client a déjà reçu.
 */
export type AppointmentEmailParams = {
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
  bookingUrl: string;
};

export function appointmentConfirmedClientTemplate(params: AppointmentEmailParams): EmailContent {
  const { clientFirstName, animalName, serviceName, dateLabel, time, modeLabel, locationLabel, professionalFirstName, professionalCompany, professionalPhone } = params;
  const contact = contactLine(professionalFirstName, professionalPhone);
  return {
    subject: `Rendez-vous confirmé — ${dateLabel} à ${time}`,
    text: [
      `Bonjour ${clientFirstName},`,
      "",
      `Votre rendez-vous pour ${animalName} avec ${professionalFirstName} (${professionalCompany}) est confirmé.`,
      "",
      `Prestation : ${serviceName}`,
      `Date : ${dateLabel} à ${time}`,
      `Mode : ${modeValue(modeLabel, locationLabel)}`,
      "",
      "Vous trouverez l’événement en pièce jointe pour l’ajouter à votre calendrier.",
      contact.text,
    ].join("\n"),
    html: layout({
      preheader: `C'est confirmé : ${animalName}, le ${dateLabel} à ${time}.`,
      title: "Rendez-vous confirmé ✓",
      body: [
        paragraph(`Bonjour ${escapeHtml(clientFirstName)},`),
        paragraph(`Bonne nouvelle : votre rendez-vous pour <strong>${escapeHtml(animalName)}</strong> avec ${escapeHtml(professionalFirstName)} (${escapeHtml(professionalCompany)}) est <strong>confirmé</strong>.`),
        detailsTable([
          ["Prestation", serviceName],
          ["Date", `${dateLabel} à ${time}`],
          ["Mode", modeValue(modeLabel, locationLabel)],
        ]),
        paragraph("L’événement est en pièce jointe : ouvrez-le pour l’ajouter à votre calendrier."),
        paragraph(contact.html),
      ].join(""),
      footer: professionalFooter(professionalCompany, professionalPhone),
    }),
  };
}

export function appointmentDeclinedClientTemplate(params: AppointmentEmailParams): EmailContent {
  const { clientFirstName, animalName, dateLabel, time, professionalFirstName, professionalCompany, professionalPhone, bookingUrl } = params;
  const contact = contactLine(professionalFirstName, professionalPhone);
  return {
    subject: `Votre demande de rendez-vous du ${dateLabel} n’a pas pu être acceptée`,
    text: [
      `Bonjour ${clientFirstName},`,
      "",
      `${professionalFirstName} (${professionalCompany}) ne peut malheureusement pas donner suite à votre demande de rendez-vous du ${dateLabel} à ${time} pour ${animalName}.`,
      "",
      `Vous pouvez choisir un autre horaire directement ici : ${bookingUrl}`,
      contact.text,
    ].join("\n"),
    html: layout({
      preheader: `Le créneau du ${dateLabel} à ${time} n'est pas disponible — choisissez un autre horaire.`,
      title: "Demande non acceptée",
      body: [
        paragraph(`Bonjour ${escapeHtml(clientFirstName)},`),
        paragraph(`${escapeHtml(professionalFirstName)} (${escapeHtml(professionalCompany)}) ne peut malheureusement pas donner suite à votre demande de rendez-vous du <strong>${escapeHtml(dateLabel)} à ${escapeHtml(time)}</strong> pour <strong>${escapeHtml(animalName)}</strong>.`),
        paragraph("D'autres créneaux sont peut-être disponibles :"),
        button(bookingUrl, "Choisir un autre horaire"),
        paragraph(contact.html),
      ].join(""),
      footer: professionalFooter(professionalCompany, professionalPhone),
    }),
  };
}

export function appointmentCancelledClientTemplate(params: AppointmentEmailParams): EmailContent {
  const { clientFirstName, animalName, dateLabel, time, professionalFirstName, professionalCompany, professionalPhone, bookingUrl } = params;
  const contact = contactLine(professionalFirstName, professionalPhone);
  return {
    subject: `Votre rendez-vous du ${dateLabel} a été annulé`,
    text: [
      `Bonjour ${clientFirstName},`,
      "",
      `${professionalFirstName} (${professionalCompany}) a dû annuler le rendez-vous du ${dateLabel} à ${time} pour ${animalName}. Toutes nos excuses pour la gêne occasionnée.`,
      "",
      `Vous pouvez reprendre un rendez-vous directement ici : ${bookingUrl}`,
      contact.text,
    ].join("\n"),
    html: layout({
      preheader: `Le rendez-vous du ${dateLabel} à ${time} pour ${animalName} est annulé.`,
      title: "Rendez-vous annulé",
      body: [
        paragraph(`Bonjour ${escapeHtml(clientFirstName)},`),
        paragraph(`${escapeHtml(professionalFirstName)} (${escapeHtml(professionalCompany)}) a dû annuler le rendez-vous du <strong>${escapeHtml(dateLabel)} à ${escapeHtml(time)}</strong> pour <strong>${escapeHtml(animalName)}</strong>. Toutes nos excuses pour la gêne occasionnée.`),
        button(bookingUrl, "Reprendre un rendez-vous"),
        paragraph(contact.html),
      ].join(""),
      footer: professionalFooter(professionalCompany, professionalPhone),
    }),
  };
}

export function appointmentRescheduledClientTemplate(params: AppointmentEmailParams): EmailContent {
  const { clientFirstName, animalName, serviceName, dateLabel, time, modeLabel, locationLabel, professionalFirstName, professionalCompany, professionalPhone } = params;
  const contact = contactLine(professionalFirstName, professionalPhone);
  return {
    subject: `Votre rendez-vous a été déplacé — nouvelle date le ${dateLabel}`,
    text: [
      `Bonjour ${clientFirstName},`,
      "",
      `Le rendez-vous pour ${animalName} avec ${professionalFirstName} (${professionalCompany}) a été déplacé.`,
      "",
      `Nouvelle date : ${dateLabel} à ${time}`,
      `Prestation : ${serviceName}`,
      `Mode : ${modeValue(modeLabel, locationLabel)}`,
      "",
      "Vous trouverez l’événement mis à jour en pièce jointe.",
      contact.text,
    ].join("\n"),
    html: layout({
      preheader: `Nouvelle date pour ${animalName} : ${dateLabel} à ${time}.`,
      title: "Rendez-vous déplacé",
      body: [
        paragraph(`Bonjour ${escapeHtml(clientFirstName)},`),
        paragraph(`Le rendez-vous pour <strong>${escapeHtml(animalName)}</strong> avec ${escapeHtml(professionalFirstName)} (${escapeHtml(professionalCompany)}) a été <strong>déplacé</strong>.`),
        detailsTable([
          ["Nouvelle date", `${dateLabel} à ${time}`],
          ["Prestation", serviceName],
          ["Mode", modeValue(modeLabel, locationLabel)],
        ]),
        paragraph("L’événement mis à jour est en pièce jointe : ouvrez-le pour mettre à jour votre calendrier."),
        paragraph(contact.html),
      ].join(""),
      footer: professionalFooter(professionalCompany, professionalPhone),
    }),
  };
}
