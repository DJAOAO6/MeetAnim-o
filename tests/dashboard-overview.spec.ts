import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Tableau de bord — structure et interactions.
 *
 * Ce qui est vérifié ici n'est pas l'apparence mais ce qu'elle promet : chaque
 * bouton mène quelque part, aucune donnée n'est affichée deux fois, et les
 * cartes d'une même rangée tombent à la même hauteur — le défaut qui donnait
 * à la page son air assemblé bloc par bloc.
 */

async function rowHeights(page: Page) {
  return page.getByTestId("dashboard-grid").evaluate((grid) => {
    const rows = new Map<number, Array<{ id: string; height: number }>>();
    for (const child of grid.children) {
      const box = child.getBoundingClientRect();
      const top = Math.round(box.top);
      const key = [...rows.keys()].find((existing) => Math.abs(existing - top) <= 2) ?? top;
      rows.set(key, [...(rows.get(key) ?? []), { id: child.getAttribute("data-testid") ?? "?", height: Math.round(box.height) }]);
    }
    return [...rows.values()];
  });
}

test("les cartes d’une même rangée ont exactement la même hauteur", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const problems: string[] = [];
  for (const row of await rowHeights(page)) {
    if (row.length < 2) continue;
    const heights = row.map((item) => item.height);
    if (Math.max(...heights) - Math.min(...heights) > 2) {
      problems.push(row.map((item) => `${item.id}:${item.height}px`).join(" / "));
    }
  }
  expect(problems, `rangées mal alignées :\n${problems.join("\n")}`).toEqual([]);
});

test("aucune donnée n’est affichée deux fois", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // « Cette semaine » était donné à la fois en chiffre clé et dans le résumé
  // d'activité, sous deux libellés différents. Le résumé ne parle plus du
  // nombre de rendez-vous.
  await expect(page.getByTestId("block-stats").getByText("Cette semaine", { exact: true })).toBeVisible();
  await expect(page.getByTestId("block-activitySummary").getByText(/rendez-vous/i)).toHaveCount(0);

  // Le nombre de rappels n'apparaît qu'une fois, dans la carte des rappels.
  await expect(page.getByTestId("block-stats").getByText(/rappels/i)).toHaveCount(0);
});

test("les chiffres clés sont alignés quelle que soit la longueur de leur libellé", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // C'est le défaut d'origine : « Rendez-vous aujourd'hui » tient sur deux
  // lignes, « Cette semaine » sur une, et les chiffres se retrouvaient à des
  // hauteurs différentes.
  const tops = await page.getByTestId("block-stats").evaluate((block) => {
    return [...block.querySelectorAll("[data-testid=kpi-card]")].map((card) => {
      const value = card.querySelector("[data-testid=kpi-value]")!;
      return Math.round(value.getBoundingClientRect().top - card.getBoundingClientRect().top);
    });
  });

  expect(tops.length).toBe(5);
  expect(Math.max(...tops) - Math.min(...tops), `décalages des chiffres : ${tops.join(", ")}`).toBeLessThanOrEqual(1);
});

test("le bouton Gérer de chaque carte d’ouverture ouvre le gestionnaire sur le bon mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  await page.getByTestId("block-availabilityCabinet").getByRole("button", { name: /gérer les disponibilités/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /cabinet/i }).or(dialog.getByRole("button", { name: /cabinet/i })).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByTestId("block-availabilityHome").getByRole("button", { name: /gérer les disponibilités/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("les liens du tableau de bord mènent aux bonnes pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  const journeys: Array<[string, RegExp, RegExp]> = [
    ["block-planning", /voir l’agenda complet/i, /\/dashboard\/agenda$/],
    ["block-nextTour", /gérer les tournées|voir la tournée/i, /\/dashboard\/tournees/],
    ["block-reminders", /voir tous les rappels/i, /\/dashboard\/rappels$/],
  ];

  for (const [block, linkName, destination] of journeys) {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.getByTestId(block).getByRole("link", { name: linkName }).first().click();
    await expect(page, `« ${linkName.source} » doit mener à ${destination.source}`).toHaveURL(destination);
  }

  // « Voir l'agenda » du bandeau d'accueil.
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Voir l’agenda", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/agenda$/);
});

test("« Nouveau rendez-vous » ouvre le formulaire de création existant", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Nouveau rendez-vous" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("le graphique change de pas avec la période choisie", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  const chart = page.getByTestId("block-activityChart");
  await expect(chart.getByText("Un point par jour")).toBeVisible();
  await chart.getByRole("combobox", { name: "Période du graphique" }).selectOption("year");
  await expect(chart.getByText("Un point par mois")).toBeVisible();
  // Douze points, un par mois : la courbe suit vraiment la période.
  await expect(chart.locator("svg circle")).toHaveCount(12);
});
