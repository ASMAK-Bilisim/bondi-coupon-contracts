// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");

fs.rmSync(path.resolve(__dirname, "../vendor-artifacts"), {
  recursive: true,
  force: true,
});
