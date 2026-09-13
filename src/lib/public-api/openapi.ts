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

export const publicApiOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "Magic Brain Data API",
    version: "1.0.0",
    description:
      "Public Magic card, set, and EUR price data. Price records always identify source, observation date, currency, and finish.",
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
      CookieAuth: { type: "apiKey", in: "cookie", name: "authjs.session-token" },
    },
    parameters: {
      CardId: {
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
      Error: errorSchema,
    },
  },
} as const;
