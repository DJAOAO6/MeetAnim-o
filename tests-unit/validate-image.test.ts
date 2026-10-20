import { strict as assert } from "node:assert";
import { test } from "node:test";
import { imageProblem, pdfProblem } from "../src/lib/images/validate-image";

const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64")}`;
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]).toString("base64")}`;
const rules = { maxChars: 1000 };

test("une vraie image passe ; vide = pas d'image", () => {
  assert.equal(imageProblem(png, rules), null);
  assert.equal(imageProblem(jpeg, rules), null);
  assert.equal(imageProblem("", rules), null);
  assert.equal(imageProblem(null, rules), null);
});

test("un contenu qui ment sur son type est refusé", () => {
  const html = `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;
  assert.notEqual(imageProblem(html, rules), null);
  const svgPretendingJpeg = `data:image/jpeg;base64,${Buffer.from("<svg></svg>").toString("base64")}`;
  assert.notEqual(imageProblem(svgPretendingJpeg, rules), null);
});

test("autre chose qu'une image est refusé : HTML, adresse externe, javascript:", () => {
  assert.notEqual(imageProblem(`data:text/html;base64,${Buffer.from("<b>x</b>").toString("base64")}`, rules), null);
  assert.notEqual(imageProblem("https://pisteur.example/pixel.gif", rules), null);
  assert.notEqual(imageProblem("javascript:alert(1)", rules), null);
  assert.notEqual(imageProblem("//autre-site.example/a.png", rules), null);
});

test("trop lourd : refusé", () => {
  assert.notEqual(imageProblem(png + "A".repeat(2000), { maxChars: 1000 }), null);
});

test("exceptions prévues : initiales, photos par défaut, fichiers du site", () => {
  assert.equal(imageProblem("PF", { ...rules, allowInitials: true }), null);
  assert.notEqual(imageProblem("PF", rules), null);
  assert.equal(imageProblem("https://images.unsplash.com/x", { ...rules, allowedUrls: ["https://images.unsplash.com/x"] }), null);
  assert.equal(imageProblem("/1002-pattes-logo.png", rules), null);
});

test("PDF : vraiment un PDF, de taille raisonnable", () => {
  const pdf = `data:application/pdf;filename=generated.pdf;base64,${Buffer.from("%PDF-1.3\n%").toString("base64")}`;
  assert.equal(pdfProblem(pdf, 1000), null);
  assert.notEqual(pdfProblem(`data:application/pdf;base64,${Buffer.from("<html>").toString("base64")}`, 1000), null);
  assert.notEqual(pdfProblem(pdf, 10), null);
});
