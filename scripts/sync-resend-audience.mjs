import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const apiKey = process.env.RESEND_API_KEY;
const audienceId = process.env.RESEND_AUDIENCE_ID;

if (!connectionString) throw new Error("DATABASE_URL is not configured");
if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
if (!audienceId) throw new Error("RESEND_AUDIENCE_ID is not configured");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const { rows } = await client.query(`
    select lower(email) as email
    from app_users
    where authenticated_at is not null
      and email is not null
      and email <> ''
    order by created_at asc
  `);

  let synced = 0;
  let existing = 0;
  for (const row of rows) {
    const response = await fetch(
      `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: row.email, unsubscribed: false }),
      },
    );
    if (response.ok) synced += 1;
    else if (response.status === 409) existing += 1;
    else throw new Error(`Resend contact sync failed with HTTP ${response.status}`);
  }

  console.log(`Resend audience sync complete: ${synced} added, ${existing} already present, ${rows.length} total.`);
} finally {
  await client.end();
}
