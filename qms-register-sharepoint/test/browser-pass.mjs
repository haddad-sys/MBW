/* End-to-end pass over the register page against a stubbed Microsoft Graph.

   Playwright is not a dependency of this folder — install it, then run:

     npm install --no-save playwright
     node test/browser-pass.mjs

   The page is served from a throwaway localhost server (a secure context, so
   the sign-in crypto is available) and window.fetch is replaced with an
   in-memory Graph that models the workbook: a header row, data rows, and the
   range arithmetic the page uses to address them. Everything the page does to
   the workbook is asserted against that model. */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pageFile = join(here, "..", "index.html");

let failed = 0;
function ok(label, condition, extra) {
  if (condition) console.log("  ✓ " + label);
  else { failed++; console.log("  ✗ " + label + (extra ? " — " + extra : "")); }
}
function section(name) { console.log("\n" + name); }

async function formError(page) {
  await page.waitForSelector("#form-error:not(.hidden)", { timeout: 10000 });
  return page.locator("#form-error").innerText();
}

/* ---------------------------------------------------------------- mock graph */
/* Runs inside the page. Mirrors the subset of the Excel REST API the page uses. */
function installMock() {
  const HEADERS = ["Doc No", "Title", "Type", "Function", "Process", "Owner", "Rev",
    "Status", "Issue Date", "Next Review", "Location", "Language", "Parent Doc",
    "ISO 9001 Clauses", "Notes"];

  const pad = (row) => HEADERS.map((_, i) => (row[i] === undefined ? "" : row[i]));

  const model = {
    headers: HEADERS,
    rows: [
      pad(["QMS-PO-001", "Quality Policy", "PO", "Quality Assurance",
        "Management System Governance", "Chief Executive Officer", "3", "Approved",
        "2025-01-15", "2028-01-15", "/sites/QMS/Controlled/Policies", "Bilingual",
        "", "5.2", "seed"]),
      pad(["QMS-PR-004", "Control of Documented Information", "PR", "Quality Assurance",
        "Document Control", "Quality Assurance Manager", "2", "Approved",
        "2025-03-02", "2027-03-02", "/sites/QMS/Controlled/Procedures", "EN",
        "QMS-MN-001", "7.5.2, 7.5.3", "seed"]),
      pad(["QMS-PR-011", "Management of Change", "PR", "Operations",
        "Operational Planning and Control", "Operations Manager", "—", "Planned",
        "", "", "", "EN", "QMS-MN-001", "8.1, 8.5.6", "seed"]),
    ],
    calls: [],
    sessionHeaderSeen: false,
  };
  window.__mock = model;

  const colLetter = (n) => {
    let s = "";
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
    return s;
  };
  const lastCol = () => colLetter(HEADERS.length);
  /* Table starts at A1, so data row i sits on sheet row i + 2. */
  const sheetRowToIndex = (row) => row - 2;

  const json = (body) => new Response(JSON.stringify(body),
    { status: 200, headers: { "Content-Type": "application/json" } });
  const fail = (status, code, message) => new Response(
    JSON.stringify({ error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } });

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const opts = init || {};
    const method = (opts.method || "GET").toUpperCase();
    const path = url.replace("https://graph.microsoft.com/v1.0", "");
    const body = opts.body ? JSON.parse(opts.body) : null;
    model.calls.push({ method, path });
    if (opts.headers && opts.headers["workbook-session-id"]) model.sessionHeaderSeen = true;

    if (path === "/me" || path.startsWith("/me?")) {
      return json({ displayName: "Test User", userPrincipalName: "test@contoso.com" });
    }
    if (path.startsWith("/sites/contoso.sharepoint.com:")) return json({ id: "SITE" });
    if (path.startsWith("/sites/SITE/drive/root:/")) {
      return json({ id: "ITEM", name: "QMS-Document-Register.xlsx",
        webUrl: "https://contoso.sharepoint.com/x.xlsx" });
    }
    if (path.endsWith("/workbook/createSession")) return json({ id: "SESSION-1" });

    if (path.includes("worksheets('Lists')")) {
      return json({ values: [
        ["Type", "Status", "Language", "Function"],
        ["PO", "Approved", "EN", "Quality Assurance"],
        ["MN", "In Review", "AR", "Operations"],
        ["PR", "In Development", "Bilingual", "HSSE"],
        ["WI", "Planned", "", ""],
        ["FM", "Under Revision", "", ""],
        ["", "Superseded", "", ""],
        ["", "Withdrawn", "", ""],
        ["", "Uncontrolled (legacy)", "", ""],
      ] });
    }

    if (path.includes("tables('DocumentRegister')/range")) {
      return json({
        address: "Register!A1:" + lastCol() + (model.rows.length + 1),
        values: [model.headers.slice()].concat(model.rows.map((r) => r.slice())),
      });
    }

    if (path.includes("tables('DocumentRegister')/rows/add") && method === "POST") {
      if (!body || !Array.isArray(body.values) || body.values[0].length !== HEADERS.length) {
        return fail(400, "InvalidArgument", "row width does not match the table");
      }
      model.rows.push(body.values[0].slice());
      return json({ index: model.rows.length - 1 });
    }

    const range = /worksheets\('Register'\)\/range\(address='([A-Z]+)(\d+):([A-Z]+)(\d+)'\)(\/delete)?/.exec(path);
    if (range) {
      const index = sheetRowToIndex(Number(range[2]));
      if (range[3] !== lastCol() || range[2] !== range[4]) {
        return fail(400, "InvalidArgument", "unexpected range " + path);
      }
      if (index < 0 || index >= model.rows.length) {
        return fail(400, "InvalidArgument", "range outside the table");
      }
      if (range[5]) { model.rows.splice(index, 1); return json({}); }
      if (method === "PATCH") {
        if (body.values[0].length !== HEADERS.length) {
          return fail(400, "InvalidArgument", "row width does not match the table");
        }
        model.rows[index] = body.values[0].slice();
        return json({});
      }
      return json({ values: [model.rows[index].slice()] });
    }

    return fail(404, "itemNotFound", "unstubbed: " + method + " " + path);
  };
}

