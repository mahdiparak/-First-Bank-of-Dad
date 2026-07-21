import type { FamilyBankState } from "./schema";
import type { DeviceRole } from "./storage";

export interface AccessIdentity {
  email: string;
}

/**
 * Cloudflare Access (protecting this Pages deployment) exposes the current session's
 * authenticated identity at this well-known path. Returns null on anything that isn't a
 * successful, well-formed response — e.g. local dev, or a deployment with no Access policy.
 */
export async function fetchAccessIdentity(): Promise<AccessIdentity | null> {
  try {
    const response = await fetch("/cdn-cgi/access/get-identity", { credentials: "include" });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const email = (data as { email?: unknown } | null)?.email;
    return typeof email === "string" && email ? { email: email.toLowerCase() } : null;
  } catch {
    return null;
  }
}

export interface RoleMatch {
  role: DeviceRole;
  parentId?: string;
  kidId?: string;
}

/** Matches the signed-in Access email against named parent/kid profiles, so a device can open straight to the right dashboard. */
export async function resolveRoleFromAccessIdentity(state: FamilyBankState): Promise<RoleMatch | null> {
  const identity = await fetchAccessIdentity();
  if (!identity) return null;

  const parent = state.parentProfiles.find((candidate) => candidate.email?.toLowerCase() === identity.email);
  if (parent) return { role: "parent", parentId: parent.id };

  const kid = state.kids.find((candidate) => candidate.email?.toLowerCase() === identity.email);
  if (kid) return { role: "kid", kidId: kid.id };

  return null;
}
