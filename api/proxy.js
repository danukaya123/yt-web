// api/proxy.js

module.exports = async (req, res) => {
  const url = req.query.url;
  const filename = req.query.filename || "video.mp4";

  if (!url) return res.status(400).send("Missing url");

  try {
    // Use native fetch
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

    // Set headers to force download with desired filename
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");

    // Stream remote file to client
    response.body.pipe(res);

  } catch (err) {
    console.error("Proxy download error:", err);
    res.status(500).send("Proxy download failed");
  }
};
