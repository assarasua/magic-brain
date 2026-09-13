const errorSchema = {
  type: "object",
  required: ["error", "meta"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: { type: "object", additionalProperties: true },
      },
    },
    meta: {
      type: "object",
      required: ["requestId"],
      properties: { requestId: { type: "string", format: "uuid" } },
    },
  },
} as const;

const commonErrors = {
  "400": {
    description: "Invalid request",
    content: { "application/json": { schema: errorSchema } },
  },
  "401": {
    description: "Invalid API key",
    content: { "application/json": { schema: errorSchema } },
  },
  "403": {
    description: "API key lacks a required scope",
    content: { "application/json": { schema: errorSchema } },
  },
  "429": {
    description: "Rate limit exceeded",
    content: { "application/json": { schema: errorSchema } },
  },
  "500": {
    description: "Internal error",
    content: { "application/json": { schema: errorSchema } },
  },
  "503": {
    description: "Rate limiter unavailable",
    content: { "application/json": { schema: errorSchema } },
  },
} as const;

const cursorParameters = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: "cursor",
    in: "query",
    description: "Opaque cursor returned by the previous response",
    schema: { type: "string" },
  },
] as const;

function mutationOperation(
  operationId: string,
  summary: string,
  scopes: string[],
  schema: Record<string, unknown>,
) {
  return {
    operationId,
    summary,
    security: [{ OAuth2: scopes }, { ApiKey: scopes }],
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 8, maxLength: 128 },
      },
    ],
    requestBody: {
      required: true,
      content: { "application/json": { schema } },
    },
    responses: {
      "200": { description: "Mutation completed or safely replayed" },
      "409": { description: "Conflict or idempotency key reuse" },
      ...commonErrors,
    },
  };
}

