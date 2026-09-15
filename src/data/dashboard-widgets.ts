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
  | "availability"
  | "stats"
  | "planning"
  | "activityChart"
  | "nextTour"
  | "reminders"
  | "activitySummary";

export type DashboardWidgetSpan = 1 | 2 | 3 | 4;

export type DashboardWidgetPreference = {
  id: DashboardWidgetId;
  /** Largeur en colonnes de la grille (4 colonnes sur grand écran). */
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

export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  { id: "availability", label: "Ouverture cabinet et domicile", description: "Ouvrir ou fermer les réservations en un geste.", defaultSpan: 4, minSpan: 2 },
  { id: "stats", label: "Chiffres clés", description: "Rendez-vous du jour, de la semaine, clients, rappels.", defaultSpan: 4, minSpan: 2 },
  { id: "planning", label: "Planning du jour", description: "Les rendez-vous d'aujourd'hui, heure par heure.", defaultSpan: 3, minSpan: 2 },
  { id: "activityChart", label: "Activité", description: "Évolution des consultations sur les derniers mois.", defaultSpan: 3, minSpan: 2 },
  { id: "nextTour", label: "Prochaine tournée", description: "La tournée à venir et ses arrêts.", defaultSpan: 1, minSpan: 1 },
  { id: "reminders", label: "Rappels à relancer", description: "Les clients à recontacter.", defaultSpan: 1, minSpan: 1 },
  { id: "activitySummary", label: "Résumé de l'activité", description: "Répartition des clients et des espèces.", defaultSpan: 1, minSpan: 1 },
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
 * Relit une disposition enregistrée sans jamais lui faire confiance : elle a
 * pu être écrite par une version antérieure du catalogue. Les blocs inconnus
 * sont écartés, ceux qui manquent sont ajoutés à la suite avec leurs réglages
 * par défaut, et les largeurs sont ramenées dans les bornes du bloc.
 */
export function normalizeDashboardLayout(raw: unknown): DashboardWidgetPreference[] {
  const entries = Array.isArray(raw) ? raw : [];
  const seen = new Set<DashboardWidgetId>();
  const layout: DashboardWidgetPreference[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, span, visible } = entry as Partial<DashboardWidgetPreference>;
    const definition = typeof id === "string" ? widgetDefinition(id as DashboardWidgetId) : undefined;
    if (!definition || seen.has(definition.id)) continue;
    seen.add(definition.id);
    const requestedSpan = typeof span === "number" ? Math.round(span) : definition.defaultSpan;
    layout.push({
      id: definition.id,
      span: Math.min(4, Math.max(definition.minSpan, requestedSpan)) as DashboardWidgetSpan,
      visible: visible !== false,
    });
  }

  for (const definition of DASHBOARD_WIDGETS) {
    if (seen.has(definition.id)) continue;
    layout.push({ id: definition.id, span: definition.defaultSpan, visible: true });
  }

  return layout;
}
