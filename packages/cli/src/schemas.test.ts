import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonSchemaFiles } from "@physisim/core";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "../../../schemas");

describe("schemas/", () => {
  it.each(Object.entries(jsonSchemaFiles()))(
    "%s is up to date (run pnpm schemas)",
    (name, schema) => {
      expect(JSON.parse(readFileSync(join(dir, name), "utf8"))).toEqual(
        JSON.parse(JSON.stringify(schema)),
      );
    },
  );
});
