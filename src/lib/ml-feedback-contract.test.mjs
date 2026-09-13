import assert from "node:assert/strict";
import test from "node:test";

const { parseMlFeedbackEvent } = await import("./ml-feedback-contract.ts");

const now = new Date("2025-06-01T12:00:00.000Z");
const validEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",
  eventType: "impression",
  surface: "brain_signals",
  cardId: "22222222-2222-4222-8222-222222222222",
  occurredAt: "2025-06-01T11:59:00.000Z",
  scoreId: "33333333-3333-4333-8333-333333333333",
  modelVersion: "ranking-v1.2",
  rankPosition: 3,
};

test("feedback parsing returns a canonical allowlisted event", () => {
  assert.deepEqual(parseMlFeedbackEvent(validEvent, now), {
    ...validEvent,
    alertAction: null,
  });
});

test("feedback parsing rejects unknown and privacy-risk fields", () => {
  assert.equal(
    parseMlFeedbackEvent({ ...validEvent, email: "person@example.com" }, now),
    null,
  );
  assert.equal(
    parseMlFeedbackEvent({ ...validEvent, metadata: { query: "secret" } }, now),
    null,
  );
});

test("feedback parsing rejects stale, future, and coerced input", () => {
  assert.equal(
    parseMlFeedbackEvent({ ...validEvent, occurredAt: "2024-01-01T00:00:00Z" }, now),
    null,
  );
  assert.equal(
    parseMlFeedbackEvent({ ...validEvent, occurredAt: "2025-06-01T12:06:00Z" }, now),
    null,
  );
  assert.equal(parseMlFeedbackEvent({ ...validEvent, rankPosition: "3" }, now), null);
});

test("alert actions require an explicit allowlisted action and surface", () => {
  assert.equal(
    parseMlFeedbackEvent(
      {
        ...validEvent,
        eventType: "alert_action",
        surface: "alert",
        alertAction: "save",
      },
      now,
    )?.alertAction,
    "save",
  );
  assert.equal(
    parseMlFeedbackEvent({ ...validEvent, eventType: "alert_action" }, now),
    null,
  );
  assert.equal(
    parseMlFeedbackEvent({ ...validEvent, alertAction: "dismiss" }, now),
    null,
  );
});

test("customer ML surfaces are allowlisted without free-form context", () => {
  for (const surface of ["daily_news", "opportunity_graph"]) {
    assert.equal(
      parseMlFeedbackEvent({ ...validEvent, surface }, now)?.surface,
      surface,
    );
  }
});
