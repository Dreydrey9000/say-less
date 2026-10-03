import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))
  .version as string;
const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const script = workflow
  .split("script: |")[1]
  .split("\n  publish-tauri:")[0]
  .split("\n")
  .map((line) => line.slice(12))
  .join("\n")
  .replaceAll("${{ steps.get-version.outputs.version }}", version);
const run = new Function(
  "github",
  "context",
  `return (async () => {${script}})();`,
) as (github: unknown, context: unknown) => Promise<number>;

async function prepare(reuse: string | undefined, existing: object) {
  const writes: Array<Record<string, unknown>> = [];
  const context = {
    repo: { owner: "test-owner", repo: "test-repo" },
    sha: "verified-source",
    payload: { inputs: { "empty-draft-id": reuse } },
  };
  const github = {
    rest: {
      repos: {
        getRelease: async () => ({ data: existing }),
        createRelease: async (args: Record<string, unknown>) => {
          writes.push(args);
          return { data: { id: 7 } };
        },
        updateRelease: async (args: Record<string, unknown>) => {
          writes.push(args);
          return { data: { id: 7 } };
        },
      },
    },
  };
  const result = run(github, context);
  return { result, writes };
}

test("new release drafts point at the source being built", async () => {
  const { result, writes } = await prepare(undefined, {});
  expect(await result).toBe(7);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    draft: true,
    tag_name: `v${version}`,
    target_commitish: "verified-source",
  });
});

test("a cancelled build can reuse an empty private draft of this version", async () => {
  const { result, writes } = await prepare("7", {
    draft: true,
    assets: [],
    tag_name: `v${version}`,
  });
  expect(await result).toBe(7);
  expect(writes).toEqual([
    {
      owner: "test-owner",
      repo: "test-repo",
      release_id: 7,
      target_commitish: "verified-source",
    },
  ]);
});

for (const [name, existing] of [
  ["published", { draft: false, assets: [], tag_name: `v${version}` }],
  ["partially built", { draft: true, assets: [{}], tag_name: `v${version}` }],
  ["other version", { draft: true, assets: [], tag_name: "v0.0.0" }],
] as const) {
  test(`reuse refuses a ${name} release before writing`, async () => {
    const { result, writes } = await prepare("7", existing);
    await expect(result).rejects.toThrow("Only an empty private draft");
    expect(writes).toEqual([]);
  });
}

test("reuse rejects an invalid ID before writing", async () => {
  const { result, writes } = await prepare("bad-id", {});
  await expect(result).rejects.toThrow("Invalid draft ID");
  expect(writes).toEqual([]);
});
