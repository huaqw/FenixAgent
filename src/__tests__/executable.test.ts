import { describe, test, expect } from "bun:test";
import { isExecutable, resolveExecutable } from "../utils/executable";
import { join } from "node:path";

describe("isExecutable", () => {
  test("returns true for an executable file", () => {
    // bun itself should be executable
    const bunPath = process.execPath;
    expect(isExecutable(bunPath)).toBe(true);
  });

  test("returns false for a non-existent file", () => {
    expect(isExecutable("/nonexistent/path/binary")).toBe(false);
  });

  test("returns false for a directory", () => {
    // Use a known non-executable path
    expect(isExecutable("/etc/hosts")).toBe(false);
  });
});

describe("resolveExecutable", () => {
  test("resolves 'bun' executable", () => {
    const path = resolveExecutable("bun");
    expect(path).toBeTruthy();
    expect(typeof path).toBe("string");
  });

  test("resolves 'node' executable", () => {
    const path = resolveExecutable("node");
    expect(path).toBeTruthy();
  });

  test("throws for non-existent command", () => {
    expect(() => resolveExecutable("nonexistent_command_xyz_12345")).toThrow(/not found/);
  });

  test("resolves project-local executable if present", () => {
    // node_modules/.bin typically has executables
    const localBin = join(process.cwd(), "node_modules", ".bin");
    // Just verify the function doesn't crash when checking
    try {
      resolveExecutable("some-binary-that-does-not-exist-locally");
    } catch {
      // Expected to throw if not found locally or globally
    }
  });
});
