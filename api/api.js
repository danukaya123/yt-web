// api.js - Unified YouTube Downloader API
const yt = require("@vreden/youtube_scraper");
const he = require("he");

// --- Constants ---
const MP4_QUALITIES = [1080, 720, 480, 360, 144];
const MP3_QUALITIES = [320, 256, 128, 92];

// --- Helper Functions ---
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
    const size = await headContentLength(url);

    return { url, filename, size, metadata: res.metadata || {} };
  } catch {
    return null;
  }
}

// --- Main API Handler ---
module.exports = async (req, res) => {
  // Set very permissive CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Parse query parameters and body
    const q = req.query.q || (req.body && req.body.q) || "";
    const type = req.query.type || (req.body && req.body.type) || "info";
    const quality = req.query.quality ? parseInt(req.query.quality) : null;
    const action = req.query.action || (req.body && req.body.action) || type;

    // --- /info endpoint (get video metadata and available qualities) ---
    if (action === "info") {
      const videoId = q.toString().trim();
      if (!videoId) {
        return res.status(400).json({ 
          ok: false, 
          message: "Missing video URL or ID" 
        });
      }

      const meta = await yt.metadata(videoId).catch(() => null);

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

      // Probe available qualities
      const mp4Results = await Promise.all(
        MP4_QUALITIES.map(qty => probeDownload("mp4", videoId, qty))
      );

      const mp3Results = await Promise.all(
        MP3_QUALITIES.map(qty => probeDownload("mp3", videoId, qty))
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
    }

    // --- /download endpoint (get direct download URL) ---
    if (action === "download" || action === "get") {
      const videoId = q.toString().trim();
      const downloadType = (type === "mp3" || type === "audio") ? "mp3" : "mp4";
      const downloadQuality = quality || (downloadType === "mp3" ? 128 : 360);

      if (!videoId) {
        return res.status(400).json({ 
          ok: false, 
          message: "Missing video URL or ID" 
        });
      }

      // Get download URL
      const call = downloadType === "mp3" 
        ? yt.ytmp3(videoId, downloadQuality) 
        : yt.ytmp4(videoId, downloadQuality);
      
      const result = await call;

      if (!result?.download?.url) {
        return res.status(500).json({ 
          ok: false, 
          message: "Could not generate download URL" 
        });
      }

      const rawTitle = result.metadata?.title || result.download?.filename || "download";
      const ext = downloadType === "mp3" ? "mp3" : "mp4";
      const qualityLabel = downloadType === "mp3" ? `${downloadQuality}kbps` : `${downloadQuality}p`;
      const filename = cleanFileName(rawTitle, qualityLabel, ext);
      const size = await headContentLength(result.download.url);

      return res.json({
        ok: true,
        url: result.download.url,
        filename,
        size,
        type: downloadType,
        quality: downloadQuality
      });
    }

    // --- /proxy endpoint (for branded downloads) ---
    if (action === "proxy") {
      const url = req.query.url;
      let filename = req.query.filename || "video.mp4";

      if (!url) {
        return res.status(400).json({ 
          ok: false, 
          message: "Missing download URL" 
        });
      }

      try {
        // Add brand name prefix
        const brand = "Quizontal";
        filename = `${brand} - ${filename}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream";
        
        // Set download headers
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-cache");

        // Stream the response
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return res.send(buffer);

      } catch (err) {
        console.error("Proxy error:", err);
        return res.status(500).json({ 
          ok: false, 
          message: "Proxy download failed" 
        });
      }
    }

    // --- Health check endpoint ---
    if (action === "health") {
      return res.json({
        ok: true,
        message: "YouTube Downloader API is running",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      });
    }

    // --- No valid action specified ---
    return res.status(400).json({
      ok: false,
      message: "Invalid action. Use 'info', 'download', or 'proxy'",
      endpoints: {
        info: "/api?action=info&q=VIDEO_ID",
        download: "/api?action=download&q=VIDEO_ID&type=mp4&quality=720",
        proxy: "/api?action=proxy&url=DOWNLOAD_URL&filename=video.mp4",
        health: "/api?action=health"
      }
    });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
      error: err.message
    });
  }
};
