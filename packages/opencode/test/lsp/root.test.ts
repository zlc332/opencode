import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import type { InstanceContext } from "../../src/project/instance-context"
import * as LSPServer from "../../src/lsp/server"

function makeCtx(directory: string, worktree: string): InstanceContext {
  return {
    directory,
    worktree,
    project: {
      id: "test" as any,
      worktree,
      vcs: "git",
      name: "test",
      time: { created: 0, updated: 0 },
      sandboxes: [],
    },
  }
}

async function withTmpdir(fn: (dir: string) => Promise<void>) {
  const dir = path.join(os.tmpdir(), "opencode-test-nearestroot-" + Math.random().toString(36).slice(2))
  await fs.mkdir(dir, { recursive: true })
  try {
    await fn(await fs.realpath(dir))
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

describe("NearestRoot with worktree boundary", () => {
  test("finds marker in subdirectory when opened from repo root", async () => {
    await withTmpdir(async (dir) => {
      await fs.writeFile(path.join(dir, "bun.lock"), "")
      await fs.mkdir(path.join(dir, "packages"), { recursive: true })
      await fs.mkdir(path.join(dir, "packages", "app"), { recursive: true })
      const file = path.join(dir, "packages", "app", "src", "index.ts")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, "")

      const ctx = makeCtx(dir, dir)
      const root = await LSPServer.Typescript.root(file, ctx)
      expect(root).toBe(dir)
    })
  })

  test("searches above ctx.directory up to worktree when subdirectory is opened", async () => {
    await withTmpdir(async (dir) => {
      const subdir = path.join(dir, "packages", "app")
      await fs.mkdir(subdir, { recursive: true })
      await fs.writeFile(path.join(dir, "bun.lock"), "")
      const file = path.join(subdir, "src", "index.ts")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, "")

      const ctx = makeCtx(subdir, dir)
      const root = await LSPServer.Typescript.root(file, ctx)
      expect(root).toBe(dir)
    })
  })

  test("falls back to ctx.directory when no marker found within worktree", async () => {
    await withTmpdir(async (dir) => {
      const subdir = path.join(dir, "packages", "app")
      await fs.mkdir(subdir, { recursive: true })
      const file = path.join(subdir, "src", "index.ts")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, "")

      const ctx = makeCtx(subdir, dir)
      const root = await LSPServer.Typescript.root(file, ctx)
      expect(root).toBe(subdir)
    })
  })

  test("stops at worktree boundary and does not search above it", async () => {
    await withTmpdir(async (dir) => {
      const worktree = path.join(dir, "repo")
      const aboveWorktree = dir
      await fs.mkdir(worktree, { recursive: true })
      await fs.writeFile(path.join(aboveWorktree, "bun.lock"), "")

      const subdir = path.join(worktree, "src")
      await fs.mkdir(subdir, { recursive: true })
      const file = path.join(subdir, "index.ts")
      await fs.writeFile(file, "")

      const ctx = makeCtx(worktree, worktree)
      const root = await LSPServer.Typescript.root(file, ctx)
      expect(root).toBe(worktree)
    })
  })

  test("non-git project (worktree=/) uses ctx.directory as stop", async () => {
    await withTmpdir(async (dir) => {
      const subdir = path.join(dir, "packages", "app")
      await fs.mkdir(subdir, { recursive: true })
      const file = path.join(subdir, "src", "index.ts")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, "")

      const ctx = makeCtx(subdir, "/")
      const root = await LSPServer.Typescript.root(file, ctx)
      expect(root).toBe(subdir)
    })
  })

  test("Deno.root searches up to worktree boundary", async () => {
    await withTmpdir(async (dir) => {
      const subdir = path.join(dir, "packages", "deno-app")
      await fs.mkdir(subdir, { recursive: true })
      await fs.writeFile(path.join(dir, "deno.json"), "{}")
      const file = path.join(subdir, "src", "main.ts")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, "")

      const ctx = makeCtx(subdir, dir)
      const root = await LSPServer.Deno.root(file, ctx)
      expect(root).toBe(dir)
    })
  })

  test("Deno.root returns undefined when deno.json only exists above worktree", async () => {
    await withTmpdir(async (dir) => {
      const worktree = path.join(dir, "repo")
      await fs.mkdir(worktree, { recursive: true })
      await fs.writeFile(path.join(dir, "deno.json"), "{}")
      const file = path.join(worktree, "main.ts")
      await fs.writeFile(file, "")

      const ctx = makeCtx(worktree, worktree)
      const root = await LSPServer.Deno.root(file, ctx)
      expect(root).toBeUndefined()
    })
  })

  test("Gopls prefers go.work over go.mod across directory boundary", async () => {
    await withTmpdir(async (dir) => {
      const subdir = path.join(dir, "pkg", "mygo")
      await fs.mkdir(subdir, { recursive: true })
      await fs.writeFile(path.join(dir, "go.work"), "")
      await fs.writeFile(path.join(subdir, "go.mod"), "")
      const file = path.join(subdir, "main.go")
      await fs.writeFile(file, "")

      const ctx = makeCtx(subdir, dir)
      const root = await LSPServer.Gopls.root(file, ctx)
      expect(root).toBe(dir)
    })
  })

  test("NearestRoot with excludePatterns respects worktree boundary", async () => {
    await withTmpdir(async (dir) => {
      const subdir = path.join(dir, "packages", "ts-app")
      await fs.mkdir(subdir, { recursive: true })
      await fs.writeFile(path.join(dir, "bun.lock"), "")
      await fs.writeFile(path.join(subdir, "deno.json"), "{}")
      const file = path.join(subdir, "src", "index.ts")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, "")

      const ctx = makeCtx(subdir, dir)
      const root = await LSPServer.Typescript.root(file, ctx)
      expect(root).toBeUndefined()
    })
  })
})
