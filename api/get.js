// api/get.js
// Redirects user to actual download URL with a forced filename
// Params: ?type=mp4|mp3&quality=360|128&q=<youtube url or id>

const yt = require("@vreden/youtube_scraper");

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

    // Validate type
    if (!["mp3", "mp4"].includes(type)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid type. Must be 'mp3' or 'mp4'."
      });
    }

    // Fetch conversion
    let result;
    try {
      if (type === "mp3") {
        result = await yt.ytmp3(q, quality);
      } else {
        result = await yt.ytmp4(q, quality);
      }
    } catch (err) {
      console.error("Conversion error:", err);
      return res.status(500).json({
        ok: false,
        message: "Conversion failed.",
        error: err.message
      });
    }

    // Validate result
    const downloadUrl = result?.download?.url;
    if (!downloadUrl) {
      return res.status(500).json({
        ok: false,
        message: "No download URL received from extractor."
      });
    }

    // Generate safe filename
    let filename = result.download.filename || "";
    if (!filename || filename.trim() === "") {
      const title = result?.metadata?.title || "video";
      const safeTitle = title.replace(/[^\w\d\- ]/g, "");
      filename = type === "mp3"
        ? `${safeTitle} (${quality}kbps).mp3`
        : `${safeTitle} (${quality}p).mp4`;
    }

    // Set headers to force download
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    // Redirect to actual download URL
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
