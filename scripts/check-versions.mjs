import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const tauriConfig = JSON.parse(
  await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const cargoToml = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = {
  "package.json": packageJson.version,
  "src-tauri/Cargo.toml": cargoVersion,
  "src-tauri/tauri.conf.json": tauriConfig.version,
};
const expected = packageJson.version;
const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);

if (mismatches.length) {
  for (const [file, version] of mismatches) {
    console.error(`${file} has version ${version ?? "<missing>"}; expected ${expected}.`);
  }
  process.exitCode = 1;
} else if (process.env.EXPECTED_TAG && process.env.EXPECTED_TAG !== `v${expected}`) {
  console.error(`Tag ${process.env.EXPECTED_TAG} does not match application version v${expected}.`);
  process.exitCode = 1;
} else {
  console.log(`All application versions match ${expected}.`);
}
