// Entry point so `node --test P/tests/` works: Node 22 loads a directory argument as a
// module (this file) instead of scanning it, so this requires every *.test.js here.
// `node --test` with no arguments from P/ finds the *.test.js files directly and skips this file.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

for (const f of fs.readdirSync(__dirname).filter((n) => /\.test\.c?js$/.test(n)).sort()) {
  require(path.join(__dirname, f));
}
