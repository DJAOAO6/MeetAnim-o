/**
 * Catalogue des blocs du tableau de bord. Volontairement séparé des
 * composants React : le serveur (validation de la disposition enregistrée) et
 * le client (rendu, panneau d'ajout) lisent le même catalogue, sans que le
 * serveur ait à importer du JSX.
 *
 * Chaque bloc correspond à une donnée qui existe déjà dans le logiciel —
 * aucune statistique inventée.
 */
export type DashboardWidgetId =
  | "availabilityCabinet"
  | "availabilityHome"
  | "stats"
  | "planning"
  | "activityChart"
  | "nextTour"
  | "animals"
  | "activitySummary"
  | "reminders";

/**
 * Largeur en douzièmes de la grille. Six valeurs seulement, choisies pour se
 * composer entre elles : 8+4, 6+6, 4+4+4, 3+3+3+3, 9+3, 12. Une largeur libre
 * de 1 à 12 laisserait construire des rangées qui ne se ferment jamais, et
 * c'est exactement ce qui donne un tableau de bord mal aligné.
 */
export type DashboardWidgetSpan = 3 | 4 | 6 | 8 | 9 | 12;

export const DASHBOARD_SPANS: DashboardWidgetSpan[] = [3, 4, 6, 8, 9, 12];

/** Libellés des largeurs : « un tiers » se comprend, « 4 » ne dit rien. */
export const spanLabels: Record<DashboardWidgetSpan, { short: string; long: string }> = {
  3: { short: "¼", long: "Un quart de la largeur" },
  4: { short: "⅓", long: "Un tiers de la largeur" },
  6: { short: "½", long: "La moitié de la largeur" },
  8: { short: "⅔", long: "Deux tiers de la largeur" },
  9: { short: "¾", long: "Trois quarts de la largeur" },
  12: { short: "1", long: "Toute la largeur" },
};

export type DashboardWidgetPreference = {
  id: DashboardWidgetId;
  span: DashboardWidgetSpan;
  visible: boolean;
};

export type DashboardWidgetDefinition = {
  id: DashboardWidgetId;
  label: string;
  description: string;
  defaultSpan: DashboardWidgetSpan;
  /** En dessous, le bloc devient illisible (graphique, planning). */
  minSpan: DashboardWidgetSpan;
};

/**
 * L'ordre de ce tableau est la disposition d'origine, et il porte une
 * intention de lecture : l'accueil et l'état d'ouverture d'abord, les
 * chiffres du jour ensuite, le planning au centre, l'analyse en bas.
 */
export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  { id: "availabilityCabinet", label: "Ouverture du cabinet", description: "Statut, horaires du jour et accès au gestionnaire de disponibilités.", defaultSpan: 6, minSpan: 3 },
  { id: "availabilityHome", label: "Ouverture à domicile", description: "Statut, horaires du jour et accès au gestionnaire de disponibilités.", defaultSpan: 6, minSpan: 3 },
  { id: "stats", label: "Chiffres clés", description: "Rendez-vous du jour, de la semaine, clients, chiffre d'affaires, demandes.", defaultSpan: 12, minSpan: 6 },
  { id: "planning", label: "Planning du jour", description: "Les rendez-vous d'aujourd'hui, heure par heure.", defaultSpan: 12, minSpan: 6 },
  { id: "activityChart", label: "Rendez-vous par jour", description: "L'activité de la période, jour par jour.", defaultSpan: 8, minSpan: 6 },
  { id: "nextTour", label: "Prochaine tournée", description: "La tournée à venir et ses arrêts.", defaultSpan: 4, minSpan: 3 },
  { id: "animals", label: "Animaux vus", description: "Répartition par espèce des animaux réellement reçus.", defaultSpan: 4, minSpan: 3 },
  { id: "activitySummary", label: "Mon activité", description: "Animaux suivis, clients actifs, durée moyenne, prestation la plus demandée.", defaultSpan: 4, minSpan: 3 },
  { id: "reminders", label: "Rappels à envoyer", description: "Les clients à recontacter.", defaultSpan: 4, minSpan: 3 },
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetPreference[] = DASHBOARD_WIDGETS.map((widget) => ({
  id: widget.id,
  span: widget.defaultSpan,
  visible: true,
}));

export function widgetDefinition(id: DashboardWidgetId): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGETS.find((widget) => widget.id === id);
}

