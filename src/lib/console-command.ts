export const CONSOLE_MAX_COMMAND_LENGTH = 500;
export const CONSOLE_MAX_OUTPUT_CHARS = 200_000;

export const CONSOLE_EXAMPLES = [
  "help",
  "doctor",
  "cards search \"black lotus\" --limit 8",
  "cards get 00000000-0000-4000-8000-000000000000",
  "cards prices 00000000-0000-4000-8000-000000000000",
  "cards history 00000000-0000-4000-8000-000000000000 --from 2026-01-01 --to 2026-09-01",
  "sets list --query modern --limit 12",
  "news latest",
  "predict scenario --set fin --budget 250 --risk balanced",
  "graph neighbours lotus --limit 24",
  "status api",
  "status mcp",
  "profile",
  "portfolio lists",
  "portfolio summary",
  "portfolio pnl",
  "portfolio forecast",
  "ml opportunities --limit 8",
] as const;

export type ConsoleCategory =
  | "system"
  | "cards"
  | "sets"
  | "news"
  | "predict"
  | "graph"
  | "profile"
  | "portfolio"
  | "ml";

export type ConsoleView =
  | "help"
  | "status"
  | "cards"
  | "card"
  | "prices"
  | "history"
  | "sets"
  | "news"
  | "scenario"
  | "graph"
  | "profile"
  | "lists"
  | "portfolio"
  | "opportunities";

export type ConsolePlan =
  | {
      kind: "help" | "health" | "doctor" | "api-status" | "mcp-status";
      category: "system";
      view: "help" | "status";
      json: boolean;
      terminalCommand: string;
    }
  | {
      kind: "request";
      category: Exclude<ConsoleCategory, "system">;
      view: Exclude<ConsoleView, "help" | "status">;
      auth: "public" | "personal";
      path: string;
      method: "GET" | "POST";
      query?: Record<string, string>;
      body?: unknown;
      json: boolean;
      terminalCommand: string;
    };

export class ConsoleCommandError extends Error {}

type ParsedInput = {
  words: string[];
  flags: Map<string, string | true>;
  json: boolean;
  normalized: string;
};

