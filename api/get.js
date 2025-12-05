const yt = require("@vreden/youtube_scraper");

// Clean title for filename and HTTP header
function sanitizeFilename(title) {
  if (!title) return "video";

  // Remove common unwanted suffixes
  let clean = title.replace(/-\d+-ytshorts\.savetube\.me$/i, "");

  // Remove control chars
  clean = clean.replace(/[\x00-\x1F\x7F]/g, "");

  // Replace characters invalid in filenames or HTTP headers
  clean = clean.replace(/[<>:"\/\\|?*]/g, "");

  // Replace multiple spaces/dashes with single dash
  clean = clean.replace(/\s+/g, " ").trim();

  // Fallback
  if (!clean) clean = "video";

  return clean;
}

module.exports = async (req, res) => {
  try {
    const type = (req.query.type || "mp4").toString().toLowerCase();
    const quality = Number(req.query.quality || (type === "mp3" ? 128 : 360));
    const q = (req.query.q || "").toString().trim();

    if (!q) return res.status(400).json({ ok: false, message: "Missing 'q'" });
    if (!["mp3","mp4"].includes(type)) return res.status(400).json({ ok: false, message: "Invalid type" });

    const result = type === "mp3" ? await yt.ytmp3(q, quality) : await yt.ytmp4(q, quality);
    const downloadUrl = result?.download?.url;
    if (!downloadUrl) return res.status(500).json({ ok:false, message: "No download URL" });

    // Generate a fully safe filename
    let filename = result.download.filename || result.metadata?.title || "video";
    filename = sanitizeFilename(filename);
    filename = type==="mp3" ? `${filename} (${quality}kbps).mp3` : `${filename} (${quality}p).mp4`;

    // Use RFC 5987 encoding for Content-Disposition to handle any unicode safely
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader("Content-Type", type==="mp3" ? "audio/mpeg" : "video/mp4");
    res.setHeader("Access-Control-Allow-Origin","*");

    // Stream the file using Node 18+ fetch
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error("Failed to fetch file from source");

    response.body.pipe(res);

  } catch(err) {
    console.error("GET API ERROR:", err);
    return res.status(500).json({ ok:false, message:"Internal Server Error", error: err.message });
  }
};
