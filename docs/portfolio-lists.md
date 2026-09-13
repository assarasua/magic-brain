# Portfolio lists and sharing

Portfolio holdings belong to exactly one user-owned list. Migration `019` creates
one localized default list per existing user and moves every existing holding
into it before making `list_id` required.

Bulk move, copy, and delete requests are bounded to 200 unique holdings,
ownership checked in one transaction, and keyed by a client UUID so retries
return the original result. Move changes a holding's list, copy creates another
lot while preserving the source, and delete permanently removes the lot.

## Shared links

Shared portfolio links are **live read-only views**, not snapshots. They reflect
the current contents and public market prices for one list. Deleting the list
cascades to its links, and owners can revoke a link at any time.

Each link uses 32 cryptographically random bytes encoded as base64url. Only its
SHA-256 hash is stored. A link expires server-side exactly 24 hours after
creation; creating a replacement revokes the prior active link for that list.
The public response excludes owner data, acquisition and purchase details,
cost basis, P&L, notes, preferences, alerts, internal identifiers, and ML
metadata. Responses are non-cacheable, non-indexable, same-origin by default,
and protected by a database-backed per-minute rate limit.
