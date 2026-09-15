import { config } from "dotenv";
import { test } from "@playwright/test";
config({ path: ".env.local" });

const OUT = "C:/Users/UTILIS~1/AppData/Local/Temp/claude/c--Users-Utilisateur-Documents-animeo-app/1d83cf02-26a3-44ba-8d46-c38e7bf4eb9c/scratchpad/shots";

test("passe visuelle mobile", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
  await page.fill('input[type="password"]', "Praticien-Test-2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });

  async function overflow(name: string) {
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    console.log(`OVERFLOW ${name}: scrollWidth=${o.sw} innerWidth=${o.iw} ${o.sw > o.iw + 1 ? "DEBORDE" : "ok"}`);
  }

  for (const [name, path] of [["dashboard", "/dashboard"], ["clients", "/dashboard/clients"], ["agenda", "/dashboard/agenda"], ["tournees", "/dashboard/tournees"], ["parametres", "/dashboard/parametres"]] as const) {
    await page.goto(path);
    await page.waitForTimeout(2500);
    await overflow(name);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  }

  await page.goto("/dashboard/clients");
  await page.waitForTimeout(2000);
  const newClient = page.getByRole("button", { name: /nouveau client|ajouter un client/i }).first();
  if (await newClient.count()) {
    await newClient.click();
    await page.waitForTimeout(1200);
    await overflow("modale-client");
    await page.screenshot({ path: `${OUT}/modale-client.png` });
  } else {
    console.log("BOUTON nouveau client introuvable");
  }
});
