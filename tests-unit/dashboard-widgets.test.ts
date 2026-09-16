import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeDashboardLayout,
} from "../src/data/dashboard-widgets";

/**
 * Une disposition de tableau de bord est un travail de l'utilisateur. Elle est
 * relue à chaque affichage, souvent après une mise à jour du logiciel qui a
 * pu renommer, scinder ou ajouter des blocs — et elle ne doit jamais être
 * perdue, ni faire tomber la page.
 */

test("une disposition vide ou absurde revient à la disposition d’origine", () => {
  for (const raw of [null, undefined, "", 42, {}, [], [null, 3, "planning"]]) {
    const layout = normalizeDashboardLayout(raw);
    assert.deepEqual(layout, DEFAULT_DASHBOARD_LAYOUT, `entrée rejetée : ${JSON.stringify(raw)}`);
  }
});

test("les largeurs en quarts de l’ancienne grille deviennent des douzièmes", () => {
  const layout = normalizeDashboardLayout([
    // « availability » signe une disposition d'avant la grille 12 colonnes :
    // c'est lui qui autorise à relire les largeurs comme des quarts.
    { id: "availability", span: 4, visible: true },
    { id: "planning", span: 4, visible: true },
    { id: "activityChart", span: 3, visible: true },
    { id: "nextTour", span: 1, visible: true },
    { id: "reminders", span: 2, visible: true },
  ]);

  const span = (id: string) => layout.find((widget) => widget.id === id)!.span;
  assert.equal(span("planning"), 12, "4 quarts = toute la largeur");
  assert.equal(span("activityChart"), 9, "3 quarts = trois quarts");
  assert.equal(span("nextTour"), 3, "1 quart = un quart");
  assert.equal(span("reminders"), 6, "2 quarts = la moitié");
});

test("l’ancien bloc d’ouverture unique devient les deux cartes, à sa place", () => {
  const layout = normalizeDashboardLayout([
    { id: "planning", span: 4, visible: true },
    { id: "availability", span: 4, visible: true },
    { id: "reminders", span: 1, visible: true },
  ]);

  const ids = layout.map((widget) => widget.id);
  assert.equal(ids.indexOf("availabilityCabinet"), ids.indexOf("planning") + 1);
  assert.equal(ids.indexOf("availabilityHome"), ids.indexOf("planning") + 2);
  // L'ordre voulu par l'utilisateur est conservé : le planning reste devant.
  assert.ok(ids.indexOf("planning") < ids.indexOf("availabilityCabinet"));
});

test("un bloc masqué le reste après la scission", () => {
  const layout = normalizeDashboardLayout([{ id: "availability", span: 4, visible: false }]);
  assert.equal(layout.find((widget) => widget.id === "availabilityCabinet")!.visible, false);
  assert.equal(layout.find((widget) => widget.id === "availabilityHome")!.visible, false);
});

test("un bloc nouveau s’insère à sa place dans le catalogue, pas à la fin", () => {
  // Disposition d'une version antérieure : « animaux vus » n'existait pas.
  const previous = DASHBOARD_WIDGETS.filter((widget) => widget.id !== "animals").map((widget) => ({
    id: widget.id,
    span: widget.defaultSpan,
    visible: true,
  }));

  const layout = normalizeDashboardLayout(previous);
  const ids = layout.map((widget) => widget.id);
  assert.equal(ids.indexOf("animals"), ids.indexOf("nextTour") + 1, "il doit suivre « Prochaine tournée », comme dans le catalogue");
  assert.notEqual(ids.at(-1), "animals");
});

test("un bloc inconnu est écarté, et aucun bloc n’est perdu ni dupliqué", () => {
  const layout = normalizeDashboardLayout([
    { id: "widget-d-une-version-future", span: 6, visible: true },
    { id: "planning", span: 12, visible: true },
    { id: "planning", span: 3, visible: false },
  ]);

  assert.equal(layout.length, DASHBOARD_WIDGETS.length);
  assert.equal(layout.filter((widget) => widget.id === "planning").length, 1, "le doublon est ignoré");
  assert.equal(layout.find((widget) => widget.id === "planning")!.span, 12, "c’est la première occurrence qui compte");
  assert.equal(new Set(layout.map((widget) => widget.id)).size, layout.length);
});

test("une largeur trop étroite est remontée au minimum lisible du bloc", () => {
  // Le planning ne descend pas sous la moitié de la largeur.
  const layout = normalizeDashboardLayout([{ id: "planning", span: 3, visible: true }]);
  assert.equal(layout.find((widget) => widget.id === "planning")!.span, 6);
});

/**
 * Le piège de la migration : « 3 » valait trois quarts dans l'ancienne grille
 * et vaut un quart dans la nouvelle. Sans repère d'époque, un bloc réglé au
 * quart repasserait à trois quarts au chargement suivant, tout seul.
 */
test("une largeur de 3 se relit en quart dans une disposition récente, en trois quarts dans une ancienne", () => {
  const recent = normalizeDashboardLayout([
    { id: "availabilityCabinet", span: 6, visible: true },
    { id: "nextTour", span: 3, visible: true },
  ]);
  assert.equal(recent.find((widget) => widget.id === "nextTour")!.span, 3, "grille récente : 3 douzièmes");

  const old = normalizeDashboardLayout([
    { id: "availability", span: 4, visible: true },
    { id: "nextTour", span: 3, visible: true },
  ]);
  assert.equal(old.find((widget) => widget.id === "nextTour")!.span, 9, "ancienne grille : trois quarts");
});
