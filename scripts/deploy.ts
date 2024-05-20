import { deploySystem } from "./deploySystem";

async function deploy() {
  await deploySystem();
}

deploy().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
