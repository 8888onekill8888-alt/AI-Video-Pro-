const { randomUUID } = require("node:crypto");
const { mkdir, rm, writeFile, readdir } = require("node:fs/promises");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const multer = require("multer");
const OpenAI = require("openai");

const execFileAsync = promisify(execFile);
const uploadDirectory = path.join(__dirname, "..", "uploads");
const outputDirectory = path.join(__dirname, "..", "outputs");
const scratchDirectory = path.join(__dirname, "..", ".cache", "jobs");
const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;

mkdirSync(uploadDirectory, { recursive: true });
mkdirSync(outputDirectory, { recursive: true });

const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter(_request, file, callback) {
    if (!file.mimetype.startsWith("video/")) {
      const error = new Error("Unsupported video format.");
      error.status = 415;
      return callback(error);
    }
    return callback(null, true);
  },
});

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function parseModelJson(content) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function splitForSpeech(text, maxLength = 3500) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt < maxLength / 2) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function generate(request, response, next) {
  try {
    const { story, durationSeconds, category, visualStyle, mood } = request.body;
    if (typeof story !== "string" || !story.trim() || story.length > 30_000) {
      return response.status(400).json({ error: "story must be a non-empty string of at most 30000 characters." });
    }
    const duration = Number(durationSeconds);
    if (!Number.isInteger(duration) || duration < 30 || duration > 1800) {
      return response.status(400).json({ error: "durationSeconds must be an integer from 30 to 1800." });
    }

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Bạn là biên kịch và đạo diễn hình ảnh. Trả về JSON có title và scenes.",
            "Chia nội dung thành các cảnh hợp lý cho thời lượng yêu cầu. narration phải bằng tiếng Việt.",
            "Mỗi cảnh gồm narration, description, imagePrompt bằng tiếng Anh và durationSeconds.",
            "Giữ nhân vật nhất quán xuyên suốt: lặp nguyên văn mô tả nhận diện bất biến của nhân vật trong mọi imagePrompt.",
            "Chỉ tạo nhân vật hư cấu; không mô phỏng người nổi tiếng hay gương mặt có thật.",
            "Không đổi trang phục, đặc điểm khuôn mặt, tuổi, màu sắc hoặc tài sản nhận diện giữa các cảnh.",
            "Không khẳng định đã dựng video; đây là kịch bản và prompt hình ảnh.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            story: story.trim(),
            durationSeconds: duration,
            category: String(category || "Drama").slice(0, 80),
            visualStyle: String(visualStyle || "Cinematic").slice(0, 80),
            mood: String(mood || "Dramatic").slice(0, 80),
            imagePromptRequirements: "English prompts; fixed fictional character bible; consistent assets, costume, and appearance in all scenes.",
          }),
        },
      ],
      temperature: 0.7,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("The AI returned an empty screenplay.");

    const result = parseModelJson(content);
    if (!Array.isArray(result.scenes) || result.scenes.length === 0) {
      throw new Error("The AI screenplay did not contain any scenes.");
    }
    if (request.body.generateImages === true) {
      // Giới hạn số ảnh để tránh gọi API tạo ảnh ngoài ý muốn với chi phí không kiểm soát.
      const scenesWithPrompts = result.scenes.slice(0, 4);
      const images = await Promise.all(scenesWithPrompts.map((scene) => openai.images.generate({
        model: "dall-e-3",
        prompt: String(scene.imagePrompt || scene.description || "").slice(0, 4000),
        size: "1024x1024",
        quality: "standard",
        n: 1,
        response_format: "url",
      })));
      images.forEach((image, index) => {
        const imageUrl = image.data?.[0]?.url;
        if (imageUrl) scenesWithPrompts[index].imageUrl = imageUrl;
      });
    }
    return response.json(result);
  } catch (error) {
    return next(error);
  }
}

