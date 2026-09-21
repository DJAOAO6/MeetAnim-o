import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDocumentContent, sanitizeDocumentHtml } from "../src/lib/documents/sanitize-server";
import type { DocumentContent } from "../src/lib/documents/content";

/**
 * Assainissement du HTML des comptes rendus.
 *
 * Deux choses comptent autant l'une que l'autre : que rien d'exécutable ne
 * passe, et que rien de ce que produisent l'éditeur et les modèles fournis ne
 * soit perdu — un filtre qui abîme les documents existants serait retiré au
 * premier signalement.
 */

test("un gestionnaire d'évènement ne survit pas", () => {
  const out = sanitizeDocumentHtml(`<p>Bonjour</p><img src="x" onerror="alert(1)">`);
  assert.equal(out, "<p>Bonjour</p>");
});

test("les balises script et style disparaissent avec leur contenu", () => {
  const out = sanitizeDocumentHtml(`<p>A</p><script>alert(1)</script><style>p{color:red}</style><p>B</p>`);
  assert.equal(out, "<p>A</p><p>B</p>");
});

test("un lien javascript: perd sa cible", () => {
  const out = sanitizeDocumentHtml(`<a href="javascript:alert(1)">clic</a>`);
  assert.ok(!out.includes("javascript:"), out);
});

test("un lien web garde sa cible, sans pouvoir piloter l'onglet du logiciel", () => {
  const out = sanitizeDocumentHtml(`<a href="https://exemple.fr" target="_blank">site</a>`);
  assert.match(out, /href="https:\/\/exemple\.fr"/);
  assert.match(out, /rel="noopener noreferrer"/);
});

test("une image de fond distante dans un style est retirée, le reste du style est gardé", () => {
  const out = sanitizeDocumentHtml(`<p style="color:#1f2933;background-color:url(https://pisteur.example/x.png)">t</p>`);
  assert.ok(!out.includes("url("), out);
  assert.match(out, /color:#1f2933/);
});

test("la légende des modèles fournis passe intacte", () => {
  // Chaîne exacte de legendHtml (content.ts) et des modèles seedés.
  const legend = `<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a97a0">Motif de consultation</p>`;
  assert.equal(sanitizeDocumentHtml(legend), legend);
});

test("ce que produit l'éditeur (gras, italique, couleur, taille, alignement, listes) est conservé", () => {
  const html = `<p style="text-align:center"><strong>Gras</strong> <em>italique</em> <u>souligné</u> <s>barré</s></p><p><span style="color:#b3245c;font-size:18px;font-family:Georgia">coloré</span></p><ul><li>un</li><li>deux</li></ul>`;
  assert.equal(sanitizeDocumentHtml(html), html);
});

test("un style déjà sûr est gardé à l'identique, espaces et point-virgule compris", () => {
  // Écriture exacte de Tiptap (TextStyleKit) : la réécrire n'apporterait
  // rien et casserait toute comparaison avec ce que l'éditeur a produit.
  for (const html of [
    `<p><span style="color: rgb(255, 0, 0);">Texte coloré</span></p>`,
    `<p><span style="font-family: var(--font-poppins);">Texte en Poppins</span></p>`,
  ]) assert.equal(sanitizeDocumentHtml(html), html);
});

test("une police entre guillemets n'est pas coupée", () => {
  const out = sanitizeDocumentHtml(`<p><span style="font-family: &quot;Playfair Display&quot;, serif; color: #333">t</span></p>`);
  assert.match(out, /font-family: &quot;Playfair Display&quot;, serif/);
  assert.match(out, /color: #333/);
});

test("seule la déclaration dangereuse est retirée, les autres restent", () => {
  const out = sanitizeDocumentHtml(`<p style="color: #111; background-color: url(https://pisteur.example/x.png); position: fixed; font-size: 12px">t</p>`);
  assert.equal(out, `<p style="color: #111; font-size: 12px">t</p>`);
});

test("seuls les blocs de texte sont touchés dans un document complet", () => {
  const content: DocumentContent = {
    formatVersion: 1,
    pageSize: "A4_PORTRAIT",
    pages: [{
      id: "page-1",
      elements: [
        { id: "t1", type: "text", x: 0, y: 0, width: 100, height: 20, rotation: 0, html: `<p>ok</p><img src=x onerror=alert(1)>` },
        { id: "r1", type: "rect", x: 0, y: 0, width: 10, height: 10, rotation: 0, fill: "#fff", stroke: "#000", strokeWidth: 1 } as never,
      ],
    }],
  };
  const out = sanitizeDocumentContent(content);
  const [text, rect] = out.pages[0].elements as [{ html: string }, unknown];
  assert.equal(text.html, "<p>ok</p>");
  assert.deepEqual(rect, content.pages[0].elements[1]);
});