export function parseConsoleCommand(input: string): ConsolePlan {
  const parsed = parseInput(input);
  const [command, subcommand, ...rest] = parsed.words;
  const terminalCommand = `magic-brain ${parsed.normalized}`;
  const common = { json: parsed.json, terminalCommand };

  if (command === "help") {
    requireShape(parsed, [], 1);
    return { kind: "help", category: "system", view: "help", ...common };
  }
  if (command === "health" || command === "doctor") {
    requireShape(parsed, [], 1);
    return {
      kind: command,
      category: "system",
      view: "status",
      ...common,
    };
  }
  if (command === "status" && (subcommand === "api" || subcommand === "mcp")) {
    requireShape(parsed, [], 2);
    return {
      kind: subcommand === "api" ? "api-status" : "mcp-status",
      category: "system",
      view: "status",
      ...common,
    };
  }
  if (command === "cards" && subcommand === "search") {
    requireShape(parsed, ["set", "limit"], undefined);
    const query = rest.join(" ").trim();
    if (query.length < 2 || query.length > 100) {
      throw new ConsoleCommandError("Search text must be 2–100 characters.");
    }
    return requestPlan("cards", "cards", "public", "cards", parsed, {
      query: {
        q: query,
        set: optionalText(parsed, "set", 20),
        limit: integer(parsed, "limit", 8, 1, 50),
      },
    });
  }
  if (command === "cards" && subcommand === "get") {
    requireShape(parsed, [], 3);
    return requestPlan(
      "cards",
      "card",
      "public",
      `cards/${uuid(rest[0], "card ID")}`,
      parsed,
    );
  }
  if (command === "cards" && subcommand === "prices") {
    requireShape(parsed, [], 3);
    const ids = commaSeparatedUuids(rest[0], 100);
    return requestPlan("cards", "prices", "public", "prices/latest", parsed, {
      method: "POST",
      body: { cardIds: ids },
    });
  }
  if (command === "cards" && subcommand === "history") {
    requireShape(parsed, ["from", "to", "finish"], 3);
    const finish = optionalText(parsed, "finish", 10) ?? "all";
    if (!["all", "nonfoil", "foil"].includes(finish)) {
      throw new ConsoleCommandError("--finish must be all, nonfoil, or foil.");
    }
    return requestPlan(
      "cards",
      "history",
      "public",
      `cards/${uuid(rest[0], "card ID")}/prices`,
      parsed,
      {
        query: {
          from: date(parsed, "from"),
          to: date(parsed, "to"),
          finish,
        },
      },
    );
  }
  if (command === "sets" && subcommand === "list") {
    requireShape(parsed, ["query", "limit"], 2);
    return requestPlan("sets", "sets", "public", "sets", parsed, {
      query: {
        q: optionalText(parsed, "query", 80),
        limit: integer(parsed, "limit", 20, 1, 50),
      },
    });
  }
  if (command === "news" && subcommand === "latest") {
    requireShape(parsed, [], 2);
    return requestPlan("news", "news", "public", "news/latest", parsed);
  }
  if (command === "news" && subcommand === "list") {
    requireShape(parsed, ["limit"], 2);
    return requestPlan("news", "news", "public", "news", parsed, {
      query: { limit: integer(parsed, "limit", 10, 1, 30) },
    });
  }
  if (command === "news" && subcommand === "date") {
    requireShape(parsed, [], 3);
    return requestPlan(
      "news",
      "news",
      "public",
      `news/${dateValue(rest[0], "date")}`,
      parsed,
    );
  }
  if (command === "predict" && subcommand === "scenario") {
    requireShape(parsed, ["set", "budget", "risk", "positions"], 2);
    const risk = optionalText(parsed, "risk", 20) ?? "balanced";
    if (
      !["preservation", "conservative", "balanced", "growth", "aggressive"].includes(
        risk,
      )
    ) {
      throw new ConsoleCommandError("--risk is not supported.");
    }
    return requestPlan(
      "predict",
      "scenario",
      "public",
      "predict/portfolio",
      parsed,
      {
        method: "POST",
        body: {
          setCode: requiredText(parsed, "set", 8).toLowerCase(),
          budget: number(parsed, "budget", 25, 1_000_000),
          risk,
          maxPositions: integer(parsed, "positions", 8, 1, 20),
        },
      },
    );
  }
  if (command === "graph" && subcommand === "neighbours") {
    requireShape(parsed, ["focus", "limit"], undefined);
    const text = rest.join(" ").trim();
    if (text && (text.length < 2 || text.length > 100)) {
      throw new ConsoleCommandError("Graph search must be 2–100 characters.");
    }
    const focus = parsed.flags.get("focus");
    return requestPlan(
      "graph",
      "graph",
      "public",
      "opportunity-graph",
      parsed,
      {
        query: {
          q: text || undefined,
          focus:
            typeof focus === "string" ? uuid(focus, "focus card ID") : undefined,
          limit: integer(parsed, "limit", 24, 12, 80),
        },
      },
    );
  }
  if (command === "profile" && !subcommand) {
    requireShape(parsed, [], 1);
    return requestPlan("profile", "profile", "personal", "/api/account", parsed);
  }
  if (command === "portfolio" && subcommand === "lists") {
    requireShape(parsed, [], 2);
    return requestPlan(
      "portfolio",
      "lists",
      "personal",
      "/api/portfolio/lists",
      parsed,
    );
  }
  if (
    command === "portfolio" &&
    ["summary", "pnl", "forecast"].includes(subcommand ?? "")
  ) {
    requireShape(parsed, ["list"], 2);
    const list = parsed.flags.get("list");
    return requestPlan(
      "portfolio",
      "portfolio",
      "personal",
      "/api/portfolio",
      parsed,
      {
        query:
          typeof list === "string"
            ? { listId: uuid(list, "portfolio list ID") }
            : undefined,
      },
    );
  }
  if (command === "ml" && subcommand === "opportunities") {
    requireShape(parsed, ["limit"], 2);
    return requestPlan(
      "ml",
      "opportunities",
      "personal",
      "/api/brain/signals",
      parsed,
      { query: { limit: integer(parsed, "limit", 8, 1, 25) } },
    );
  }
  throw new ConsoleCommandError(
    "Unknown command. Run help to see supported commands.",
  );
}