async function translate(request, response, next) {
  const uploaded = request.file;
  if (!uploaded) {
    return response.status(400).json({ error: "A video file is required in the 'video' field." });
  }

  let speechFile;
  let outputFile;
  let scratchJobDirectory;
  let outputCreated = false;
  try {
    const targetLanguage = String(request.body.targetLanguage || "").trim();
    if (!targetLanguage || targetLanguage.length > 80) {
      return response.status(400).json({ error: "targetLanguage is required and must be at most 80 characters." });
    }
    if (!ffmpegPath) throw new Error("FFmpeg binary is unavailable.");
    const openai = getOpenAI();
    await mkdir(outputDirectory, { recursive: true });
    const jobId = randomUUID();
    scratchJobDirectory = path.join(scratchDirectory, jobId);
    await mkdir(scratchJobDirectory, { recursive: true });
    speechFile = path.join(scratchJobDirectory, `${jobId}-voice.mp3`);
    outputFile = path.join(outputDirectory, `${jobId}.mp4`);
    const extractedAudio = path.join(scratchJobDirectory, `${jobId}-source.mp3`);
    const segmentsDirectory = path.join(scratchJobDirectory, "segments");
    await mkdir(segmentsDirectory, { recursive: true });

    await execFileAsync(ffmpegPath, [
      "-y", "-i", uploaded.path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", extractedAudio,
    ], { timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    await execFileAsync(ffmpegPath, [
      "-y", "-i", extractedAudio, "-f", "segment", "-segment_time", "600",
      "-reset_timestamps", "1", path.join(segmentsDirectory, "part-%03d.mp3"),
    ], { timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });

    const segmentFiles = (await readdir(segmentsDirectory))
      .filter((filename) => filename.endsWith(".mp3"))
      .sort();
    if (segmentFiles.length === 0) throw new Error("FFmpeg did not extract any audio segments.");
    const transcriptParts = [];
    for (const filename of segmentFiles) {
      const transcription = await openai.audio.transcriptions.create({
        file: require("node:fs").createReadStream(path.join(segmentsDirectory, filename)),
        model: "whisper-1",
      });
      if (transcription.text.trim()) transcriptParts.push(transcription.text.trim());
    }
    const transcript = transcriptParts.join(" ");
    if (!transcript) throw new Error("Speech recognition did not return any transcript.");

    const translation = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Translate the following spoken script into ${targetLanguage}. Preserve meaning, names, and natural spoken phrasing. Return only the translated script.`,
        },
        { role: "user", content: transcript },
      ],
      temperature: 0.3,
    });
    const translatedScript = translation.choices[0]?.message?.content?.trim();
    if (!translatedScript) throw new Error("The translation service returned an empty script.");

    const speechChunks = splitForSpeech(translatedScript);
    const speechParts = speechChunks.map((_, index) =>
      path.join(scratchJobDirectory, `${jobId}-voice-${index}.mp3`));
    for (const [index, chunk] of speechChunks.entries()) {
      const speech = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: chunk,
        response_format: "mp3",
      });
      await writeFile(speechParts[index], Buffer.from(await speech.arrayBuffer()));
    }
    const speechManifest = path.join(scratchJobDirectory, `${jobId}-voice-list.txt`);
    await writeFile(
      speechManifest,
      speechParts.map((part) => `file '${part}'`).join("\n"),
      "utf8",
    );
    await execFileAsync(ffmpegPath, [
      "-y", "-f", "concat", "-safe", "0", "-i", speechManifest, "-c", "copy", speechFile,
    ], { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });

    // Thay track gốc bằng giọng đọc AI; không giả lập sao chép giọng của người tải lên.
    const probe = await execFileAsync(ffprobePath, [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
      uploaded.path,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const durationSeconds = Number(probe.stdout.trim());
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Could not determine the uploaded video's duration.");
    }
    await execFileAsync(ffmpegPath, [
      "-y", "-i", uploaded.path, "-i", speechFile,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-af", "apad", "-t", String(durationSeconds), "-movflags", "+faststart",
      outputFile,
    ], { timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    outputCreated = true;

    return response.json({
      jobId,
      transcript,
      translatedScript,
      downloadUrl: `${(process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`).replace(/\/+$/, "")}/outputs/${jobId}.mp4`,
      voice: "alloy",
      note: "Localized standard TTS voice; no voice cloning was performed.",
    });
  } catch (error) {
    return next(error);
  } finally {
    await rm(uploaded.path, { force: true }).catch((error) => console.error("Could not remove upload:", error));
    if (scratchJobDirectory) {
      await rm(scratchJobDirectory, { recursive: true, force: true })
        .catch((error) => console.error("Could not remove temporary media:", error));
    }
    if (!outputCreated && outputFile) {
      await rm(outputFile, { force: true }).catch((error) => console.error("Could not remove incomplete output:", error));
    }
  }
}

module.exports = { generate, translate, upload };
