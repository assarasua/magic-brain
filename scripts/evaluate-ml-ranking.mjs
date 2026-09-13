import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATASET_CONTRACT_VERSION,
  MODEL_VERSION,
  RANKING_SEED,
  datasetVersion,
  evaluateWalkForward,
  promotionAssessment,
  sha256,
  trainFinalArtifact,
} from "./ml-ranking-core.mjs";
import { buildSyntheticRankingFixture } from "../test/fixtures/ml-ranking-synthetic.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const inputPath = argumentValue("--input");
const outputDirectory = path.resolve(
  repositoryRoot,
  argumentValue("--output-dir") ?? "artifacts/ml-ranking",
);
const rows = inputPath
  ? JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"))
  : buildSyntheticRankingFixture();
const datasetKind = inputPath ? "real" : "synthetic";
const versionedDataset = datasetVersion(rows);
const modelVersion = `${MODEL_VERSION}-${versionedDataset.slice(7, 19)}`;
const evaluation = evaluateWalkForward(rows, { seed: RANKING_SEED });
const evaluationCutoffDate = rows
  .map((row) => row.asOfDate)
  .sort()
  .at(-1);
const artifact = trainFinalArtifact(
  rows,
  evaluationCutoffDate,
  RANKING_SEED,
  modelVersion,
);
const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
const artifactFilename = `${modelVersion}.json`;
const artifactDigest = sha256(artifactText);
const metadata = {
  version: modelVersion,
  model_kind: "learning_to_rank",
  status: "draft",
  feature_contract_version: "v1",
  label_contract_version: "v1",
  training_cutoff_date: artifact.trainingCutoffDate,
  artifact_uri: path
    .relative(repositoryRoot, path.join(outputDirectory, artifactFilename))
    .split(path.sep)
    .join("/"),
  artifact_sha256: artifactDigest,
  ranking_policy: {
    target: "probability_return_30d_positive",
    tie_breaker: "scryfall_id_ascending",
    safety_constraints: [
      "offline_evaluation_only",
      "no_online_serving",
      "deterministic_fallback_required",
    ],
  },
};
const report = {
  schemaVersion: "ml-ranking-evaluation-v1",
  datasetContractVersion: DATASET_CONTRACT_VERSION,
  datasetVersion: versionedDataset,
  datasetKind,
  featureContractVersion: "v1",
  labelContractVersion: "v1",
  modelVersion,
  evaluation,
  promotion: promotionAssessment(evaluation, datasetKind),
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, artifactFilename), artifactText),
  writeFile(
    path.join(outputDirectory, `${modelVersion}.metadata.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
  ),
  writeFile(
    path.join(outputDirectory, `${modelVersion}.evaluation.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  ),
]);

console.log(
  JSON.stringify(
    {
      datasetKind,
      datasetVersion: report.datasetVersion,
      artifactSha256: artifactDigest,
      outputDirectory,
      aggregate: evaluation.aggregate,
      promotion: report.promotion,
    },
    null,
    2,
  ),
);