function seedSession() {
  localStorage.setItem("qmsRegister.config", JSON.stringify({
    tenantId: "tenant", clientId: "client",
    hostname: "contoso.sharepoint.com", sitePath: "/sites/QMS",
    filePath: "General/QMS-Document-Register.xlsx",
    sheetName: "Register", tableName: "DocumentRegister",
  }));
  sessionStorage.setItem("qmsRegister.token", JSON.stringify({
    accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 3600e3,
  }));
}

/* -------------------------------------------------------------------- driver */
const html = await readFile(pageFile, "utf8");
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(0);
const port = server.address().port;
const base = "http://localhost:" + port + "/index.html";

/* PLAYWRIGHT_CHROMIUM lets the runner point at a browser it already has. */
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.addInitScript(seedSession);
await page.addInitScript(installMock);
await page.goto(base);
await page.waitForSelector("#app-view:not(.hidden)", { timeout: 15000 });

const rowCount = () => page.locator("#tbody tr").count();
const stat = (i) => page.locator(".stat .n").nth(i).innerText();
const model = () => page.evaluate(() => window.__mock.rows.map((r) => r.slice()));

section("Loading the workbook");
ok("app renders after loading", await page.locator("#app-view").isVisible());
ok("file name shown in the header",
  (await page.locator("#file-label").innerText()) === "QMS-Document-Register.xlsx");
ok("signed-in user shown", (await page.locator("#who-name").innerText()) === "Test User");
ok("all three seed rows rendered", (await rowCount()) === 3, "got " + await rowCount());
ok("workbook session header sent with data calls",
  await page.evaluate(() => window.__mock.sessionHeaderSeen));
ok("controlled lists read from the Lists sheet",
  (await page.locator("#f-status option").count()) === 9);

section("Derived figures");
ok("total counted", (await stat(0)) === "3", await stat(0));
ok("approved counted", (await stat(1)) === "2", await stat(1));
ok("gaps counted", (await stat(2)) === "1", await stat(2));
ok("nothing overdue with future review dates", (await stat(3)) === "0", await stat(3));

section("Search and filters");
await page.fill("#q", "management of change");
ok("free-text search narrows the table", (await rowCount()) === 1);
await page.fill("#q", "");
await page.selectOption("#f-status", "Approved");
ok("status filter narrows the table", (await rowCount()) === 2);
await page.selectOption("#f-status", "");
ok("clearing the filter restores every row", (await rowCount()) === 3);

section("Adding a record");
await page.click("#new-btn");
await page.selectOption("#f-Type", "PR");
ok("next number in the series suggested",
  (await page.inputValue("#f-Doc-No")) === "QMS-PR-012", await page.inputValue("#f-Doc-No"));
