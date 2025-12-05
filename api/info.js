// api/info.js
// Vercel Serverless: /api/info?q=<youtube url or id>
// Returns: metadata + mp4/mp3 options with real download url + content-length (size in bytes)

const yt = require("@vreden/youtube_scraper");
const he = require("he");

// helper to do HEAD request and get content-length
async function getContentLength(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    if (!len) return null;
    return Number(len);
  } catch (e) {
    console.warn("HEAD failed for", url, e?.message || e);
    return null;
  }
}

// map quality list to objects { quality, url, filename, size }
async function buildDownloads(videoUrl) {
  const mp4Qualities = [144, 360, 480, 720, 1080];
  const mp3Qualities = [92, 128, 256, 320];

  const mp4Arr = [];
  const mp3Arr = [];

  // For each mp4 quality, attempt to call ytmp4 -> get url, filename
  for (const q of mp4Qualities) {
    try {
      const res = await yt.ytmp4(videoUrl, q);
      if (res?.download?.url) {
        const url = res.download.url;
        const filename = res.download.filename || `${res.metadata?.title || "video"} (${q}p).mp4`;
        const size = await getContentLength(url);
        mp4Arr.push({ quality: `${q}p`, qualityNumber: q, url, filename, size });
      }
    } catch (e) {
      // ignore failures for particular quality
      console.warn("ytmp4 failed", q, e?.message || e);
    }
  }

  // For each mp3 quality, attempt to call ytmp3 -> get url, filename
  for (const q of mp3Qualities) {
    try {
      const res = await yt.ytmp3(videoUrl, q);
      if (res?.download?.url) {
        const url = res.download.url;
        const filename = res.download.filename || `${res.metadata?.title || "audio"} (${q}kbps).mp3`;
        const size = await getContentLength(url);
        mp3Arr.push({ quality: `${q}kbps`, qualityNumber: q, url, filename, size });
      }
    } catch (e) {
      console.warn("ytmp3 failed", q, e?.message || e);
    }
  }

  return { mp4: mp4Arr, mp3: mp3Arr };
}

module.exports = async (req, res) => {
  try {
    const q = (req.query.q || req.body.q || "").toString().trim();
    if (!q) {
      return res.status(400).json({ ok: false, message: "Missing query param `q` (YouTube URL or ID)." });
    }

    // fetch metadata
    const meta = await yt.metadata(q);

    // build downloads (this may take a few seconds because we request multiple qualities + HEAD)
    const downloads = await buildDownloads(q);

    return res.json({
      ok: true,
      metadata: meta,
      downloads
    });
  } catch (err) {
    console.error("api/info error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
