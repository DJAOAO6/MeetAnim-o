import { NextResponse, type NextRequest } from "next/server";
import { systemHealth } from "@/lib/health";
import { hasCronSecret } from "@/lib/secret-compare";

export const dynamic = "force-dynamic";

/**
 * Route de surveillance (audit 2026-10, EXP-02) : une sonde externe
 * l'interroge et prévient quand elle ne répond plus 200.
 *
 * Sans secret : seulement « ok » ou non — l'état interne n'a pas à être
 * public. Avec « Authorization: Bearer <CRON_SECRET> » : le détail de
 * chaque contrôle (src/lib/health.ts).
 */
export async function GET(request: NextRequest) {
  const health = await systemHealth();
  const status = health.ok ? 200 : 503;
  const body = hasCronSecret(request.headers.get("authorization")) ? health : { ok: health.ok };
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
