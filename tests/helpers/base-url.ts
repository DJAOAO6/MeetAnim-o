/**
 * Adresse du serveur de test.
 *
 * Un port à part (3100), et non celui du serveur de développement (3000) :
 * les tests démarrent leur propre serveur, branché sur la base de test, et
 * peuvent donc tourner pendant que le serveur de développement sert
 * l'application sur la base de développement — sans jamais s'y brancher par
 * erreur. `E2E_PORT` permet d'en choisir un autre.
 */
export const E2E_PORT = process.env.E2E_PORT ?? "3100";
export const BASE_URL = `http://localhost:${E2E_PORT}`;
