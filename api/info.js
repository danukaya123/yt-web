// api/info.js
const yt = require("@vreden/youtube_scraper");
const he = require("he");

// --- Helpers ---
const MP4_QUALITIES = [1080, 720, 480, 360, 144];
const MP3_QUALITIES = [320, 256, 128, 92];

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

async function probeDownload(type, q, quality) {
  try {
    const res =
      type === "mp3"
        ? await yt.ytmp3(q, quality)
        : await yt.ytmp4(q, quality);

    if (!res?.download?.url) return null;

    const url = res.download.url;
    const filenameRaw = res.download.filename || res.metadata?.title || "download";
    const ext = type === "mp3" ? "mp3" : "mp4";
    const qualityLabel = type === "mp3" ? `${quality}kbps` : `${quality}p`;

    const filename = cleanFileName(filenameRaw, qualityLabel, ext);
    const size = await headContentLength(url); // no timeout

    return { url, filename, size, metadata: res.metadata || {} };
  } catch {
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
      (meta?.thumbnail || meta?.image || meta?.thumbnails?.[0]?.url) ||
      (meta?.id ? `https://i.ytimg.com/vi/${meta.id}/hqdefault.jpg` : null);

    const safeMeta = {
      title: meta?.title || meta?.videoTitle || "Unknown Title",
      description: meta?.description || "",
      author: meta?.author?.name || meta?.channel_title || "Unknown Author",
      views: meta?.views || meta?.statistics?.view || 0,
      duration:
        meta?.duration?.timestamp ||
        meta?.timestamp ||
        (meta?.seconds
          ? `${Math.floor(meta.seconds / 60)}:${String(meta.seconds % 60).padStart(2, "0")}`
          : "Unknown duration"),
      videoId: meta?.videoId || meta?.id,
      thumbnail
    };

    // --- PROBE QUALITY LIST (NO TIMEOUT) ---
const mp4Results = await Promise.all(
  MP4_QUALITIES.map(qty => probeDownload("mp4", q, qty))
);

const mp3Results = await Promise.all(
  MP3_QUALITIES.map(qty => probeDownload("mp3", q, qty))
);

    const mp4 = mp4Results
      .map((r, idx) => r && ({
        quality: `${MP4_QUALITIES[idx]}p`,
        qualityNumber: MP4_QUALITIES[idx],
        url: r.url,
        filename: r.filename,
        size: r.size
      }))
      .filter(Boolean);

    const mp3 = mp3Results
      .map((r, idx) => r && ({
        quality: `${MP3_QUALITIES[idx]}kbps`,
        qualityNumber: MP3_QUALITIES[idx],
        url: r.url,
        filename: r.filename,
        size: r.size
      }))
      .filter(Boolean);

    return res.json({
      ok: true,
      metadata: safeMeta,
      downloads: { mp4, mp3 }
    });
  } catch (err) {
    console.error("info.js error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
