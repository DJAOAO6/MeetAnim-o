/**
 * Configuration de la page publique de réservation : ce que le
 * professionnel compose depuis l'éditeur.
 *
 * Volontairement une configuration structurée, jamais du HTML enregistré en
 * base. Une page décrite par des sections typées reste responsive quoi que
 * fasse l'utilisateur, se rend avec les composants existants (donc le même
 * parcours de réservation, la même accessibilité), et peut évoluer sans
 * migration : une section inconnue est ignorée, une section nouvelle
 * apparaît avec ses réglages par défaut.
 *
 * Deux versions coexistent sur BusinessProfile : le brouillon, que
 * l'éditeur enregistre librement, et la version publiée, seule lue par la
 * page publique. Tant que rien n'est publié, les visiteurs ne voient pas les
 * essais en cours.
 */

/**
 * Les sections correspondent une à une à ce que la page publique sait déjà
 * afficher — pas d'invention : moyens de paiement et réseaux sociaux restent
 * des lignes d'« Infos pratiques », pilotées par les cases d'affichage du
 * profil public, et n'ont donc pas de section propre.
 */
export type PublicSectionId =
  | "header"
  | "services"
  | "about"
  | "practical"
  | "address"
  | "hours";

export type SectionTone = "surface" | "soft" | "transparent";

export type PublicSection = {
  id: PublicSectionId;
  visible: boolean;
  /** Titre affiché, vide = celui d'origine. Jamais du HTML : du texte. */
  title?: string;
  tone: SectionTone;
};

export type PublicPageDensity = "compact" | "normal" | "spacious";
export type PublicPageFont = "nunito" | "system" | "serif";
export type ButtonShape = "rounded" | "pill" | "square";

export type PublicPageTheme = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  font: PublicPageFont;
  density: PublicPageDensity;
  buttonShape: ButtonShape;
  /** Image de couverture assombrie pour que le texte posé dessus reste lisible. */
  coverOverlay: number;
  /**
   * Curseur en patte sur la page de réservation. Éteint par défaut, et réglé
   * ici seulement : un visiteur ne choisit pas l'habillage de la page, c'est
   * le professionnel qui décide de l'allure de la sienne.
   */
  pawCursor: boolean;
  /** Traces de pattes au sol pendant le déplacement. Indépendante du curseur. */
  pawTrail: boolean;
  /** Couleur des pattes. Vide : elles suivent les couleurs de la page. */
  pawColor: string;
};

export type PublicPageConfig = {
  version: 1;
  theme: PublicPageTheme;
  sections: PublicSection[];
};

export type PublicSectionDefinition = {
  id: PublicSectionId;
  label: string;
  description: string;
  /** Une section verrouillée reste déplaçable mais ne peut pas être masquée. */
  alwaysVisible?: boolean;
};

export const PUBLIC_SECTIONS: PublicSectionDefinition[] = [
  { id: "header", label: "En-tête", description: "Couverture, logo, nom et phrase d'accroche.", alwaysVisible: true },
  { id: "services", label: "Prestations et réservation", description: "Le parcours de prise de rendez-vous.", alwaysVisible: true },
  { id: "about", label: "À propos", description: "Votre présentation détaillée." },
  { id: "practical", label: "Infos pratiques", description: "Numéro d'ordre, modes acceptés, téléphone." },
  { id: "address", label: "Adresse du cabinet", description: "Adresse, accès, stationnement, accessibilité." },
  { id: "hours", label: "Horaires", description: "Vos horaires d'ouverture." },
];

export const DEFAULT_PUBLIC_THEME: PublicPageTheme = {
  primaryColor: "#a9531c",
  accentColor: "#e7a64a",
  backgroundColor: "#f6f1eb",
  surfaceColor: "#fffdfb",
  textColor: "#4a2412",
  font: "nunito",
  density: "normal",
  buttonShape: "rounded",
  coverOverlay: 35,
  pawCursor: false,
  pawTrail: false,
  pawColor: "",
};

export const DEFAULT_PUBLIC_SECTIONS: PublicSection[] = PUBLIC_SECTIONS.map((section) => ({
  id: section.id,
  visible: true,
  tone: "surface",
}));