await page.fill("#f-Title", "Internal Audit");
await page.selectOption("#f-Function", "Quality Assurance");
await page.fill("#f-Owner", "Quality Assurance Manager");
await page.fill("#f-Rev", "1");
await page.selectOption("#f-Status", "Approved");
await page.fill("#f-Issue-Date", "2026-02-01");
await page.fill("#f-Next-Review", "2028-02-01");
await page.fill("#f-Location", "/sites/QMS/Controlled/Procedures");
await page.fill("#f-ISO-9001-Clauses", "9.2");
await page.click("#save-btn");
await page.waitForSelector("#form-scrim", { state: "hidden" });

let rows = await model();
ok("row appended to the workbook", rows.length === 4);
ok("row written at full table width", rows[3].length === 15, "width " + rows[3].length);
ok("values landed in the right columns",
  rows[3][0] === "QMS-PR-012" && rows[3][1] === "Internal Audit" &&
  rows[3][7] === "Approved" && rows[3][13] === "9.2", JSON.stringify(rows[3]));
ok("table reloaded from the workbook", (await rowCount()) === 4);
ok("approved count follows", (await stat(1)) === "3", await stat(1));

section("Rejecting a duplicate number");
await page.click("#new-btn");
await page.fill("#f-Doc-No", "QMS-PO-001");
await page.fill("#f-Title", "Clash");
await page.selectOption("#f-Type", "PO");
await page.selectOption("#f-Function", "Operations");
await page.fill("#f-Owner", "Operations Manager");
await page.selectOption("#f-Status", "Approved");
await page.click("#save-btn");
ok("duplicate document number refused",
  (await formError(page)).includes("already on the register"));
ok("nothing written to the workbook", (await model()).length === 4);
await page.click("#cancel-btn");

section("Required fields");
await page.click("#new-btn");
await page.fill("#f-Title", "No number, no owner");
await page.click("#save-btn");
ok("missing required fields refused", (await formError(page)).includes("required"));
ok("offending fields marked", (await page.locator(".field.bad").count()) >= 2);
await page.click("#cancel-btn");

section("Editing a record");
await page.locator("#tbody tr", { hasText: "Management of Change" }).click();
ok("form loads the row", (await page.inputValue("#f-Doc-No")) === "QMS-PR-011");
await page.selectOption("#f-Status", "In Development");
await page.fill("#f-Rev", "0");
await page.click("#save-btn");
await page.waitForSelector("#form-scrim", { state: "hidden" });
rows = await model();
ok("the edited row changed", rows[2][7] === "In Development" && rows[2][6] === "0",
  JSON.stringify(rows[2]));
ok("no other row was touched",
  rows[0][0] === "QMS-PO-001" && rows[1][0] === "QMS-PR-004" && rows[3][0] === "QMS-PR-012");
ok("unmanaged column preserved", rows[2][14] === "seed", rows[2][14]);

section("Guarding against a row that moved");
/* Someone inserts a row in Excel between load and save: every index below shifts. */
await page.locator("#tbody tr", { hasText: "Quality Policy" }).click();
await page.evaluate(() => window.__mock.rows.unshift(
  window.__mock.rows[0].map((v, i) => (i === 0 ? "QMS-XX-999" : v))));
await page.fill("#f-Title", "Quality Policy (edited)");
await page.click("#save-btn");
ok("stale row write refused", (await formError(page)).includes("moved in the workbook"));
rows = await model();
ok("no row was overwritten", rows.every((r) => r[1] !== "Quality Policy (edited)"));
await page.click("#cancel-btn");
await page.evaluate(() => window.__mock.rows.shift());
await page.click("#refresh-btn");
await page.waitForFunction(() => document.querySelectorAll("#tbody tr").length === 4);

section("Integrity checks");
await page.click("#checks-btn");
const checks = await page.locator("#checks-body").innerText();
ok("parent-document gap reported", /Parent document not on the register \(2\)/.test(checks), checks.slice(0, 200));
ok("gaps reported", /Documentation gaps[^)]*\)\s*\(1\)/.test(checks));
ok("clean checks reported as none", /Duplicate document numbers \(0\)/.test(checks));
await page.click("#checks-close");

section("Deleting a record");
page.once("dialog", (d) => d.accept());
await page.locator("#tbody tr", { hasText: "Internal Audit" }).click();
await page.click("#delete-btn");
await page.waitForSelector("#form-scrim", { state: "hidden" });
rows = await model();
ok("row removed from the workbook", rows.length === 3);
ok("the right row was removed", rows.every((r) => r[0] !== "QMS-PR-012"));
ok("table reloaded", (await rowCount()) === 3);

section("Console");
ok("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
server.close();
console.log(failed ? "\n" + failed + " check(s) failed" : "\nall checks passed");
process.exit(failed ? 1 : 0);
