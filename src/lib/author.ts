export type UserLike = {
  id: string;
  email?: string | null;
};

// We keep this intentionally loose because Supabase's PostgREST builders are
// Promise-like (thenables) and are awkward to type precisely across versions.
type SupabaseLike = any;

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function parseEmailList(raw: string | null | undefined): Set<string> {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
}

/**
 * Comma-separated list of admin/author emails.
 * Example: "a@b.com, c@d.com"
 */
const ADMIN_EMAILS = parseEmailList(process.env.ADMIN_EMAILS);

export function isEmailAllowlisted(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return ADMIN_EMAILS.has(normalized);
}

/**
 * Determines whether the given user should be treated as an author/admin.
 * - First checks an email allowlist (ADMIN_EMAILS)
 * - Falls back to `profiles.is_author`
 */
export async function getIsAuthor(
  supabase: SupabaseLike,
  user: UserLike | null
): Promise<boolean> {
  if (!user) return false;

  if (isEmailAllowlisted(user.email)) return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_author")
    .eq("id", user.id)
    .single();

  return profile?.is_author ?? false;
}