export const DEFAULT_PUBLIC_PAGE: PublicPageConfig = {
  version: 1,
  theme: DEFAULT_PUBLIC_THEME,
  sections: DEFAULT_PUBLIC_SECTIONS,
};

export function sectionDefinition(id: PublicSectionId): PublicSectionDefinition | undefined {
  return PUBLIC_SECTIONS.find((section) => section.id === id);
}

const HEX = /^#[0-9a-f]{6}$/i;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function safeOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Relit une configuration sans lui faire confiance : elle vient du
 * navigateur (enregistrement) ou d'une version antérieure du catalogue
 * (lecture). Couleurs vérifiées une à une, options ramenées à une valeur
 * connue, sections inconnues écartées et sections manquantes ajoutées.
 */
export function normalizePublicPage(raw: unknown): PublicPageConfig {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<PublicPageConfig>;
  const rawTheme = (typeof source.theme === "object" && source.theme !== null ? source.theme : {}) as Partial<PublicPageTheme>;

  const theme: PublicPageTheme = {
    primaryColor: safeColor(rawTheme.primaryColor, DEFAULT_PUBLIC_THEME.primaryColor),
    accentColor: safeColor(rawTheme.accentColor, DEFAULT_PUBLIC_THEME.accentColor),
    backgroundColor: safeColor(rawTheme.backgroundColor, DEFAULT_PUBLIC_THEME.backgroundColor),
    surfaceColor: safeColor(rawTheme.surfaceColor, DEFAULT_PUBLIC_THEME.surfaceColor),
    textColor: safeColor(rawTheme.textColor, DEFAULT_PUBLIC_THEME.textColor),
    font: safeOption(rawTheme.font, ["nunito", "system", "serif"], DEFAULT_PUBLIC_THEME.font),
    density: safeOption(rawTheme.density, ["compact", "normal", "spacious"], DEFAULT_PUBLIC_THEME.density),
    buttonShape: safeOption(rawTheme.buttonShape, ["rounded", "pill", "square"], DEFAULT_PUBLIC_THEME.buttonShape),
    coverOverlay: typeof rawTheme.coverOverlay === "number" ? Math.min(80, Math.max(0, Math.round(rawTheme.coverOverlay))) : DEFAULT_PUBLIC_THEME.coverOverlay,
    // Absent des configurations enregistrées avant ce réglage : éteint.
    pawCursor: rawTheme.pawCursor === true,
    pawTrail: rawTheme.pawTrail === true,
    pawColor: typeof rawTheme.pawColor === "string" ? rawTheme.pawColor : "",
  };

  const entries = Array.isArray(source.sections) ? source.sections : [];
  const seen = new Set<PublicSectionId>();
  const sections: PublicSection[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, visible, title, tone } = entry as Partial<PublicSection>;
    const definition = typeof id === "string" ? sectionDefinition(id as PublicSectionId) : undefined;
    if (!definition || seen.has(definition.id)) continue;
    seen.add(definition.id);
    sections.push({
      id: definition.id,
      // Le parcours de réservation et l'en-tête ne peuvent pas disparaître :
      // une page de réservation sans réservation n'a plus d'objet.
      visible: definition.alwaysVisible ? true : visible !== false,
      title: typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : undefined,
      tone: safeOption(tone, ["surface", "soft", "transparent"], "surface"),
    });
  }

  for (const definition of PUBLIC_SECTIONS) {
    if (seen.has(definition.id)) continue;
    sections.push({ id: definition.id, visible: true, tone: "surface" });
  }

  return { version: 1, theme, sections };
}

/** Espacements réels dérivés de la densité choisie, en classes Tailwind. */
export const densitySpacing: Record<PublicPageDensity, { section: string; gap: string }> = {
  compact: { section: "py-4", gap: "gap-3" },
  normal: { section: "py-6", gap: "gap-4" },
  spacious: { section: "py-10", gap: "gap-6" },
};

export const buttonRadius: Record<ButtonShape, string> = {
  rounded: "14px",
  pill: "999px",
  square: "4px",
};

export const fontStacks: Record<PublicPageFont, string> = {
  nunito: "var(--font-nunito-sans), system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
};
