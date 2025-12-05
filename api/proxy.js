// api/proxy.js
module.exports = async (req, res) => {
  const url = req.query.url;
  const filename = req.query.filename || "video.mp4";

  if (!url) return res.status(400).send("Missing url");

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);

    // Convert web stream to buffer and send
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);

  } catch (err) {
    console.error("Proxy download error:", err);
    res.status(500).send("Proxy download failed");
  }
};
