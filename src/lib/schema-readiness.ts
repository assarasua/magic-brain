import { createHmac, timingSafeEqual } from "node:crypto";

export type SchemaReadinessClaim = {
  commit: string;
  filename: string;
  checksum: string;
  expires: number;
};

export function schemaReadinessMessage(claim: SchemaReadinessClaim) {
  return [
    claim.commit,
    claim.filename,
    claim.checksum,
    String(claim.expires),
  ].join("\n");
}

export function signSchemaReadiness(
  secret: string,
  claim: SchemaReadinessClaim,
) {
  return createHmac("sha256", secret)
    .update(schemaReadinessMessage(claim))
    .digest("hex");
}

export function verifySchemaReadinessSignature(
  secret: string,
  claim: SchemaReadinessClaim,
  signature: string,
) {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signSchemaReadiness(secret, claim), "hex");
  const received = Buffer.from(signature, "hex");
  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}
