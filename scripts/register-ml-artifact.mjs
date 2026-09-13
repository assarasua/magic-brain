import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  verifyModelPackage,
  verifyPromotionEvaluation,
} from "./ml-serving-core.mjs";

const { Client } = pg;
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
};
const metadataArgument = argumentValue("--metadata");
if (!metadataArgument) throw new Error("--metadata is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const metadataPath = path.resolve(repositoryRoot, metadataArgument);
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const artifactPath = path.resolve(repositoryRoot, metadata.artifact_uri ?? "");
const artifactsRoot = path.resolve(repositoryRoot, "artifacts") + path.sep;
if (!artifactPath.startsWith(artifactsRoot)) {
  throw new Error("Artifact URI must stay inside the repository artifacts directory");
}
verifyModelPackage(await readFile(artifactPath), metadata, {
  requiredStatus: metadata.status,
});

const promoteReady = process.argv.includes("--promote-ready");
let status = "draft";
let promotionEvidence = {};
if (promoteReady) {
  const evaluationArgument = argumentValue("--evaluation");
  const approvedBy = argumentValue("--approved-by")?.trim();
  if (!evaluationArgument || !approvedBy) {
    throw new Error(
      "--promote-ready requires --evaluation and a non-empty --approved-by",
    );
  }
  const evaluationPath = path.resolve(repositoryRoot, evaluationArgument);
  if (!evaluationPath.startsWith(artifactsRoot)) {
    throw new Error("Evaluation must stay inside the repository artifacts directory");
  }
  const { sha256 } = verifyPromotionEvaluation(
    await readFile(evaluationPath),
    metadata.version,
  );
  status = "ready";
  promotionEvidence = {
    dataset_kind: "real",
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    evaluation_sha256: sha256,
    gates: {
      data_quality: "passed",
      offline_quality: "passed",
      safety: "passed",
    },
  };
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  const result = await client.query(
    `insert into app_ml_model_versions (
       version, model_kind, status, feature_contract_version,
       label_contract_version, training_cutoff_date, artifact_uri,
       artifact_sha256, ranking_policy, promotion_evidence, verified_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, now())
     on conflict (version) do update set
       status = case
         when app_ml_model_versions.status = 'ready' and excluded.status = 'draft'
           then app_ml_model_versions.status
         else excluded.status
       end,
       artifact_uri = excluded.artifact_uri,
       artifact_sha256 = excluded.artifact_sha256,
       ranking_policy = excluded.ranking_policy,
       promotion_evidence = case
         when app_ml_model_versions.status = 'ready' and excluded.status = 'draft'
           then app_ml_model_versions.promotion_evidence
         else excluded.promotion_evidence
       end,
       verified_at = excluded.verified_at
     where app_ml_model_versions.model_kind = excluded.model_kind
       and app_ml_model_versions.feature_contract_version = excluded.feature_contract_version
       and app_ml_model_versions.label_contract_version = excluded.label_contract_version
       and app_ml_model_versions.training_cutoff_date = excluded.training_cutoff_date`,
    [
      metadata.version,
      metadata.model_kind,
      status,
      metadata.feature_contract_version,
      metadata.label_contract_version,
      metadata.training_cutoff_date,
      metadata.artifact_uri,
      metadata.artifact_sha256,
      JSON.stringify(metadata.ranking_policy ?? {}),
      JSON.stringify(promotionEvidence),
    ],
  );
  if (result.rowCount !== 1) {
    throw new Error("Registry version exists with incompatible immutable contracts");
  }
  console.log(`Registered ${metadata.version} as ${status}.`);
} finally {
  await client.end();
}
