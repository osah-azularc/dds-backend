import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supportedExtensions = new Set([".js", ".mjs", ".cjs", ".json"]);
const importPattern = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/gm;

const collectJavaScriptFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : collectJavaScriptFiles(filePath);
    }
    return extname(entry.name) === ".js" ? [filePath] : [];
  });

const failures = [];

for (const filePath of collectJavaScriptFiles(rootDirectory)) {
  const source = readFileSync(filePath, "utf8");
  const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
  for (const match of sourceWithoutComments.matchAll(importPattern)) {
    const specifier = match[1];
    const line = source.slice(0, match.index).split("\n").length;
    const resolvedPath = resolve(dirname(filePath), specifier);

    if (!supportedExtensions.has(extname(specifier))) {
      failures.push(`${filePath}:${line} relative ESM import must include its file extension: ${specifier}`);
    } else if (!existsSync(resolvedPath)) {
      failures.push(`${filePath}:${line} relative ESM import does not resolve: ${specifier}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
