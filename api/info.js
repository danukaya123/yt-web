const yt = require("@vreden/youtube_scraper");
const he = require("he");

// --- Helpers ---
const MP4_QUALITIES = [1080, 720, 480, 360, 144];
const MP3_QUALITIES = [320, 256, 128, 92];

function sanitizeFilename(title) {
  if (!title) return "video";

  // Remove unwanted suffixes
  let clean = title.replace(/-\d+-ytshorts\.savetube\.me$/i, "");

  // Remove control chars
  clean = clean.replace(/[\x00-\x1F\x7F]/g, "");

  // Remove illegal chars for filenames/headers
  clean = clean.replace(/[<>:"\/\\|?*]/g, "");

  // Collapse multiple spaces
  clean = clean.replace(/\s+/g, " ").trim();

  if (!clean) clean = "video";

  return clean;
}

function cleanFileName(title = "download", qualityLabel = "", ext = "mp4") {
  const decoded = he.decode(String(title));
  const safe = sanitizeFilename(decoded);
  const quality = qualityLabel ? ` (${qualityLabel})` : "";
  return `${safe}${quality}.${ext}`;
}

// --- other helpers remain the same ---
function timeoutPromise(p, ms, message = "Timeout") {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(message)), ms))
  ]);
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

async function probeDownload(type, q, quality, timeoutMs = 7000) {
  try {
    const call = type === "mp3" ? yt.ytmp3(q, quality) : yt.ytmp4(q, quality);
    const res = await timeoutPromise(call, timeoutMs, "probe timeout");
    if (!res?.download?.url) return null;
    const url = res.download.url;
    const filenameRaw = res.download.filename || res.metadata?.title || "video";
    const ext = type === "mp3" ? "mp3" : "mp4";
    const filename = cleanFileName(filenameRaw, type === "mp3" ? `${quality}kbps` : `${quality}p`, ext);
    const size = await timeoutPromise(headContentLength(url), 3000, "head timeout").catch(() => null);
    return { url, filename, size, metadata: res.metadata || {} };
  } catch (e) {
    return null;
  }
}

// --- API Handler ---
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const q = (req.query.q || req.body?.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok: false, message: "Missing `q` param" });

    const meta = await yt.metadata(q).catch(() => null);
    const thumbnail =
      (meta && (meta.thumbnail || meta.image || meta.thumbnails?.[0]?.url)) ||
      (meta && meta.id ? `https://i.ytimg.com/vi/${meta.id}/hqdefault.jpg` : null);

    const safeMeta = {
      id: meta?.id || null,
      title: he.decode(meta?.title || meta?.videoTitle || "Unknown Title"),
      description: meta?.description || meta?.short_description || "",
      author: meta?.author || meta?.channel || null,
      views: meta?.views || meta?.statistics?.view || null,
      duration: meta?.duration || meta?.timestamp || null,
      thumbnail
    };

    const mp4Promises = MP4_QUALITIES.map(qty => probeDownload("mp4", q, qty, 7000));
    const mp3Promises = MP3_QUALITIES.map(qty => probeDownload("mp3", q, qty, 7000));

    async function runProbes(promises, batchSize = 2) {
      const out = [];
      for (let i = 0; i < promises.length; i += batchSize) {
        const chunk = promises.slice(i, i + batchSize);
        const settled = await Promise.all(chunk);
        out.push(...settled);
      }
      return out;
    }

    const mp4Results = await runProbes(mp4Promises, 2);
    const mp3Results = await runProbes(mp3Promises, 2);

    const mp4 = mp4Results
      .map((r, idx) => ({ qualityNumber: MP4_QUALITIES[idx], ...(r || {}) }))
      .filter(r => r && r.url)
      .map(r => ({ quality: `${r.qualityNumber}p`, qualityNumber: r.qualityNumber, url: r.url, filename: r.filename, size: r.size }));

    const mp3 = mp3Results
      .map((r, idx) => ({ qualityNumber: MP3_QUALITIES[idx], ...(r || {}) }))
      .filter(r => r && r.url)
      .map(r => ({ quality: `${r.qualityNumber}kbps`, qualityNumber: r.qualityNumber, url: r.url, filename: r.filename, size: r.size }));

    return res.json({ ok: true, metadata: safeMeta, downloads: { mp4, mp3 } });
  } catch (err) {
    console.error("api/info error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