function parseInput(input: string): ParsedInput {
  const trimmed = input.trim();
  if (!trimmed) throw new ConsoleCommandError("Enter a command.");
  if (trimmed.length > CONSOLE_MAX_COMMAND_LENGTH) {
    throw new ConsoleCommandError(
      `Commands are limited to ${CONSOLE_MAX_COMMAND_LENGTH} characters.`,
    );
  }
  const tokens = tokenize(trimmed);
  if (tokens.length > 48) throw new ConsoleCommandError("Too many arguments.");
  const words: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      words.push(token.toLowerCase());
      continue;
    }
    const name = token.slice(2);
    if (!/^[a-z][a-z-]*$/.test(name) || flags.has(name)) {
      throw new ConsoleCommandError(`Invalid or duplicate flag: ${token}`);
    }
    if (name === "json") {
      flags.set(name, true);
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ConsoleCommandError(`${token} requires a value.`);
    }
    flags.set(name, value);
    index += 1;
  }
  const normalized = [
    ...words,
    ...[...flags.entries()].flatMap(([name, value]) =>
      value === true ? [`--${name}`] : [`--${name}`, quote(value)],
    ),
  ].join(" ");
  return { words, flags, json: flags.get("json") === true, normalized };
}

function tokenize(input: string) {
  const tokens: string[] = [];
  let current = "";
  let quoteCharacter = "";
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoteCharacter) {
      if (character === quoteCharacter) quoteCharacter = "";
      else if (character === "\\" && input[index + 1] === quoteCharacter) {
        current += input[index + 1];
        index += 1;
      } else current += character;
    } else if (character === '"' || character === "'") {
      quoteCharacter = character;
    } else if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else current += character;
  }
  if (quoteCharacter) throw new ConsoleCommandError("Unclosed quote.");
  if (current) tokens.push(current);
  if (tokens.some((token) => token.length > 160)) {
    throw new ConsoleCommandError("One argument is too long.");
  }
  return tokens;
}

function requestPlan(
  category: Exclude<ConsoleCategory, "system">,
  view: Exclude<ConsoleView, "help" | "status">,
  auth: "public" | "personal",
  path: string,
  parsed: ParsedInput,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {},
): ConsolePlan {
  return {
    kind: "request",
    category,
    view,
    auth,
    path: path.startsWith("/") ? path : `/api/v1/${path}`,
    method: options.method ?? "GET",
    ...(options.query
      ? {
          query: Object.fromEntries(
            Object.entries(options.query)
              .filter((entry): entry is [string, string | number] =>
                entry[1] !== undefined,
              )
              .map(([key, value]) => [key, String(value)]),
          ),
        }
      : {}),
    ...(options.body === undefined ? {} : { body: options.body }),
    json: parsed.json,
    terminalCommand: `magic-brain ${parsed.normalized}`,
  };
}

function requireShape(
  parsed: ParsedInput,
  allowedFlags: string[],
  exactWords?: number,
) {
  const allowed = new Set(["json", ...allowedFlags]);
  for (const name of parsed.flags.keys()) {
    if (!allowed.has(name)) {
      throw new ConsoleCommandError(`Unknown flag: --${name}`);
    }
  }
  if (exactWords !== undefined && parsed.words.length !== exactWords) {
    throw new ConsoleCommandError("Unexpected command arguments.");
  }
}

function optionalText(parsed: ParsedInput, name: string, maximum: number) {
  const value = parsed.flags.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new ConsoleCommandError(`--${name} must be 1–${maximum} characters.`);
  }
  return value.trim();
}

function requiredText(parsed: ParsedInput, name: string, maximum: number) {
  const value = optionalText(parsed, name, maximum);
  if (!value) throw new ConsoleCommandError(`--${name} is required.`);
  return value;
}

function integer(
  parsed: ParsedInput,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = parsed.flags.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ConsoleCommandError(
      `--${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

function number(
  parsed: ParsedInput,
  name: string,
  minimum: number,
  maximum: number,
) {
  const raw = requiredText(parsed, name, 30);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ConsoleCommandError(
      `--${name} must be from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

function date(parsed: ParsedInput, name: string) {
  return dateValue(requiredText(parsed, name, 10), name);
}

function dateValue(value: string | undefined, name: string) {
  const timestamp = value ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new ConsoleCommandError(`${name} must be YYYY-MM-DD.`);
  }
  return value;
}

function uuid(value: string | undefined, name: string) {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ConsoleCommandError(`${name} must be a UUID.`);
  }
  return value;
}

function commaSeparatedUuids(value: string | undefined, maximum: number) {
  const values = value?.split(",").filter(Boolean) ?? [];
  if (!values.length || values.length > maximum) {
    throw new ConsoleCommandError(`Provide 1–${maximum} comma-separated card IDs.`);
  }
  return [...new Set(values.map((item) => uuid(item, "card ID")))];
}

function quote(value: string) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}
