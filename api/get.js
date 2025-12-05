// api/get.js
// Redirects user to actual download URL with a forced filename
// Params: ?type=mp4|mp3&quality=360|128&q=<youtube url or id>

const yt = require("@vreden/youtube_scraper");

module.exports = async (req, res) => {
  try {
    const type = (req.query.type || "mp4").toString();
    const quality = Number(req.query.quality || (type === "mp3" ? 128 : 360));
    const q = (req.query.q || "").toString().trim();

    if (!q) {
      return res.status(400).json({
        ok: false,
        message: "Missing q param (YouTube URL or ID)."
      });
    }

    // Fetch conversion from library
    let result;
    try {
      result = type === "mp3"
        ? await yt.ytmp3(q, quality)
        : await yt.ytmp4(q, quality);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        message: "Conversion failed",
        error: err.message
      });
    }

    // Validate downloader response
    if (!result?.download?.url) {
      return res.status(500).json({
        ok: false,
        message: "No download URL received from extractor."
      });
    }

    const url = result.download.url;

    // Sanitize filename
    let filename = result.download.filename || "";
    if (!filename || filename.trim() === "") {
      const title = result?.metadata?.title || "video";
      if (type === "mp3") {
        filename = `${title.replace(/[^\w\d\- ]/g, "")} (${quality}kbps).mp3`;
      } else {
        filename = `${title.replace(/[^\w\d\- ]/g, "")} (${quality}p).mp4`;
      }
    }

    // Set forced filename for browser download
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    // Perform redirect
    res.writeHead(302, { Location: url });
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
