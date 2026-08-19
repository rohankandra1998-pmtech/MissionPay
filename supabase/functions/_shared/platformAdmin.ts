export type PlatformAdminAuthorization =
  | { ok: true; userId: string }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

export async function authorizePlatformAdmin(
  getUserId: () => Promise<string | null>,
  hasMembership: (userId: string) => Promise<boolean>,
): Promise<PlatformAdminAuthorization> {
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!await hasMembership(userId)) return { ok: false, reason: "forbidden" };
  return { ok: true, userId };
}
