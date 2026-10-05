/**
 * Partie de scripts/replay-deletions.mjs qui exécute la purge de
 * l'application (à lancer par lui seul : node --conditions=react-server
 * --import tsx). Reçoit sur l'entrée standard la liste des espaces à effacer
 * de nouveau, avec leur preuve d'origine.
 */
import { readFileSync } from "node:fs";
import { purgeOrganization } from "../src/lib/platform/organization-deletion";
import { prisma } from "../src/lib/db";

type Item = { id: string; reason?: "PROFESSIONAL_REQUEST" | "CONTRACT_END" | "FRAUD" | "OTHER"; requestedByUserId?: string | null };

const items = JSON.parse(readFileSync(0, "utf8")) as Item[];
let failures = 0;
for (const item of items) {
  const result = await purgeOrganization(item.id, { reason: item.reason, requestedByUserId: item.requestedByUserId ?? null });
  if (result.ok) {
    const rows = Object.values(result.rowCounts).reduce((sum, count) => sum + count, 0);
    console.info(`✓ espace effacé de nouveau (${rows} ligne(s)).`);
  } else {
    failures += 1;
    console.error(`✖ échec : ${result.error}`);
  }
}
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