/**
 * Conversion des dispositions enregistrées avant le passage à douze colonnes,
 * où la largeur s'exprimait en quarts (1 à 4). Le travail de personnalisation
 * déjà fait est conservé : une disposition ne doit pas être effacée par une
 * mise à jour du logiciel.
 */
const legacyQuarterSpans: Record<number, DashboardWidgetSpan> = { 1: 3, 2: 6, 3: 9, 4: 12 };

/** L'ancien bloc unique « Ouverture cabinet et domicile », devenu deux cartes. */
const legacyWidgetIds: Record<string, DashboardWidgetId[]> = {
  availability: ["availabilityCabinet", "availabilityHome"],
};

/**
 * Ancienne ou nouvelle disposition ? La question n'est pas théorique : « 3 »
 * valait trois quarts hier et vaut un quart aujourd'hui. Sans savoir de quelle
 * époque vient la disposition, un bloc réglé au quart se retrouverait relu à
 * trois quarts au chargement suivant.
 *
 * Le repère est l'identité des blocs, pas leur largeur : toute disposition
 * d'avant contient « availability » — le bloc d'ouverture unique — et aucune
 * disposition d'après ne le contient, puisque chaque enregistrement réécrit
 * le catalogue entier.
 */
function isLegacyLayout(entries: unknown[]): boolean {
  return entries.some((entry) => typeof entry === "object" && entry !== null && (entry as { id?: unknown }).id === "availability");
}

function nearestSpan(value: number): DashboardWidgetSpan {
  return DASHBOARD_SPANS.reduce((closest, span) => (Math.abs(span - value) < Math.abs(closest - value) ? span : closest), DASHBOARD_SPANS[0]);
}

function resolveSpan(raw: unknown, definition: DashboardWidgetDefinition, legacy: boolean): DashboardWidgetSpan {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return definition.defaultSpan;
  const rounded = Math.round(raw);
  const span = legacy && legacyQuarterSpans[rounded] ? legacyQuarterSpans[rounded] : nearestSpan(rounded);
  return span < definition.minSpan ? definition.minSpan : span;
}

/**
 * Relit une disposition enregistrée sans jamais lui faire confiance : elle a
 * pu être écrite par une version antérieure du catalogue. Les blocs inconnus
 * sont écartés, les anciens sont convertis, et ceux qui manquent sont insérés
 * à **leur place dans le catalogue** plutôt qu'ajoutés en fin de liste — un
 * bloc conçu pour vivre à côté d'un autre doit apparaître à côté de lui, pas
 * relégué tout en bas d'un tableau de bord déjà personnalisé.
 */
export function normalizeDashboardLayout(raw: unknown): DashboardWidgetPreference[] {
  const entries = Array.isArray(raw) ? raw : [];
  const legacy = isLegacyLayout(entries);
  const seen = new Set<DashboardWidgetId>();
  const layout: DashboardWidgetPreference[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, span, visible } = entry as Partial<DashboardWidgetPreference>;
    if (typeof id !== "string") continue;

    // Un ancien bloc peut s'être scindé : il rend alors ses deux successeurs,
    // à sa place et avec sa visibilité.
    const targets = legacyWidgetIds[id] ?? [id as DashboardWidgetId];
    for (const target of targets) {
      const definition = widgetDefinition(target);
      if (!definition || seen.has(definition.id)) continue;
      seen.add(definition.id);
      layout.push({
        id: definition.id,
        // Un bloc issu d'une scission reprend sa largeur par défaut : l'ancienne
        // largeur décrivait le bloc entier, pas chacune de ses moitiés.
        span: targets.length > 1 ? definition.defaultSpan : resolveSpan(span, definition, legacy),
        visible: visible !== false,
      });
    }
  }

  for (const [index, definition] of DASHBOARD_WIDGETS.entries()) {
    if (seen.has(definition.id)) continue;
    // Point d'insertion : juste après le dernier bloc du catalogue qui le
    // précède et qui est déjà placé.
    const previousIds = DASHBOARD_WIDGETS.slice(0, index).map((widget) => widget.id);
    let position = 0;
    for (let cursor = 0; cursor < layout.length; cursor += 1) {
      if (previousIds.includes(layout[cursor].id)) position = cursor + 1;
    }
    layout.splice(position, 0, { id: definition.id, span: definition.defaultSpan, visible: true });
    seen.add(definition.id);
  }

  return layout;
}
