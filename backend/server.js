require("dotenv").config();

const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const path = require("node:path");
const videoController = require("./controllers/videoController");

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use("/outputs", express.static(path.join(__dirname, "outputs"), {
  dotfiles: "deny",
  index: false,
  maxAge: "1h",
}));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.get("/api/discovery", (_request, response) => {
  const nodes = new Set();
  if (process.env.PUBLIC_BASE_URL) nodes.add(process.env.PUBLIC_BASE_URL.trim().replace(/\/+$/, ""));
  for (const node of (process.env.DISCOVERY_URLS || "").split(",")) {
    const value = node.trim().replace(/\/+$/, "");
    if (value) nodes.add(value);
  }
  response.json({ nodes: [...nodes] });
});

app.post("/api/video/generate", videoController.generate);
app.post("/api/video/translate", videoController.upload.single("video"), videoController.translate);

app.use((error, _request, response, _next) => {
  console.error("Request failed:", error);
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "Invalid JSON request body." });
  }
  if (error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({ error: "Uploaded video exceeds the configured size limit." });
  }
  if (error.message === "Unsupported video format.") {
    return response.status(415).json({ error: error.message });
  }
  return response.status(error.status || 500).json({ error: error.message || "Internal server error." });
});

async function start() {
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.info("MongoDB connected.");
    } catch (error) {
      console.error("MongoDB connection failed:", error);
      process.exitCode = 1;
      return;
    }
  } else {
    console.warn("MONGO_URI is unset; starting without database persistence.");
  }
  app.listen(port, "0.0.0.0", () => {
    console.info(`AI Video Studio API listening on port ${port}.`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
