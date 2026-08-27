import { expect, test, type Page, type Route } from "@playwright/test";

const PROFESSIONAL_SLUG = "pauline-faucillon";

const MOCK_FEATURES = [
  {
    type: "Feature",
    properties: {
      id: "76540_0180_00012",
      label: "12 Rue Jeanne d’Arc 76000 Rouen",
      housenumber: "12",
      street: "Rue Jeanne d’Arc",
      postcode: "76000",
      city: "Rouen",
      citycode: "76540",
    },
    geometry: { type: "Point", coordinates: [1.09827, 49.44286] },
  },
  {
    type: "Feature",
    properties: {
      id: "76540_0181_00012",
      label: "12 Rue Jean Lecanuet 76000 Rouen",
      housenumber: "12",
      street: "Rue Jean Lecanuet",
      postcode: "76000",
      city: "Rouen",
      citycode: "76540",
    },
    geometry: { type: "Point", coordinates: [1.09456, 49.44312] },
  },
];

async function mockAddressSearch(page: Page, body: unknown, status = 200) {
  await page.route("**/api/address-search**", async (route: Route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

/** Amène la page jusqu'à l'étape "Où doit se dérouler la consultation ?" (mode domicile). */
async function gotoAddressStep(page: Page) {
  await page.goto(`/reserver/${PROFESSIONAL_SLUG}`);
  await expect(page.getByText("Choisissez une prestation")).toBeVisible();

  await page.locator("button[aria-pressed]").first().click();
  await page.locator('button[type="submit"]').click();

  await page.getByRole("button", { name: "À domicile" }).click();
  await page.locator('button[type="submit"]').click();

  await page.fill('input[autocomplete="given-name"]', "Camille");
  await page.fill('input[autocomplete="family-name"]', "Test");
  await page.fill('input[autocomplete="tel"]', "0612345678");
  await page.fill('input[autocomplete="email"]', "camille@example.com");
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText("Où doit se dérouler la consultation")).toBeVisible();
  return page.getByRole("combobox");
}

test.describe("Autocomplétion d'adresse (étape domicile)", () => {
  test("n'effectue aucune recherche avec un champ vide", async ({ page }) => {
    let requested = false;
    await page.route("**/api/address-search**", (route) => { requested = true; route.continue(); });
    const input = await gotoAddressStep(page);
    await input.click();
    await input.press("a");
    await input.press("Backspace");
    await page.waitForTimeout(500);
    expect(requested).toBe(false);
  });

  test("n'effectue aucune recherche avant le nombre minimum de caractères", async ({ page }) => {
    let requested = false;
    await page.route("**/api/address-search**", (route) => { requested = true; route.continue(); });
    const input = await gotoAddressStep(page);
    await input.fill("12");
    await page.waitForTimeout(500);
    expect(requested).toBe(false);
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("affiche les suggestions retournées par l'API", async ({ page }) => {
    await mockAddressSearch(page, { results: [
      { id: "76540_0180_00012", label: "12 Rue Jeanne d’Arc 76000 Rouen", houseNumber: "12", street: "Rue Jeanne d’Arc", postcode: "76000", city: "Rouen", citycode: "76540", latitude: 49.44286, longitude: 1.09827 },
      { id: "76540_0181_00012", label: "12 Rue Jean Lecanuet 76000 Rouen", houseNumber: "12", street: "Rue Jean Lecanuet", postcode: "76000", city: "Rouen", citycode: "76540", latitude: 49.44312, longitude: 1.09456 },
    ] });
    const input = await gotoAddressStep(page);
    await input.fill("12 rue jea");
    const options = page.getByRole("option");
    await expect(options).toHaveCount(2);
    await expect(options.first()).toContainText("Jeanne d’Arc");
  });

  test("sélectionne une adresse à la souris et remplit ville + code postal", async ({ page }) => {
    await mockAddressSearch(page, { results: [
      { id: "76540_0180_00012", label: "12 Rue Jeanne d’Arc 76000 Rouen", houseNumber: "12", street: "Rue Jeanne d’Arc", postcode: "76000", city: "Rouen", citycode: "76540", latitude: 49.44286, longitude: 1.09827 },
    ] });
    const input = await gotoAddressStep(page);
    await input.fill("12 rue jea");
    await page.getByRole("option").first().click();

    await expect(input).toHaveValue("12 Rue Jeanne d’Arc 76000 Rouen");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByLabel("Code postal")).toHaveValue("76000");
    await expect(page.getByLabel("Ville")).toHaveValue("Rouen");
    await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });

  test("récupère les coordonnées géographiques via l'API de recherche", async ({ request }) => {
    const response = await request.get("/api/address-search?q=8 boulevard du port amiens");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body.results)).toBe(true);
    if (body.results.length > 0) {
      const [first] = body.results;
      expect(typeof first.latitude).toBe("number");
      expect(typeof first.longitude).toBe("number");
      expect(first.latitude).toBeGreaterThan(-90);
      expect(first.latitude).toBeLessThan(90);
    }
  });

  test("permet la navigation au clavier (flèches, Entrée, Échap)", async ({ page }) => {
    await mockAddressSearch(page, { results: MOCK_FEATURES.map((feature) => ({
      id: feature.properties.id,
      label: feature.properties.label,
      houseNumber: feature.properties.housenumber,
      street: feature.properties.street,
      postcode: feature.properties.postcode,
      city: feature.properties.city,
      citycode: feature.properties.citycode,
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
    })) });
    const input = await gotoAddressStep(page);
    await input.fill("12 rue jea");
    await expect(page.getByRole("option")).toHaveCount(2);

    // Échap ferme la liste sans rien sélectionner ni vider le champ
    await input.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(input).toHaveValue("12 rue jea");

    // Reprendre la saisie relance une recherche et rouvre la liste
    await input.press("n");
    await expect(page.getByRole("option")).toHaveCount(2);
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await input.press("ArrowUp");
    await expect(page.getByRole("option").nth(0)).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");
    await expect(input).toHaveValue("12 Rue Jeanne d’Arc 76000 Rouen");
  });

  test("reste utilisable sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAddressSearch(page, { results: [
      { id: "76540_0180_00012", label: "12 Rue Jeanne d’Arc 76000 Rouen", houseNumber: "12", street: "Rue Jeanne d’Arc", postcode: "76000", city: "Rouen", citycode: "76540", latitude: 49.44286, longitude: 1.09827 },
    ] });
    const input = await gotoAddressStep(page);
    await expect(input).toBeVisible();
    await input.fill("12 rue jea");
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(30);
    await option.click();
    await expect(input).toHaveValue("12 Rue Jeanne d’Arc 76000 Rouen");
  });

  test("dégrade proprement en cas d'erreur de l'API", async ({ page }) => {
    await mockAddressSearch(page, { results: [], error: "network" }, 200);
    const input = await gotoAddressStep(page);
    await input.fill("12 rue jea");
    await page.waitForTimeout(600);
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByText("saisir votre adresse manuellement")).toBeVisible();
  });

  test("permet un fallback vers la saisie manuelle complète", async ({ page }) => {
    await mockAddressSearch(page, {}, 500);
    const input = await gotoAddressStep(page);
    await input.fill("12 rue des Tilleuls");
    await page.waitForTimeout(600);
    await page.getByLabel("Code postal").fill("76000");
    await page.getByLabel("Ville").fill("Rouen");
    await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });
});