export const publicApiOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "Magic Brain Data API",
    version: "1.3.0",
    description:
      "Versioned Magic card, market, prediction, graph, and account-scoped portfolio intelligence. ML output identifies verified model serving versus deterministic fallback; no request performs training.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ ApiKey: [] }, {}],
  paths: {
    "/cards": {
      get: {
        operationId: "listCards",
        summary: "List cards",
        parameters: [
          ...cursorParameters,
          { name: "q", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "set", in: "query", schema: { type: "string", maxLength: 20 } },
          { name: "rarity", in: "query", schema: { type: "string", maxLength: 20 } },
          { name: "language", in: "query", schema: { type: "string", maxLength: 10 } },
        ],
        responses: {
          "200": {
            description: "A cursor-paginated card collection",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CardCollection" },
              },
            },
          },
          ...commonErrors,
        },
      },
    },
    "/cards/{id}": {
      get: {
        operationId: "getCard",
        summary: "Get one printing",
        parameters: [{ $ref: "#/components/parameters/CardId" }],
        responses: {
          "200": { description: "Card and latest prices" },
          "404": { description: "Card not found" },
          ...commonErrors,
        },
      },
    },
    "/cards/{id}/prices": {
      get: {
        operationId: "getCardPrices",
        summary: "Get card price history",
        parameters: [
          { $ref: "#/components/parameters/CardId" },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          {
            name: "finish",
            in: "query",
            schema: { type: "string", enum: ["all", "nonfoil", "foil"], default: "all" },
          },
        ],
        responses: {
          "200": { description: "At most 366 days of price observations" },
          "404": { description: "Card not found" },
          ...commonErrors,
        },
      },
    },
    "/prices/latest": {
      post: {
        operationId: "getLatestPrices",
        summary: "Get latest prices for up to 100 cards",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["cardIds"],
                properties: {
                  cardIds: {
                    type: "array",
                    minItems: 1,
                    maxItems: 100,
                    items: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Latest prices" }, ...commonErrors },
      },
    },
    "/sets": {
      get: {
        operationId: "listSets",
        summary: "List sets",
        parameters: [
          ...cursorParameters,
          { name: "q", in: "query", schema: { type: "string", maxLength: 80 } },
          { name: "tabletop", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": { description: "A cursor-paginated set collection" },
          ...commonErrors,
        },
      },
    },
    "/latest-set/opportunities": {
      get: {
        operationId: "getLatestSetOpportunities",
        summary: "Rank bounded latest-set research opportunities",
        parameters: [
          { name: "set", in: "query", schema: { type: "string", maxLength: 8 } },
          {
            name: "minimum_confidence",
            in: "query",
            schema: { type: "number", minimum: 0, maximum: 1, default: 0 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 25, default: 10 },
          },
        ],
        responses: {
          "200": {
            description:
              "Research signals with source, observation date, currency, and finish",
          },
          "404": { description: "No eligible set found" },
          ...commonErrors,
        },
      },
    },
    "/ml/opportunities": {
      get: {
        operationId: "getPersonalizedMlOpportunities",
        summary: "Get personalized ML opportunities or truthful fallback",
        security: [
          { OAuth2: ["profile:read"] },
          { ApiKey: ["profile:read"] },
        ],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 25, default: 10 },
          },
        ],
        responses: {
          "200": {
            description:
              "Personalized signals with model-versus-fallback source, confidence, freshness, drivers, provenance, and safety metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MlOpportunitiesEnvelope" },
              },
            },
          },
          ...commonErrors,
        },
      },
    },
    "/opportunity-graph": {
      get: {
        operationId: "searchOpportunityGraph",
        summary: "Search opportunity nodes and weighted neighbours",
        parameters: [
          {
            name: "q",
            in: "query",
            schema: { type: "string", minLength: 2, maxLength: 100 },
          },
          {
            name: "focus",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 12, maximum: 80, default: 48 },
          },
        ],
        responses: {
          "200": {
            description:
              "Deterministic graph nodes, similarities, neighbour reasons, clusters, data date, and methodology",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpportunityGraphEnvelope" },
              },
            },
          },
          ...commonErrors,
        },
      },
    },
    "/predict/set": {
      get: {
        operationId: "predictSetGrowth",
        summary: "Calculate a transparent set-growth scenario",
        parameters: [
          { name: "set", in: "query", schema: { type: "string", maxLength: 8 } },
          {
            name: "target",
            in: "query",
            schema: {
              type: "string",
              enum: ["inflation", "sp500", "extreme"],
              default: "sp500",
            },
          },
          {
            name: "horizon",
            in: "query",
            schema: { type: "integer", enum: [12, 24, 36], default: 24 },
          },
          ...["demand", "scarcity", "reprints"].map((name) => ({
            name,
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 5, default: 3 },
          })),
        ],
        responses: {
          "200": {
            description:
              "Set scenario, observed evidence, bounded card predictions, and methodology",
          },
          "404": { description: "No eligible set found" },
          ...commonErrors,
        },
      },
    },
    "/predict/portfolio": {
      post: {
        operationId: "buildPredictPortfolioScenario",
        summary: "Build a read-only set portfolio scenario",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["setCode", "budget", "risk"],
                properties: {
                  setCode: { type: "string", minLength: 2, maxLength: 8 },
                  budget: { type: "number", minimum: 25, maximum: 1_000_000 },
                  risk: {
                    type: "string",
                    enum: [
                      "preservation",
                      "conservative",
                      "balanced",
                      "growth",
                      "aggressive",
                    ],
                  },
                  maxPositions: {
                    type: "integer",
                    minimum: 1,
                    maximum: 20,
                    default: 8,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Unsaved model allocation derived from observed set opportunities",
          },
          "404": { description: "No eligible priced opportunities found" },
          ...commonErrors,
        },
      },
    },
    "/predict/recommendation": {
      get: {
        operationId: "getPredictRecommendation",
        summary: "Get a recommendation derived from account preferences",
        security: [
          { OAuth2: ["profile:read"] },
          { ApiKey: ["profile:read"] },
        ],
        responses: {
          "200": {
            description:
              "Personalized bounded Predict defaults and scenario safety metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PredictRecommendationEnvelope" },
              },
            },
          },
          ...commonErrors,
        },
      },
    },
    "/portfolio": {
      get: {
        operationId: "getPortfolioIntelligence",
        summary: "Get owned portfolio P&L, concentration, and forecasts",
        security: [
          { OAuth2: ["portfolio:read", "profile:read"] },
          { ApiKey: ["portfolio:read", "profile:read"] },
        ],
        parameters: [
          {
            name: "list",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Owned list ID; defaults to the default list",
          },
        ],
        responses: {
          "200": {
            description:
              "Owned holdings, unrealized P&L, contributors, concentration, intelligence mode, and 1Y/3Y/5Y forecast points",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PortfolioIntelligenceEnvelope" },
              },
            },
          },
          ...commonErrors,
        },
      },
    },
    "/alerts": {
      get: {
        operationId: "listAlerts",
        summary: "List owned watchlist alerts",
        security: [
          { OAuth2: ["alerts:manage"] },
          { ApiKey: ["alerts:manage"] },
        ],
        responses: { "200": { description: "Owned watchlist and alert state" }, ...commonErrors },
      },
      post: mutationOperation(
        "upsertAlert",
        "Add or update an owned watchlist alert",
        ["alerts:manage"],
        { type: "object", required: ["cardId", "confirm"], properties: {
          cardId: { type: "string", format: "uuid" },
          targetPrice: { type: ["number", "null"], minimum: 0 },
          alertBelowEnabled: { type: "boolean" },
          alertAbovePrice: { type: ["number", "null"], minimum: 0 },
          alertAboveEnabled: { type: "boolean" },
          confirm: { type: "boolean", const: true },
        }, additionalProperties: false },
      ),
      patch: mutationOperation(
        "updateAlertState",
        "Dismiss or reset an owned alert state",
        ["alerts:manage"],
        { type: "object", required: ["cardId", "direction", "action", "confirm"], properties: {
          cardId: { type: "string", format: "uuid" },
          direction: { type: "string", enum: ["below", "above"] },
          action: { type: "string", enum: ["dismiss", "reset"] },
          confirm: { type: "boolean", const: true },
        }, additionalProperties: false },
      ),
      delete: mutationOperation(
        "deleteAlert",
        "Remove an owned watchlist alert",
        ["alerts:manage"],
        { type: "object", required: ["cardId", "confirm"], properties: {
          cardId: { type: "string", format: "uuid" },
          confirm: { type: "boolean", const: true },
        }, additionalProperties: false },
      ),
    },
    "/portfolio/lists": {
      get: {
        operationId: "listPortfolioLists",
        summary: "List owned portfolio lists",
        security: [
          { OAuth2: ["lists:read"] },
          { ApiKey: ["lists:read"] },
        ],
        responses: { "200": { description: "Owned list metadata and holding counts" }, ...commonErrors },
      },
      post: mutationOperation(
        "createPortfolioList",
        "Create an owned portfolio list",
        ["lists:write"],
        {
          type: "object",
          additionalProperties: false,
          required: ["name", "confirm"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            confirm: { type: "boolean", const: true },
          },
        },
      ),
      patch: mutationOperation(
        "reorderPortfolioLists",
        "Reorder all owned portfolio lists",
        ["lists:write"],
        {
          type: "object",
          additionalProperties: false,
          required: ["orderedIds", "confirm"],
          properties: {
            orderedIds: {
              type: "array",
              minItems: 1,
              maxItems: 50,
              uniqueItems: true,
              items: { type: "string", format: "uuid" },
            },
            confirm: { type: "boolean", const: true },
          },
        },
      ),
    },
    "/portfolio/lists/{id}": {
      get: {
        operationId: "getPortfolioList",
        summary: "Get owned list holdings, P&L, and forecast",
        security: [
          { OAuth2: ["lists:read", "portfolio:read", "profile:read"] },
          { ApiKey: ["lists:read", "portfolio:read", "profile:read"] },
        ],
        parameters: [{ $ref: "#/components/parameters/ListId" }],
        responses: { "200": { description: "Owned list intelligence" }, ...commonErrors },
      },
      patch: {
        ...mutationOperation(
          "renamePortfolioList",
          "Rename an owned portfolio list",
          ["lists:write"],
          {
            type: "object",
            additionalProperties: false,
            required: ["name", "confirm"],
            properties: {
              name: { type: "string", minLength: 1, maxLength: 80 },
              confirm: { type: "boolean", const: true },
            },
          },
        ),
        parameters: [{ $ref: "#/components/parameters/ListId" }],
      },
      delete: {
        ...mutationOperation(
          "deletePortfolioList",
          "Delete an owned non-default list",
          ["lists:write"],
          {
            type: "object",
            additionalProperties: false,
            required: ["confirm"],
            properties: {
              destinationListId: { type: "string", format: "uuid" },
              confirm: { type: "boolean", const: true },
            },
          },
        ),
        parameters: [{ $ref: "#/components/parameters/ListId" }],
      },
    },
    "/portfolio/bulk": {
      post: mutationOperation(
        "bulkManagePortfolio",
        "Move, copy, or delete up to 200 owned holdings",
        ["portfolio:write", "lists:write"],
        {
          type: "object",
          additionalProperties: false,
          required: ["action", "holdingIds", "sourceListId", "confirm"],
          properties: {
            action: { type: "string", enum: ["move", "copy", "delete"] },
            holdingIds: {
              type: "array",
              minItems: 1,
              maxItems: 200,
              uniqueItems: true,
              items: { type: "integer", minimum: 1 },
            },
            sourceListId: { type: "string", format: "uuid" },
            destinationListId: { type: "string", format: "uuid" },
            confirm: { type: "boolean", const: true },
          },
        },
      ),
    },
    "/portfolio/lists/{id}/shares": {
      get: {
        operationId: "listPortfolioShares",
        summary: "List share-link metadata for an owned list",
        security: [
          { OAuth2: ["shares:manage"] },
          { ApiKey: ["shares:manage"] },
        ],
        parameters: [{ $ref: "#/components/parameters/ListId" }],
        responses: { "200": { description: "At most 20 share metadata records; no tokens" }, ...commonErrors },
      },
      post: {
        ...mutationOperation(
          "createPortfolioShare",
          "Create a 24-hour public share link and revoke the previous active link",
          ["shares:manage"],
          {
            type: "object",
            additionalProperties: false,
            required: ["confirm"],
            properties: { confirm: { type: "boolean", const: true } },
          },
        ),
        parameters: [{ $ref: "#/components/parameters/ListId" }],
      },
    },
    "/portfolio/lists/{id}/shares/{shareId}": {
      delete: {
        ...mutationOperation(
          "revokePortfolioShare",
          "Revoke an owned portfolio share",
          ["shares:manage"],
          {
            type: "object",
            additionalProperties: false,
            required: ["confirm"],
            properties: { confirm: { type: "boolean", const: true } },
          },
        ),
        parameters: [
          { $ref: "#/components/parameters/ListId" },
          {
            name: "shareId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
      },
    },
    "/shared/portfolio/{token}": {
      get: {
        operationId: "getPublicPortfolioShare",
        summary: "Read a valid 24-hour public portfolio share",
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 20, maxLength: 200 },
          },
        ],
        responses: {
          "200": {
            description:
              "List name, quantities, public market values, and summary; never owner identity, email, purchase price, or cost basis",
          },
          ...commonErrors,
        },
      },
    },
    "/news": {
      get: {
        operationId: "listMarketBriefs",
        summary: "List immutable price-derived market briefs",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 30, default: 10 },
          },
        ],
        responses: {
          "200": {
            description:
              "A bounded reverse-chronological archive of market brief summaries",
          },
          ...commonErrors,
        },
      },
    },
    "/news/latest": {
      get: {
        operationId: "getLatestMarketBrief",
        summary: "Get the latest immutable price-derived market brief",
        responses: {
          "200": {
            description:
              "Latest full brief with coverage, breadth, categories, and caveats",
          },
          "404": { description: "No market brief is available" },
          ...commonErrors,
        },
      },
    },
    "/news/{date}": {
      get: {
        operationId: "getMarketBriefByDate",
        summary: "Get an archived market brief by market-data date",
        parameters: [
          {
            name: "date",
            in: "path",
            required: true,
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          "200": {
            description:
              "Immutable full brief for the requested market-data date",
          },
          "404": { description: "Market brief not found" },
          ...commonErrors,
        },
      },
    },
    "/api-keys": {
      get: {
        operationId: "listApiKeys",
        summary: "List keys owned by the signed-in user",
        security: [{ CookieAuth: [] }],
        responses: { "200": { description: "API key metadata; secrets are omitted" } },
      },
      post: {
        operationId: "createApiKey",
        summary: "Create an API key",
        security: [{ CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 80 },
                  scopes: {
                    type: "array",
                    uniqueItems: true,
                    items: {
                      type: "string",
                      enum: [
                        "data:read",
                        "portfolio:read",
                        "portfolio:write",
                        "lists:read",
                        "lists:write",
                        "alerts:manage",
                        "shares:manage",
                        "profile:read",
                      ],
                    },
                    default: ["data:read"],
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "The secret is returned once" } },
      },
    },
    "/api-keys/{id}": {
      delete: {
        operationId: "revokeApiKey",
        summary: "Revoke an owned API key",
        security: [{ CookieAuth: [] }],
        responses: { "200": { description: "Key revoked" } },
      },
    },
    "/openapi.json": {
      get: {
        operationId: "getOpenApi",
        summary: "Get this OpenAPI document",
        responses: { "200": { description: "OpenAPI 3.1 document" } },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKey: { type: "http", scheme: "bearer", bearerFormat: "Magic Brain API key" },
      OAuth2: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "/oauth/authorize",
            tokenUrl: "/oauth/token",
            refreshUrl: "/oauth/token",
            scopes: {
              "public:read": "Read public research data",
              "portfolio:read": "Read owned portfolio data and analytics",
              "portfolio:write": "Change owned portfolio holdings",
              "lists:read": "Read owned portfolio lists",
              "lists:write": "Manage owned portfolio lists",
              "alerts:manage": "Manage owned alerts",
              "shares:manage": "Create and revoke owned share links",
              "profile:read": "Read preferences for personalization",
            },
          },
        },
      },
      CookieAuth: { type: "apiKey", in: "cookie", name: "authjs.session-token" },
    },
    parameters: {
      CardId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      ListId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      Price: {
        type: "object",
        required: ["amount", "currency", "finish", "source", "observedAt"],
        properties: {
          amount: { type: "number", minimum: 0 },
          currency: { type: "string", const: "EUR" },
          finish: { type: "string", enum: ["nonfoil", "foil"] },
          source: { type: "string" },
          observedAt: { type: "string", format: "date" },
        },
      },
      CardCollection: {
        type: "object",
        required: ["data", "meta"],
        properties: {
          data: { type: "array", items: { type: "object" } },
          meta: { type: "object" },
        },
      },
      MlRanking: {
        type: "object",
        required: ["source", "reason", "modelVersion", "scoreDate"],
        properties: {
          source: { type: "string", enum: ["ml_batch", "deterministic"] },
          reason: {
            type: ["string", "null"],
            enum: [
              "experiment_off",
              "outside_cohort",
              "scores_missing_or_stale",
              null,
            ],
          },
          modelVersion: { type: ["string", "null"] },
          scoreDate: { type: ["string", "null"], format: "date" },
          scoreGeneratedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      MlOpportunitiesEnvelope: {
        type: "object",
        required: ["data", "meta"],
        properties: {
          data: {
            type: "object",
            required: ["generatedAt", "asOf", "signals", "ranking", "safety"],
            properties: {
              generatedAt: { type: "string", format: "date-time" },
              asOf: { type: ["string", "null"], format: "date" },
              signals: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "name", "priceDate", "ml"],
                  properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    priceDate: { type: "string", format: "date" },
                    ml: {
                      type: ["object", "null"],
                      description:
                        "Present only for eligible fresh scores from a verified promoted real-data model",
                    },
                  },
                },
              },
              ranking: { $ref: "#/components/schemas/MlRanking" },
              safety: { $ref: "#/components/schemas/SafetyMetadata" },
            },
          },
          meta: { type: "object" },
        },
      },
      SafetyMetadata: {
        type: "object",
        required: [
          "method",
          "financialAdvice",
          "probabilityOfProfit",
          "requestTimeTraining",
          "privateModelInternalsIncluded",
          "operatorEvaluationDataIncluded",
        ],
        properties: {
          method: { type: "string" },
          financialAdvice: { type: "boolean", const: false },
          probabilityOfProfit: { type: "boolean", const: false },
          requestTimeTraining: { type: "boolean", const: false },
          privateModelInternalsIncluded: { type: "boolean", const: false },
          operatorEvaluationDataIncluded: { type: "boolean", const: false },
        },
      },
      OpportunityGraphEnvelope: {
        type: "object",
        required: ["data", "meta"],
        properties: {
          data: {
            type: "object",
            required: ["nodes", "links", "clusters", "focusId", "asOf", "methodology"],
            properties: {
              nodes: { type: "array", items: { type: "object" } },
              links: {
                type: "array",
                items: {
                  type: "object",
                  required: ["source", "target", "similarity", "reasons"],
                  properties: {
                    source: { type: "string", format: "uuid" },
                    target: { type: "string", format: "uuid" },
                    similarity: { type: "number", minimum: 0, maximum: 100 },
                    reasons: { type: "array", items: { type: "string" } },
                  },
                },
              },
              clusters: { type: "array", items: { type: "object" } },
              focusId: { type: ["string", "null"], format: "uuid" },
              asOf: { type: ["string", "null"], format: "date" },
              methodology: { type: "object" },
            },
          },
          meta: { type: "object" },
        },
      },
      PredictRecommendationEnvelope: {
        type: "object",
        required: ["data", "meta"],
        properties: {
          data: {
            type: "object",
            required: ["recommendation", "provenance", "asOf", "safety"],
            properties: {
              recommendation: { type: "object" },
              provenance: {
                type: "string",
                const: "derived_from_authenticated_user_preferences",
              },
              asOf: { type: "string", format: "date-time" },
              safety: { type: "object" },
            },
          },
          meta: { type: "object" },
        },
      },
      PortfolioIntelligenceEnvelope: {
        type: "object",
        required: ["data", "meta"],
        properties: {
          data: {
            type: "object",
            required: [
              "asOf",
              "currency",
              "summary",
              "contributors",
              "concentration",
              "holdings",
              "forecast",
              "intelligence",
              "safety",
            ],
            properties: {
              asOf: { type: ["string", "null"], format: "date" },
              currency: { type: "string", const: "EUR" },
              summary: { type: "object" },
              contributors: { type: "object" },
              concentration: { type: "object" },
              holdings: { type: "array", items: { type: "object" } },
              history: { type: "array", items: { type: "object" } },
              forecast: {
                type: "object",
                description:
                  "Includes bounded monthly points plus horizons.1y, horizons.3y, and horizons.5y",
              },
              intelligence: { type: "object" },
              safety: { type: "object" },
            },
          },
          meta: { type: "object" },
        },
      },
      Error: errorSchema,
    },
  },
} as const;
