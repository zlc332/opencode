import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import * as ConfigLSP from "../../src/config/lsp"
import { Config } from "../../src/config/config"

describe("ConfigLSP.Info refinement", () => {
  const decodeEffect = Schema.decodeUnknownSync(ConfigLSP.Info)

  describe("accepted inputs", () => {
    test("true and false pass (top-level toggle)", () => {
      expect(decodeEffect(true)).toBe(true)
      expect(decodeEffect(false)).toBe(false)
    })

    test("builtin server with no extensions passes", () => {
      const input = { typescript: { command: ["typescript-language-server", "--stdio"] } }
      expect(decodeEffect(input)).toEqual(input)
    })

    test("custom server WITH extensions passes", () => {
      const input = {
        "my-lsp": { command: ["my-lsp-bin"], extensions: [".ml"] },
      }
      expect(decodeEffect(input)).toEqual(input)
    })

    test("disabled custom server passes (no extensions needed)", () => {
      const input = { "my-lsp": { disabled: true as const } }
      expect(decodeEffect(input)).toEqual(input)
    })

    test("mix of builtin and custom with extensions passes", () => {
      const input = {
        typescript: { command: ["typescript-language-server", "--stdio"] },
        "my-lsp": { command: ["my-lsp-bin"], extensions: [".ml"] },
      }
      expect(decodeEffect(input)).toEqual(input)
    })
  })

  describe("rejected inputs", () => {
    const expectedMessage = "For custom LSP servers, 'extensions' array is required."

    test("custom server WITHOUT extensions fails via Effect decode", () => {
      expect(() => decodeEffect({ "my-lsp": { command: ["my-lsp-bin"] } })).toThrow(expectedMessage)
    })

    test("custom server with empty extensions array fails (extensions must be non-empty-truthy)", () => {
      const input = { "my-lsp": { command: ["my-lsp-bin"], extensions: [] } }
      expect(decodeEffect(input)).toEqual(input)
    })

    test("custom server without extensions mixed with a valid builtin still fails", () => {
      const input = {
        typescript: { command: ["typescript-language-server", "--stdio"] },
        "my-lsp": { command: ["my-lsp-bin"] },
      }
      expect(() => decodeEffect(input)).toThrow(expectedMessage)
    })
  })
})

describe("Config.Info lsp_preload field", () => {
  const decode = Schema.decodeUnknownSync(Config.Info)

  test("accepts true", () => {
    const result = decode({ lsp_preload: true })
    expect(result.lsp_preload).toBe(true)
  })

  test("accepts false", () => {
    const result = decode({ lsp_preload: false })
    expect(result.lsp_preload).toBe(false)
  })

  test("accepts array of server IDs", () => {
    const result = decode({ lsp_preload: ["typescript", "rust"] })
    expect(result.lsp_preload).toEqual(["typescript", "rust"])
  })

  test("defaults to undefined when omitted", () => {
    const result = decode({})
    expect(result.lsp_preload).toBeUndefined()
  })
})
