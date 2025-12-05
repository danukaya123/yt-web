// api/get.js
// GET params: ?type=mp4|mp3&quality=360|128&q=<youtube url or id>
// This endpoint returns the direct download URL (or issues a redirect)
// Recommended usage by frontend: fetch this endpoint, then window.location = result.url

const yt = require("@vreden/youtube_scraper");

module.exports = async (req, res) => {
  try {
    const type = (req.query.type || "mp4").toString();
    const quality = Number(req.query.quality || (type === "mp3" ? 128 : 360));
    const q = (req.query.q || "").toString().trim();

    if (!q) return res.status(400).json({ ok: false, message: "Missing q param (YouTube link/id)" });

    let result;
    if (type === "mp3") {
      result = await yt.ytmp3(q, quality);
    } else {
      result = await yt.ytmp4(q, quality);
    }

    if (!result?.download?.url) {
      return res.status(500).json({ ok: false, message: "Downloader returned no url" });
    }

    const url = result.download.url;
    const filename = result.download.filename || (type === "mp3" ? "audio.mp3" : "video.mp4");

    // Option 1: return JSON with url + filename (frontend can set window.location to url)
    return res.json({ ok: true, url, filename });

    // Option 2 (uncomment to instead redirect immediately):
    // res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // res.writeHead(302, { Location: url });
    // res.end();
  } catch (err) {
    console.error("api/get error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
