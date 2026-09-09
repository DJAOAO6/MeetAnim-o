import { test } from "node:test";
import assert from "node:assert/strict";
import { AVAILABLE_ANATOMY_VIEWS, getAnatomyView, hitboxLabel, hitboxZoneIds } from "../src/lib/anatomy/views";
import { findAnatomyNode } from "../src/lib/anatomy/taxonomy";

test("chaque zone d'une carte existe réellement dans le référentiel", () => {
  for (const view of AVAILABLE_ANATOMY_VIEWS) {
    for (const hitbox of view.hitboxes) {
      assert.ok(findAnatomyNode(hitbox.zoneId), `${hitbox.zoneId} (vue ${view.id}) absent du référentiel`);
    }
  }
});

test("une vue n'expose jamais une zone du côté opposé", () => {
  for (const view of AVAILABLE_ANATOMY_VIEWS) {
    for (const hitbox of view.hitboxes) {
      const node = findAnatomyNode(hitbox.zoneId);
      if (node?.side) {
        assert.equal(node.side, view.sideVisible, `${hitbox.zoneId} ne peut pas apparaître dans ${view.id}`);
      }
    }
  }
});

test("aucune zone n'est cartographiée deux fois dans la même vue", () => {
  for (const view of AVAILABLE_ANATOMY_VIEWS) {
    const ids = view.hitboxes.map((hitbox) => hitbox.zoneId);
    assert.equal(new Set(ids).size, ids.length, `doublon dans ${view.id}`);
  }
});

test("les deux vues latérales couvrent le même nombre de zones", () => {
  const left = getAnatomyView("dog.lateral-left");
  const right = getAnatomyView("dog.lateral-right");
  assert.ok(left && right);
  assert.equal(left.hitboxes.length, right.hitboxes.length);
});

test("la vue droite porte bien les zones droites, pas les gauches", () => {
  const right = getAnatomyView("dog.lateral-right");
  assert.ok(right);
  const ids = hitboxZoneIds(right);
  assert.ok(ids.has("dog.hindlimb.right.knee"));
  assert.ok(!ids.has("dog.hindlimb.left.knee"));
  // Les structures médianes restent présentes dans les deux vues.
  assert.ok(ids.has("dog.spine.sacrum"));
});

test("toute hitbox porte un point d'ancrage de libellé dans le viewBox", () => {
  for (const view of AVAILABLE_ANATOMY_VIEWS) {
    for (const hitbox of view.hitboxes) {
      assert.ok(hitbox.labelAnchor.x >= 0 && hitbox.labelAnchor.x <= view.viewBox.width, `${hitbox.zoneId} hors cadre en x`);
      assert.ok(hitbox.labelAnchor.y >= 0 && hitbox.labelAnchor.y <= view.viewBox.height, `${hitbox.zoneId} hors cadre en y`);
    }
  }
});

test("le libellé d'une hitbox vient du référentiel", () => {
  const left = getAnatomyView("dog.lateral-left");
  assert.ok(left);
  const knee = left.hitboxes.find((hitbox) => hitbox.zoneId === "dog.hindlimb.left.knee");
  assert.ok(knee);
  assert.equal(hitboxLabel(knee), "Genou gauche");
});

test("les vues dorsale et ventrale sont déclarées mais non cartographiées", () => {
  assert.equal(getAnatomyView("dog.dorsal"), null);
  assert.equal(getAnatomyView("dog.ventral"), null);
  assert.equal(AVAILABLE_ANATOMY_VIEWS.length, 2);
});

test("les vues livrées sont marquées en attente d'illustration", () => {
  for (const view of AVAILABLE_ANATOMY_VIEWS) {
    assert.equal(view.awaitingIllustration, true);
  }
});
