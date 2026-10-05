/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../app/lib/room-link.ts"), "utf8");
const context = vm.createContext({ exports: {}, URL });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { safeReturnDestination, readRoomLinkText } = context.exports;

test("invite authentication preserves destinations and titles without external redirects", () => {
  assert.equal(safeReturnDestination("/room/ABC123"), "/room/ABC123");
  assert.equal(safeReturnDestination("/room/ABC123?action=create&title=Film+night"), "/room/ABC123?action=create&title=Film+night");
  assert.equal(safeReturnDestination("/dashboard/room?mode=create"), "/dashboard/room?mode=create");
  for (const value of [null, "https://evil.example/room/ABC123", "//evil.example", "/\\evil.example", "/room/ABC123\n", "/room/ABC123/../../settings", "javascript:alert(1)"]) {
    assert.equal(safeReturnDestination(value), "/dashboard");
  }
  assert.equal(readRoomLinkText("Movie night", "2"), "Movie night");
  assert.equal(readRoomLinkText("Movie%20night", null), "Movie night");
  assert.equal(readRoomLinkText("100% fun", "2"), "100% fun");
});
