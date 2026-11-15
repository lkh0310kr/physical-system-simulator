// schemas/*.schema.json 생성: pnpm schemas
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonSchemaFiles } from "../packages/core/src/index.ts";

const dir = join(import.meta.dirname, "../schemas");
mkdirSync(dir, { recursive: true });
for (const [name, schema] of Object.entries(jsonSchemaFiles())) {
  writeFileSync(join(dir, name), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`schemas/${name}`);
}
