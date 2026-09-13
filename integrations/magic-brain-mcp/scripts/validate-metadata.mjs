import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const schemaUrl =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const [schemaResponse, metadataText] = await Promise.all([
  fetch(schemaUrl),
  readFile(new URL("../server.json", import.meta.url), "utf8"),
]);

if (!schemaResponse.ok) {
  throw new Error(
    `Could not fetch official MCP Registry schema: HTTP ${schemaResponse.status}`,
  );
}

const schema = await schemaResponse.json();
const metadata = JSON.parse(metadataText);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

if (!ajv.validate(schema, metadata)) {
  console.error(ajv.errorsText(ajv.errors, { separator: "\n" }));
  process.exitCode = 1;
} else {
  console.log("server.json matches the official 2025-12-11 schema");
}
