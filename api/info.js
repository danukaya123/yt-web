// api/info.js
const yt = require("@vreden/youtube_scraper");
const he = require("he");

// --- Helpers ---
const MP4_QUALITIES = [1080, 720, 480, 360, 144];
const MP3_QUALITIES = [320, 256, 128, 92];

function cleanFileName(title = "download", qualityLabel = "", ext = "mp4") {
  const safe = he.decode(String(title))
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // invisible chars
    .replace(/[^\w\s-]/g, "") // remove weird chars
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const name = safe || "download";
  const quality = qualityLabel ? ` (${qualityLabel})` : "";
  return `${name}${quality}.${ext}`;
}

function timeoutPromise(p, ms, message = "Timeout") {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(message)), ms))
  ]);
}

async function headContentLength(url) {
  try {
    // use HEAD to get content-length
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    return len ? Number(len) : null;
  } catch (e) {
    // fallback: try GET but don't download body — but most servers will also block.
    return null;
  }
}

async function probeDownload(type, q, quality, timeoutMs = 7000) {
  // type: "mp4" or "mp3"
  try {
    const call = type === "mp3" ? yt.ytmp3(q, quality) : yt.ytmp4(q, quality);
    const res = await timeoutPromise(call, timeoutMs, "probe timeout");
    if (!res?.download?.url) return null;
    const url = res.download.url;
    const filenameRaw = res.download.filename || res.metadata?.title || "download";
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
  // basic CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const q = (req.query.q || req.body?.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok: false, message: "Missing `q` param (YouTube url or id)" });

    // get metadata (fast)
    const meta = await yt.metadata(q).catch(err => {
      console.warn("metadata error", err?.message || err);
      return null;
    });

    // normalize thumbnail
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

    // Probe qualities concurrently but bounded (Promise.all with map)
    // We'll probe MP4 then MP3. Each probe has its own timeout and failures are ignored.
    const mp4Promises = MP4_QUALITIES.map(qty => probeDownload("mp4", q, qty, 7000));
    const mp3Promises = MP3_QUALITIES.map(qty => probeDownload("mp3", q, qty, 7000));

    // run probes with concurrency limiting by simple batching to avoid too many parallel fetches
    async function runInBatches(promises, batchSize = 2) {
      const results = [];
      for (let i = 0; i < promises.length; i += batchSize) {
        const batch = promises.slice(i, i + batchSize).map(fn => fn);
        // batch contains already-started promises; but our map above created promises already.
        // To ensure we don't overload, we actually created promises already. So we instead use Promise.all on slices of the original arrays.
        // (Implementation detail: our arrays are already promises.)
        // We'll just await Promise.all on slice results:
        // But to avoid re-creating, let's assume items are promises already.
        const slice = promises.slice(i, i + batchSize);
        const settled = await Promise.all(slice);
        results.push(...settled);
      }
      return results;
    }

    // But mp4Promises/mp3Promises are arrays of promises already (returned by probeDownload).
    // We'll process with a simple concurrency: await Promise.all but each probe already handles its own timeout.
    // For safety, run them in small batches sequentially:
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

    // map results to output shape (only include successful probes)
    const mp4 = mp4Results
      .map((r, idx) => ({ qualityNumber: MP4_QUALITIES[idx], ...(r || {}) }))
      .filter(r => r && r.url)
      .map(r => ({ quality: `${r.qualityNumber}p`, qualityNumber: r.qualityNumber, url: r.url, filename: r.filename, size: r.size }));

    const mp3 = mp3Results
      .map((r, idx) => ({ qualityNumber: MP3_QUALITIES[idx], ...(r || {}) }))
      .filter(r => r && r.url)
      .map(r => ({ quality: `${r.qualityNumber}kbps`, qualityNumber: r.qualityNumber, url: r.url, filename: r.filename, size: r.size }));

    return res.json({
      ok: true,
      metadata: safeMeta,
      downloads: { mp4, mp3 }
    });
  } catch (err) {
    console.error("api/info error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
