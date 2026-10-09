import { test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

export * from "@playwright/test";

/**
 * Le `test` de toutes les specs : celui de Playwright, avec une seule
 * différence — `page.goto()` et `page.reload()` ne rendent la main qu'une
 * fois la page réellement utilisable.
 *
 * Le serveur de test local est un `next dev`. La page y arrive déjà dessinée
 * (rendu serveur), mais React ne branche ses gestionnaires qu'un instant plus
 * tard : un clic donné entre les deux part dans le vide. « Nouveau document »
 * n'ouvrait alors rien, « Réduire le menu » ne réduisait rien, et le test
 * attendait trente secondes une fenêtre qui ne viendrait pas. L'écart dépend
 * de la charge du poste : la même spec passait un jour et échouait le
 * lendemain, sans qu'une ligne ait changé.
 *
 * Attendre ici, une fois, vaut mieux qu'un délai ajouté dans chaque spec.
 */
const patched = new WeakSet<Page>();

/** Les boutons que React ne connaîtra jamais : ceux que dessinent les cartes. */
const FOREIGN = ".leaflet-container, .maplibregl-map";

export async function waitForInteractive(page: Page): Promise<void> {
  await page
    .waitForFunction(
      (foreign) => {
        // Pas une page de l'application (JSON, fichier d'agenda) : rien à attendre.
        if (!document.querySelector("script[src*='/_next/']")) return true;
        // React pose une clé interne sur chaque élément qu'il a pris en main.
        const taken = (element: Element) => Object.keys(element).some((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"));
        const buttons = [...document.querySelectorAll("button")].filter((button) => !button.closest(foreign));
        if (buttons.length === 0) return document.body !== null && [...document.body.children].some(taken);
        return buttons.every(taken);
      },
      FOREIGN,
      { timeout: 10_000 },
    )
    // Jamais un échec de plus : au pire, le test continue comme avant.
    .catch(() => {});
}

function patchPage(page: Page): Page {
  if (patched.has(page)) return page;
  patched.add(page);
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (url, options) => {
    const response = await goto(url, options);
    await waitForInteractive(page);
    return response;
  };
  page.reload = async (options) => {
    const response = await reload(options);
    await waitForInteractive(page);
    return response;
  };
  return page;
}

function patchContext(context: BrowserContext): BrowserContext {
  for (const page of context.pages()) patchPage(page);
  context.on("page", patchPage);
  return context;
}

export const test = base.extend<object, { browser: Browser }>({
  // Les contextes ouverts à la main (`browser.newContext()`) : visiteur sans
  // session, second compte.
  browser: [
    async ({ browser }, run) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => patchContext(await newContext(options));
      await run(browser);
      browser.newContext = newContext;
    },
    { scope: "worker" },
  ],
  // `run` et non `use`, le nom habituel : le lint y verrait un hook React.
  context: async ({ context }, run) => {
    await run(patchContext(context));
  },
});
