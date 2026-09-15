import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Premier compte administrateur d'une base vierge, exécuté au démarrage du
 * conteneur (voir Dockerfile). Sans effet tant que BOOTSTRAP_ADMIN_EMAIL et
 * BOOTSTRAP_ADMIN_PASSWORD_HASH_BASE64 ne sont pas posées, et sans effet dès qu'un
 * administrateur existe déjà : relancé à chaque démarrage, il ne crée jamais
 * de doublon ni ne modifie un compte existant.
 *
 * Seul le hash bcrypt transite par la configuration, jamais le mot de passe
 * en clair, et rien de sensible n'est écrit dans les logs. Encodé en
 * base64 : un hash bcrypt contient des « $ », que docker compose
 * interpréterait comme des variables.
 */
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const hashBase64 = process.env.BOOTSTRAP_ADMIN_PASSWORD_HASH_BASE64?.trim();
  if (!email || !hashBase64) return;
  const passwordHash = Buffer.from(hashBase64, "base64").toString("utf8");
  if (!passwordHash.startsWith("$2")) throw new Error("BOOTSTRAP_ADMIN_PASSWORD_HASH_BASE64 ne contient pas un hash bcrypt.");

  const connectionString = process.env.DATABASE_URL ?? process.env.DB_URL;
  if (!connectionString) throw new Error("Aucune URL de base de données configurée.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    if (existingAdmin) {
      console.log("[bootstrap-admin] un administrateur existe déjà, rien à faire.");
      return;
    }

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || "Admin",
        lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || "1002 Pattes",
        role: "ADMIN",
        // Désactivée tant qu'aucun fournisseur d'email n'est configuré : le
        // code de connexion n'arriverait jamais et le compte serait bloqué.
        twoFactorEnabled: false,
      },
    });
    console.log("[bootstrap-admin] compte administrateur créé.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[bootstrap-admin] échec :", error instanceof Error ? error.message : error);
  process.exit(1);
});
