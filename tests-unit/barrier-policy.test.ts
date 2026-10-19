import { strict as assert } from "node:assert";
import { test } from "node:test";
import { inactiveBarrierAction } from "../src/lib/barrier-policy";

test("production sans seconde barrière : le serveur refuse de démarrer", () => {
  assert.equal(inactiveBarrierAction({ NODE_ENV: "production" }), "stop");
  assert.equal(inactiveBarrierAction({ NODE_ENV: "production", ALLOW_INACTIVE_DB_BARRIER: "0" }), "stop");
});

test("issue de secours explicite : il démarre en prévenant", () => {
  assert.equal(inactiveBarrierAction({ NODE_ENV: "production", ALLOW_INACTIVE_DB_BARRIER: "1" }), "warn");
});

test("hors production : il démarre en prévenant", () => {
  assert.equal(inactiveBarrierAction({ NODE_ENV: "development" }), "warn");
  assert.equal(inactiveBarrierAction({}), "warn");
});
