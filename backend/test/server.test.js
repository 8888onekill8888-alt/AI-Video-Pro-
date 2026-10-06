const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health endpoint reports the API is running", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
});

test("generation rejects invalid duration before calling AI services", async () => {
  const response = await fetch(`${baseUrl}/api/video/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ story: "A small test story.", durationSeconds: 0 }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /durationSeconds/);
});

test("translation requires an uploaded video", async () => {
  const response = await fetch(`${baseUrl}/api/video/translate`, { method: "POST" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /video file is required/);
});
