// api/get.js
const yt = require("@vreden/youtube_scraper");
const he = require("he");

function cleanFileName(title = "download", qualityLabel = "", ext = "mp4") {
  const safe = he.decode(String(title))
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const name = safe || "download";
  const quality = qualityLabel ? ` (${qualityLabel})` : "";
  return `${name}${quality}.${ext}`;
}

async function headContentLength(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    return len ? Number(len) : null;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  // basic CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const type = (req.query.type || "mp4").toString().toLowerCase();
    const quality = Number(req.query.quality || (type === "mp3" ? 128 : 360));
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok: false, message: "Missing q param (YouTube link/id)" });

    // call the appropriate downloader
    const call = type === "mp3" ? yt.ytmp3(q, quality) : yt.ytmp4(q, quality);
    const result = await call;

    if (!result?.download?.url) {
      return res.status(500).json({ ok: false, message: "Downloader returned no url" });
    }

    const url = result.download.url;
    const rawTitle = result.metadata?.title || result.download?.filename || "download";
    const ext = type === "mp3" ? "mp3" : "mp4";
    const qualityLabel = type === "mp3" ? `${quality}kbps` : `${quality}p`;
    const filename = cleanFileName(rawTitle, qualityLabel, ext);

    const size = await headContentLength(url);

    // return final info (frontend can use window.location = url)
    return res.json({ ok: true, url, filename, size });
  } catch (err) {
    console.error("api/get error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
