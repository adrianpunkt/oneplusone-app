#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const envFileNames = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
];

const cwd = process.cwd();
const suffix = `.opennext-production-deploy-${process.pid}.bak`;
const movedFiles = [];

function restoreEnvFiles() {
  for (const { backupPath, filePath } of movedFiles.toReversed()) {
    if (existsSync(backupPath)) {
      renameSync(backupPath, filePath);
    }
  }
}

try {
  for (const fileName of envFileNames) {
    const filePath = join(cwd, fileName);
    const backupPath = `${filePath}${suffix}`;

    if (!existsSync(filePath)) continue;
    if (existsSync(backupPath)) {
      throw new Error(`Refusing to overwrite existing deploy backup: ${backupPath}`);
    }

    renameSync(filePath, backupPath);
    movedFiles.push({ backupPath, filePath });
  }

  const result = spawnSync(
    "npx",
    ["opennextjs-cloudflare", "build", ...process.argv.slice(2)],
    {
      env: { ...process.env, NEXTJS_ENV: "cloudflare" },
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    const deployResult = spawnSync(
      "npx",
      ["opennextjs-cloudflare", "deploy", ...process.argv.slice(2)],
      {
        env: { ...process.env, NEXTJS_ENV: "cloudflare" },
        stdio: "inherit",
      },
    );

    process.exitCode = deployResult.status || 0;
  }
} finally {
  restoreEnvFiles();
}
