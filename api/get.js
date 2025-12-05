// api/get.js
const yt = require("@vreden/youtube_scraper");
const fetch = require("node-fetch");

// Sanitize and clean the title
function cleanTitle(title) {
  if (!title) return "video";

  return title
    // Remove common unwanted suffixes added by downloaders
    .replace(/-\d+-ytshorts\.savetube\.me$/i, "")
    // Remove control characters & quotes
    .replace(/[\x00-\x1F\x7F"]/g, "")
    // Remove filesystem unsafe characters
    .replace(/[<>:\\\/|?*]/g, "")
    .trim();
}

module.exports = async (req, res) => {
  try {
    const type = (req.query.type || "mp4").toString().toLowerCase();
    const quality = Number(req.query.quality || (type === "mp3" ? 128 : 360));
    const q = (req.query.q || "").toString().trim();

    if (!q) {
      return res.status(400).json({ ok: false, message: "Missing 'q' param (YouTube URL or ID)." });
    }
    if (!["mp3", "mp4"].includes(type)) {
      return res.status(400).json({ ok: false, message: "Invalid type. Must be 'mp3' or 'mp4'." });
    }

    // Fetch conversion info
    let result;
    try {
      result = type === "mp3" ? await yt.ytmp3(q, quality) : await yt.ytmp4(q, quality);
    } catch (err) {
      console.error("Conversion error:", err);
      return res.status(500).json({ ok: false, message: "Conversion failed.", error: err.message });
    }

    const downloadUrl = result?.download?.url;
    if (!downloadUrl) {
      return res.status(500).json({ ok: false, message: "No download URL received from extractor." });
    }

    // Generate safe, clean filename
    let filename = result.download.filename || result.metadata?.title || "video";
    filename = cleanTitle(filename);
    filename = type === "mp3" ? `${filename} (${quality}kbps).mp3` : `${filename} (${quality}p).mp4`;

    // Set headers
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", type === "mp3" ? "audio/mpeg" : "video/mp4");
    res.setHeader("Access-Control-Allow-Origin", "*"); // Fix CORS

    // Stream the actual file to client
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error("Failed to fetch file from source.");

    response.body.pipe(res);

  } catch (err) {
    console.error("GET API ERROR:", err);
    return res.status(500).json({ ok: false, message: "Internal Server Error", error: err.message });
  }
};
