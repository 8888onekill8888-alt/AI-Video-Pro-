const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");
const nativeFetch = global.fetch;

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

test("generation reports the free Gemini key requirement without requiring OpenAI", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const response = await nativeFetch(`${baseUrl}/api/video/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story: "A small test story.", durationSeconds: 30 }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GEMINI_API_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("generation uses Gemini and returns direct Pollinations image URLs", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = global.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  global.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(options.headers["x-goog-api-key"], "test-gemini-key");
    const request = JSON.parse(options.body);
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              title: "Test screenplay",
              scenes: [{
                narration: "Một câu chuyện thử nghiệm.",
                description: "A fictional character in a forest.",
                imagePrompt: "cinematic forest at dawn",
                durationSeconds: 30,
              }],
            }),
          }],
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await nativeFetch(`${baseUrl}/api/video/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        story: "A small test story.",
        durationSeconds: 30,
        generateImages: true,
      }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.scriptProvider, "Gemini");
    assert.equal(result.imageProvider, "Pollinations AI");
    assert.match(result.scenes[0].imageUrl, /^https:\/\/image\.pollinations\.ai\/prompt\//);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("gTTS language mapping includes Vietnamese", () => {
  const { getSpeechLanguage } = require("../controllers/videoController");
  assert.equal(getSpeechLanguage("Tiếng Việt"), "vi");
  assert.equal(getSpeechLanguage("English"), "en");
  assert.equal(getSpeechLanguage("unsupported"), undefined);
});

test("translation requires an uploaded video", async () => {
  const response = await fetch(`${baseUrl}/api/video/translate`, { method: "POST" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /video file is required/);
});
