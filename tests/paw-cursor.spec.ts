import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";
import { BASE_URL } from "./helpers/base-url";

config({ path: ".env.local" });

const EMAIL = "praticien-test@pf-osteo-animale.fr";

/**
 * Curseur en patte : deux réglages distincts, tous deux éteints au départ.
 *
 * Ce qui est vérifié ici n'est pas l'animation — c'est qui décide. Remplacer
 * le curseur du système est un parti pris fort : personne ne doit le subir.
 * D'où trois points tenus par ces tests :
 *
 * - rien ne change tant que le professionnel n'a rien demandé, ni dans son
 *   logiciel ni sur sa page publique ;
 * - le visiteur n'a aucune prise dessus : le réglage de la page vit dans les
 *   paramètres du professionnel, pas dans la page ;
 * - la patte ne retire jamais un repère sans le remplacer — le curseur de
 *   saisie reste visible dans les champs, et rien ne se déclenche sur écran
 *   tactile, où il n'y a pas de curseur à remplacer.
 */

async function professionalSlug(): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT slug FROM "BusinessProfile" LIMIT 1`;
  return (rows[0] as { slug: string }).slug;
}

/** La page de démonstration est partagée avec les autres specs publiques. */
test.afterEach(async () => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "BusinessProfile" SET "publicPageDraft" = NULL, "publicPagePublished" = NULL, "publicPagePublishedAt" = NULL`;
});

async function pawState(page: Page) {
  return page.evaluate(() => {
    const pointer = document.querySelector<HTMLElement>(".paw-cursor-pointer");
    const field = document.querySelector("input");
    const button = document.querySelector("button");
    return {
      patteMontee: Boolean(pointer),
      position: pointer ? { x: Math.round(parseFloat(pointer.style.left)), y: Math.round(parseFloat(pointer.style.top)) } : null,
      curseurSurBouton: button ? getComputedStyle(button).cursor : null,
      curseurDansUnChamp: field ? getComputedStyle(field).cursor : null,
      // La couleur voyage dans l'image SVG du curseur, encodée dans l'URL.
      couleurDeLaPatte: pointer ? decodeURIComponent(pointer.style.backgroundImage).match(/fill='(#[0-9a-f]{6})'/i)?.[1] ?? null : null,
    };
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Régler le curseur demande le droit sur les paramètres publics : accordé
  // ici pour tout le fichier, plutôt que par un seul test — les autres
  // dépendaient sinon de l'ordre d'exécution.
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${EMAIL}`;
});

test.afterAll(async () => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${EMAIL}`;
});

test("le logiciel garde le curseur du système, jusqu'à ce que le professionnel demande la patte", async ({ page }) => {
  // Par défaut : rien. Un nouvel appareil ne doit pas hériter d'un curseur
  // exotique sans que personne ne l'ait demandé.
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.locator(".paw-cursor-pointer")).toHaveCount(0);
  await expect(page.locator("body.paw-cursor-active")).toHaveCount(0);

  // Paramètres › Personnalisation › Thème et couleurs.
  await page.goto("/dashboard/parametres?tab=customization");
  const remplacer = page.getByRole("switch", { name: /^Remplacer le curseur/ });
  const trainee = page.getByRole("switch", { name: /^Traînée de pattes/ });
  await expect(remplacer).toBeVisible({ timeout: 15000 });
  await expect(remplacer, "éteint à l'ouverture").toHaveAttribute("aria-checked", "false");
  await expect(trainee, "éteint à l'ouverture").toHaveAttribute("aria-checked", "false");

  // La traînée seule : elle s'ajoute à la page sans rien retirer. La flèche
  // du système reste — c'est tout l'intérêt de deux réglages séparés.
  await trainee.click();
  await page.getByRole("button", { name: /enregistrer les modifications/i }).click();
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.mouse.move(300, 300);
  await page.mouse.move(700, 450, { steps: 12 });
  const traineeSeule = await pawState(page);
  expect(traineeSeule.patteMontee, "pas de patte à la place de la flèche").toBe(false);
  expect(traineeSeule.curseurSurBouton, "la flèche du système est intacte").not.toBe("none");
  await expect(page.locator(".paw-print-trail"), "des traces suivent la souris").not.toHaveCount(0);

  // Puis le remplacement du curseur, avec une couleur choisie.
  await page.goto("/dashboard/parametres?tab=customization");
  await page.getByRole("switch", { name: /^Remplacer le curseur/ }).click();
  await page.getByLabel("Couleur des pattes").fill("#b3245c");
  await page.getByRole("button", { name: /enregistrer les modifications/i }).click();

  // Le réglage suit d'un écran à l'autre.
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.locator("body.paw-cursor-active")).toHaveCount(1);

  await page.mouse.move(300, 250);
  await page.mouse.move(640, 430, { steps: 10 });
  const active = await pawState(page);
  expect(active.patteMontee, "la patte est affichée").toBe(true);
  expect(active.position, "la patte suit la souris").toEqual({ x: 640, y: 430 });
  expect(active.curseurSurBouton, "le curseur du système est masqué").toBe("none");
  expect(active.couleurDeLaPatte, "la couleur choisie est celle des pattes").toBe("#b3245c");

  // Le seul curseur système qui porte une information que la patte ne
  // remplace pas : le trait vertical qui dit où l'on écrit.
  await page.goto("/dashboard/clients?nouveau=1", { waitUntil: "networkidle" });
  const avecChamp = await pawState(page);
  expect(avecChamp.curseurDansUnChamp, "le curseur de saisie reste visible").toBe("text");

  // Le clic laisse un tampon, qui s'efface de lui-même.
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await expect(page.locator(".paw-stamp")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".paw-print-trail, .paw-stamp, .paw-drop-ring")).toHaveCount(0, { timeout: 3000 });

  // Et on peut tout éteindre.
  await page.goto("/dashboard/parametres?tab=customization");
  await page.getByRole("switch", { name: /^Remplacer le curseur/ }).click();
  await page.getByRole("switch", { name: /^Traînée de pattes/ }).click();
  await page.getByRole("button", { name: /enregistrer les modifications/i }).click();
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.mouse.move(300, 300);
  await page.mouse.move(700, 450, { steps: 12 });
  await expect(page.locator(".paw-cursor-pointer")).toHaveCount(0);
  await expect(page.locator(".paw-print-trail")).toHaveCount(0);
});

