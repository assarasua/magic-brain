import { query } from "@/lib/db";

type ReferralSummaryRow = {
  referral_code: string;
  referral_count: string;
  rank: string;
};

type LeaderRow = {
  display_name: string | null;
  referral_count: string;
};

export function referralUrl(code: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://magicbrain.es";
  return `${origin.replace(/\/$/, "")}/login?ref=${encodeURIComponent(code)}`;
}

export function publicReferrerName(name: string | null, position: number) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return `Collector ${position}`;
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)?.[0] ?? ""}.`;
}

export async function getReferralDashboard(userId: string) {
  const summary = await query<ReferralSummaryRow>(
    `
      with totals as (
        select u.id, u.referral_code, count(r.id)::int as referral_count
        from app_users u
        left join app_referrals r on r.referrer_user_id = u.id
        where u.authenticated_at is not null
        group by u.id, u.referral_code
      ), ranked as (
        select *, dense_rank() over (order by referral_count desc)::int as rank
        from totals
      )
      select referral_code, referral_count::text, rank::text
      from ranked where id = $1
    `,
    [userId],
  );
  const leaders = await query<LeaderRow>(
    `
      select u.display_name, count(r.id)::text as referral_count
      from app_users u
      join app_referrals r on r.referrer_user_id = u.id
      where u.authenticated_at is not null
      group by u.id, u.display_name
      order by count(r.id) desc, min(r.created_at), u.id
      limit 10
    `,
  );
  const row = summary.rows[0];
  if (!row) throw new Error("Referral profile not found");
  return {
    code: row.referral_code,
    url: referralUrl(row.referral_code),
    count: Number(row.referral_count),
    rank: Number(row.rank),
    leaderboard: leaders.rows.map((leader, index) => ({
      position: index + 1,
      name: publicReferrerName(leader.display_name, index + 1),
      count: Number(leader.referral_count),
    })),
  };
}
