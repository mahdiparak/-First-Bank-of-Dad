import { questIcon, type Bounty, type FamilyBankState } from "./schema";

function kidName(state: FamilyBankState, kidId: string): string {
  return state.kids.find((kid) => kid.id === kidId)?.name ?? "A kid";
}

const BULK_THRESHOLD = 5; // a first sync landing dozens of quests at once isn't a "new quest" moment

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  return Notification.requestPermission();
}

async function showNotification(title: string, options: NotificationOptions): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
  } catch {
    // No active service worker in this browser — nothing to show it with.
  }
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function notifyNewQuest(bounty: Bounty): void {
  void showNotification("🗺️ New quest posted!", {
    body: `${questIcon(bounty)} ${bounty.title} — ${formatCurrency(bounty.reward)}`,
    tag: `quest-${bounty.id}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  });
}

/**
 * Nudges a kid's device the moment a new open quest shows up in state — whether that's a local
 * mutation or (the common case) a sync update after the parent posts one from their own device.
 * Skipped entirely on a bulk/first sync so an offline device catching up doesn't fire a burst.
 */
export function notifyNewQuests(prev: FamilyBankState | null, next: FamilyBankState): void {
  if (!prev || prev === next) return;
  if (notificationPermission() !== "granted") return;

  const prevIds = new Set(prev.bounties.map((bounty) => bounty.id));
  const newlyOpen = next.bounties.filter((bounty) => bounty.status === "open" && !prevIds.has(bounty.id));
  if (newlyOpen.length === 0 || newlyOpen.length > BULK_THRESHOLD) return;

  for (const bounty of newlyOpen) notifyNewQuest(bounty);
}

function notifyBountyClaimed(bounty: Bounty, claimant: string): void {
  void showNotification(`🙋 ${claimant} claimed a quest!`, {
    body: `${questIcon(bounty)} ${bounty.title} — ${formatCurrency(bounty.reward)}, waiting for your approval`,
    tag: `quest-claim-${bounty.id}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  });
}

/**
 * Nudges every parent device the moment a kid claims a quest, so the "Checking…" state a kid
 * sees on their end doesn't just sit there until a parent happens to open the Approvals tab.
 * Runs independently on each parent's own device — whichever ones have notifications enabled
 * all get nudged. Same bulk/first-sync guard as notifyNewQuests.
 */
export function notifyClaimedBounties(prev: FamilyBankState | null, next: FamilyBankState): void {
  if (!prev || prev === next) return;
  if (notificationPermission() !== "granted") return;

  const prevPending = new Set(
    prev.bounties.filter((bounty) => bounty.status === "pending-approval").map((bounty) => bounty.id),
  );
  const newlyClaimed = next.bounties.filter(
    (bounty) => bounty.status === "pending-approval" && !prevPending.has(bounty.id),
  );
  if (newlyClaimed.length === 0 || newlyClaimed.length > BULK_THRESHOLD) return;

  for (const bounty of newlyClaimed) {
    notifyBountyClaimed(bounty, bounty.claimedByKidId ? kidName(next, bounty.claimedByKidId) : "A kid");
  }
}
