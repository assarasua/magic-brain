import type { Metadata } from "next";
import { DevelopersHub, type DeveloperEndpoint } from "./developers-hub";
import { publicApiOpenApi } from "@/lib/public-api/openapi";

export const metadata: Metadata = {
  title: "Developer Hub — Magic Brain",
  description:
    "Build with Magic Brain card, set, and EUR price data using the public v1 API.",
};

type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  parameters?: ReadonlyArray<{
    name?: string;
    in?: string;
    required?: boolean;
    description?: string;
    schema?: {
      type?: string;
      format?: string;
      maximum?: number;
      enum?: readonly string[];
      default?: string | number | boolean;
    };
  }>;
  security?: ReadonlyArray<Record<string, readonly string[]>>;
};

const endpoints = Object.entries(publicApiOpenApi.paths).flatMap(
  ([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => {
      const definition = operation as OpenApiOperation;
      return {
        method: method.toUpperCase(),
        path,
        operationId: definition.operationId ?? `${method}-${path}`,
        summary: definition.summary ?? "",
        parameters: (definition.parameters ?? []).map((parameter) => ({
          name: parameter.name ?? "id",
          location: parameter.in ?? "path",
          required: parameter.required ?? false,
          description: parameter.description,
          type:
            parameter.schema?.enum?.join(" | ") ??
            parameter.schema?.format ??
            parameter.schema?.type ??
            "string",
          constraint: parameter.schema?.maximum
            ? `max ${parameter.schema.maximum}`
            : parameter.schema?.default !== undefined
              ? `default ${String(parameter.schema.default)}`
              : undefined,
        })),
        auth: definition.security?.some((entry) => "CookieAuth" in entry)
          ? "session"
          : "optional-key",
      } satisfies DeveloperEndpoint;
    }),
);

export default function DevelopersPage() {
  return (
    <DevelopersHub
      endpoints={endpoints}
      apiVersion={publicApiOpenApi.info.version}
    />
  );
}
