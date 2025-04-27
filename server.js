// server.js
import express from "express";
import axios from "axios";
import { writeFile, readdir, createReadStream } from "fs/promises";
import fs from "fs";
import archiver from "archiver";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const ELEVENLABS_API_KEY = "sk_1e34a3f60f1d112e510c25f7d978337aa479bf1718b613cc";

// Hardcoded voice IDs
const VOICES = {
  narrator: "T7BynZfVvacxcxWLgLc2",
  female: "21m00Tcm4TlvDq8ikWAM",
  male: "29vD33N1CtxCmqQRPOHJ"
};

// Allow large JSON bodies
app.use(express.json({ limit: "10mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (MP3s and ZIPs)
app.use("/files", express.static(path.join(__dirname, "files")));

app.post("/generate", async (req, res) => {
  const { text, speaker = "narrator", filename = "output" } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing text field." });
  }

  const voiceId = VOICES[speaker] || VOICES.narrator;

  try {
    const elevenResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.8
        },
        output_format: "mp3_192"
      },
      {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/json",
          "accept": "audio/mpeg",
          "xi-api-key": ELEVENLABS_API_KEY
        }
      }
    );

    const outputPath = path.join(__dirname, "files", `${filename}.mp3`);
    await writeFile(outputPath, elevenResponse.data);

    const fileUrl = `${req.protocol}://${req.get("host")}/files/${filename}.mp3`;

    res.json({ url: fileUrl });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Error generating audio." });
  }
});

// New endpoint: generate a ZIP file for all matching scene files
app.post("/generate-zip", async (req, res) => {
  const { prefix } = req.body;

  if (!prefix) {
    return res.status(400).json({ error: "Missing prefix field." });
  }

  const filesDir = path.join(__dirname, "files");
  const outputZipPath = path.join(filesDir, `${prefix}.zip`);

  try {
    const allFiles = await readdir(filesDir);

    const matchingFiles = allFiles.filter(filename =>
      filename.startsWith(prefix) && filename.endsWith(".mp3")
    );

    if (matchingFiles.length === 0) {
      return res.status(404).json({ error: "No matching MP3 files found." });
    }

    const output = fs.createWriteStream(outputZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    for (const file of matchingFiles) {
      const fullPath = path.join(filesDir, file);
      archive.file(fullPath, { name: file });
    }

    await archive.finalize();

    const fileUrl = `${req.protocol}://${req.get("host")}/files/${prefix}.zip`;

    res.json({ url: fileUrl });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creating zip file." });
  }
});

// Make sure /files directory exists
import { mkdir } from "fs/promises";
mkdir(path.join(__dirname, "files"), { recursive: true });

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
