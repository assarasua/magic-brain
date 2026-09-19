# Commander play

`/play` is an unofficial Commander table for two to four players. It supports local
practice against computer opponents, shared-screen play, and private online rooms
with a mix of humans and computers. The landing page and product navigation link
to it. WebMCP can navigate to it; game actions are not MCP tools.

## Playing

Choose **Local table / vs computer** to play without an account. Choose human or
computer for each seat. **Computer players only** automatically takes computer
turns and passes priority back to humans. One automatic action, automatic turn,
full demonstration, pause, manual actions and a 50-action undo history are available.
The current local game is saved in this browser and can be resumed after a reload.

Choose **Online multiplayer** to create a room with your Magic Brain account.
Choose your deck and two, three or four seats. Share the invite URL directly with
friends. Each human signs in, joins one seat, and saves their own deck. The host
can fill empty seats with computer opponents and starts once all decks are ready.
Humans control their own seats. Computer decisions run on the server. All clients
poll every two seconds and may reconnect through the same URL. There is no public
matchmaking, chat, spectator mode or game action API for external agents.

## Decks

Paste quantities and English card names, upload a `.txt`/`.dec` export, load a
named deck saved on this device, or import a signed-in Magic Brain collection
list. Importing does not change holdings. A separately chosen commander appearing
in the pasted list is counted once. Commander sections and `*CMDR*` tags, set codes
and collector numbers are accepted; sideboards and maybeboards are ignored.

Checks cover 100-card accounting, recognized commander types, color identity and
copy limits, including explicit any-number exceptions. Banned lists, partner
eligibility and unusual construction exceptions need manual verification. Unknown
metadata and implemented effect coverage are separate warnings. Pair commanders
with unverified pairing abilities require manual play.

The four deliberately simple practice lists use Isamaru/Hare Apparent,
Jasmine Boreal/Slime Against Humanity, Tobias Andrion/Persistent Petitioners and
Lady Orca/Relentless Rats. They are practice decks, not competitive recommendations.
The 31-card Oracle snapshot in `starter-cards.json` was obtained from Magic Brain's
imported card API on 2026-09-19; each definition keeps its Oracle identifier, source
URL and update date. Changed Oracle text does not inherit an old implementation.

## Engine coverage and limits

Implemented rules include 40 life, command zones, commander tax, commander combat
damage, London mulligans (first multiplayer mulligan free), multiplayer priority,
LIFO spell/ability stack, turn steps, land timing, basic mana payment, summoning
sickness, attacks against multiple defenders, blockers, first/double strike,
trample, flying/reach, haste, vigilance, defender, menace, deathtouch, lifelink,
indestructible, life/poison/decking losses, cleanup and elimination.

The practice effect registry implements simple creatures and basic lands,
Llanowar Elves, Lightning Bolt, Giant Growth, Divination, Counterspell, Unsummon,
Relentless Rats, Hare Apparent, Persistent Petitioners and Slime Against Humanity.
Combat defaults to lethal damage per blocker in declaration order, then trample;
a different legal assignment needs a manual ruling. The computer uses a simple,
deterministic strategy based on its own hand and public information, not an LLM.

**This is not an implementation of every Magic card or every interaction.** Oracle
text and Comprehensive Rules excerpts are evidence, not executable effects.
Replacement effects, arbitrary triggered abilities, layers, characteristic-defining
abilities, legend checks, protection, planeswalker/battle attacks, complex costs,
and many format exceptions need manual resolution. Unimplemented creature stats
and lethal damage are not automatically adjudicated. Commander hand/library choices
are represented as pending choices following a zone move; interactions depending
on the exact replacement timing need manual handling.

Manual tools move cards, add abilities to the stack, draw/shuffle, create tokens,
change control, adjust life/poison/mana/counters/marked damage, record commander
damage and select a step. Step selection does not execute its turn-based actions.
Every correction requires a shared explanation. Local manual changes pause automatic
play; undo can restore the prior automatic state. Online the host adjudicates
manual corrections. These pause computer play and let the host control computer
seats, while other humans' hands remain private. A custom manual deck cannot start
an online game with computer seats; choose human seats or supported practice decks.
The local table is bounded to 900 cards/tokens and automatic playback to 3,000 actions
per run, with an explicit pause when a limit is reached.

## Online persistence and access

Migration `036_commander_rooms.sql` uses the existing PostgreSQL service. Rooms
expire after seven days; expired rows are removed on later room creation. An account
can host at most 12 unexpired rooms. Decks and seating lock once a game starts.
Account export includes that user's room metadata and deck inputs. Account deletion
also removes rooms containing that account, including rooms hosted by someone else.

Room writes authenticate the Google session, require same-origin JSON requests,
lock the database row, compare the submitted revision, apply the server reducer,
and commit one new revision. Stale or duplicated requests return 409 and refresh
the client rather than replaying a move. A forged player number cannot take another
human's seat. The host alone can record shared manual rulings.

The server never sends other players' hands or library identities/order to a client.
Hidden objects get placeholder IDs and definitions; the shuffle seed and unused
card definitions are omitted. Public pending commander choices remain visible.
Invite holders who have not joined get only a lobby summary. Responses are private,
`no-store` and `noindex`. The invite URL is a random UUID capability: anyone with
it and an account can take an open seat, so share it only with intended players.

## Verification

Engine tests cover deck parsing, mulligans, stack responses, timing, commander tax,
combat, effects, hidden-information computer decisions, state restoration and full
2/3/4-player games. Room tests cover joins, ownership, hidden-zone projections,
concurrent revisions, reconnects, manual boundaries and complete mixed games.
The browser regression runs two isolated human contexts against the real room
reducer with fixture auth/storage; it exercises deck import, room creation, computer
seats, joining, synchronized moves, reloading, and English/Spanish mobile layout.
No browser test contacts real accounts or provider APIs.
