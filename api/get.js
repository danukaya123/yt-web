// api/get.js
const yt = require("@vreden/youtube_scraper");

function sanitizeFilename(name) {
  // Replace invalid characters for headers
  return name
    .replace(/[\x00-\x1F\x7F"]/g, "") // remove control chars and quotes
    .replace(/[<>:\\\/|?*]/g, "")      // remove filesystem unsafe chars
    .trim();
}

module.exports = async (req, res) => {
  try {
    const type = (req.query.type || "mp4").toString().toLowerCase();
    const quality = Number(req.query.quality || (type === "mp3" ? 128 : 360));
    const q = (req.query.q || "").toString().trim();

    if (!q) {
      return res.status(400).json({
        ok: false,
        message: "Missing 'q' param (YouTube URL or ID)."
      });
    }

    if (!["mp3", "mp4"].includes(type)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid type. Must be 'mp3' or 'mp4'."
      });
    }

    let result;
    try {
      result = type === "mp3"
        ? await yt.ytmp3(q, quality)
        : await yt.ytmp4(q, quality);
    } catch (err) {
      console.error("Conversion error:", err);
      return res.status(500).json({
        ok: false,
        message: "Conversion failed.",
        error: err.message
      });
    }

    const downloadUrl = result?.download?.url;
    if (!downloadUrl) {
      return res.status(500).json({
        ok: false,
        message: "No download URL received from extractor."
      });
    }

    // Safe filename
    let filename = result.download.filename || result?.metadata?.title || "video";
    filename = sanitizeFilename(filename);
    filename = type === "mp3" ? `${filename} (${quality}kbps).mp3` : `${filename} (${quality}p).mp4`;

    // Set headers safely
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    // Redirect
    res.writeHead(302, { Location: downloadUrl });
    return res.end();

  } catch (err) {
    console.error("GET API ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};