test("sur la page de réservation, c'est le professionnel qui décide — pas le visiteur", async ({ page, browser }) => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${EMAIL}`;
  await sql`UPDATE "BusinessProfile" SET "publicPageDraft" = NULL, "publicPagePublished" = NULL, "publicPagePublishedAt" = NULL`;
  const slug = await professionalSlug();

  // Un visiteur, sur la page telle qu'elle est aujourd'hui : curseur normal,
  // et aucun réglage à sa portée pour en changer.
  const visiteur = await browser.newContext();
  const vue = await visiteur.newPage();
  await vue.goto(`${BASE_URL}/reserver/${slug}`, { waitUntil: "networkidle" });
  await expect(vue.locator(".paw-cursor-pointer")).toHaveCount(0);
  await expect(vue.getByText(/effet patte|traînée de pattes/i), "le réglage n'est pas exposé au public").toHaveCount(0);

  // Paramètres › Personnalisation › Page de réservation › toute la page.
  await page.goto("/dashboard/parametres?tab=customization");
  await page.getByRole("button", { name: /page de réservation/i }).click();
  await expect(page.getByTestId("public-page-preview")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /toute la page/i }).click();
  const reglage = page.getByRole("checkbox", { name: /remplacer le curseur/i });
  await expect(reglage).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /traînée de pattes/i })).not.toBeChecked();
  await reglage.check();

  // Un brouillon ne change rien pour les visiteurs : c'est toute la raison
  // d'avoir deux versions.
  await page.getByRole("button", { name: /enregistrer le brouillon/i }).click();
  await expect(page.getByTestId("save-status")).toHaveText(/modifications enregistrées/i, { timeout: 15000 });
  await vue.reload({ waitUntil: "networkidle" });
  await expect(vue.locator(".paw-cursor-pointer"), "le brouillon reste invisible des clients").toHaveCount(0);

  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText(/modifications enregistrées/i, { timeout: 15000 });

  await vue.reload({ waitUntil: "networkidle" });
  await vue.mouse.move(200, 200);
  await vue.mouse.move(520, 360, { steps: 10 });
  const publie = await pawState(vue);
  expect(publie.patteMontee, "la patte accueille les visiteurs").toBe(true);
  expect(publie.position).toEqual({ x: 520, y: 360 });

  // Jusqu'au formulaire : c'est là que le trait de saisie compte, puisque
  // c'est le seul endroit de la page où l'on écrit. Même parcours que
  // tour-suggestions.spec.ts, pour ne pas inventer une seconde façon de
  // traverser le tunnel.
  await vue.getByText("Quelle consultation souhaitez-vous").waitFor();
  await vue.locator("button[aria-pressed]").first().click();
  await vue.getByRole("button", { name: "Consultation à domicile", exact: true }).click();
  await vue.locator('button[type="submit"]').click();
  await expect(vue.getByText("Choisissez votre créneau")).toBeVisible();
  await vue.locator('[role="gridcell"][aria-disabled="false"]').first().click();
  await expect(vue.getByText("Choisissez une heure")).toBeVisible();
  await vue.locator('button:has-text(":")').first().click();
  const suite = vue.locator('button[type="submit"]');
  await suite.scrollIntoViewIfNeeded();
  await suite.click();

  await expect(vue.getByText("Quelques informations")).toBeVisible();

  const auFormulaire = await pawState(vue);
  expect(auFormulaire.patteMontee, "la patte reste d'un bout à l'autre du tunnel").toBe(true);
  expect(auFormulaire.curseurDansUnChamp, "le trait de saisie reste visible là où l'on écrit").toBe("text");
  await visiteur.close();

  // Même page, même réglage, sur un écran tactile : il n'y a pas de curseur à
  // remplacer, et masquer celui-ci ne donnerait rien en échange.
  const tactile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const surMobile = await tactile.newPage();
  await surMobile.goto(`${BASE_URL}/reserver/${slug}`, { waitUntil: "networkidle" });
  await expect(surMobile.locator("body.paw-cursor-active")).toHaveCount(0);
  await tactile.close();
});
