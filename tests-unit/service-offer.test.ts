import { test } from "node:test";
import assert from "node:assert/strict";
import { serviceOfferLabel } from "../src/lib/service-offer";

test("libellé d'une prestation selon les modes où elle est proposée", () => {
  const both = { cabinetEnabled: true, cabinetPrice: 60, homeEnabled: true, homePrice: 70 };
  assert.equal(serviceOfferLabel(both, true), "60 € au cabinet · 70 € à domicile");
  assert.equal(serviceOfferLabel({ ...both, homeEnabled: false }, true), "Cabinet uniquement · 60 €");
  assert.equal(serviceOfferLabel({ ...both, cabinetEnabled: false }, true), "Domicile uniquement · 70 €");
  // Qui n'exerce que d'une façon : pas de « uniquement ».
  assert.equal(serviceOfferLabel({ ...both, homeEnabled: false }, false), "60 € au cabinet");
});
