#!/usr/bin/env node

const dns = require("dns").promises;
const https = require("https");

const targets = [
  "looksgoods.com",
  "www.looksgoods.com",
  "api.looksgoods.com",
  "looksgood-api-production.up.railway.app",
  "looksgood-web-production.up.railway.app",
];

const urls = [
  "https://looksgoods.com",
  "https://www.looksgoods.com",
  "https://api.looksgoods.com/health",
  "https://api.looksgoods.com/api/health",
  "https://looksgood-api-production.up.railway.app/health",
  "https://looksgood-api-production.up.railway.app/api/health",
  "https://looksgood-web-production.up.railway.app",
];

function request(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 12000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        resolve({
          ok: true,
          status: res.statusCode,
          location: res.headers.location || "",
          body: body.slice(0, 180).replace(/\s+/g, " ").trim(),
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });

    req.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

async function main() {
  console.log("=== DNS ===");
  for (const host of targets) {
    try {
      const a = await dns.resolve4(host);
      console.log(`A ${host}: ${a.join(", ")}`);
    } catch (error) {
      console.log(`A ${host}: ERROR ${error.code || error.message}`);
    }

    try {
      const cname = await dns.resolveCname(host);
      console.log(`CNAME ${host}: ${cname.join(", ")}`);
    } catch (error) {
      console.log(`CNAME ${host}: ERROR ${error.code || error.message}`);
    }
  }

  console.log("\n=== HTTPS ===");
  for (const url of urls) {
    const result = await request(url);
    if (!result.ok) {
      console.log(`${url} => ERROR ${result.error}`);
      continue;
    }

    console.log(`${url} => ${result.status}${result.location ? ` -> ${result.location}` : ""}`);
    if (result.body) {
      console.log(`BODY: ${result.body}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
