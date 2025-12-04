import { ytmp3, ytmp4 } from "@vreden/youtube_scraper";
import yts from "yt-search";
import he from "he";

async function findFirstVideo(query) {
  const searchResult = await yts(query);
  if (!searchResult?.videos?.length) return null;
  const first = searchResult.videos[0];
  return { title: he.decode(first.title), url: first.url };
}

// Updated backend to return metadata
export default async function handler(req, res) {
  const { query, type } = req.query;
  if (!query) return res.status(400).json({ error: "Query required" });

  let videoUrl = query;
  const ytRegex = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  
  if (!ytRegex.test(videoUrl)) {
    const first = await findFirstVideo(videoUrl);
    if (!first) return res.status(404).json({ error: "No results found" });
    videoUrl = first.url;
  }

  try {
    const result = type === "mp3" ? await ytmp3(videoUrl, 128) : await ytmp4(videoUrl, 360);
    
    if (!result?.download?.url) {
      return res.status(500).json({ error: "Failed to get download link" });
    }

    // Return metadata along with download info
    res.status(200).json({
      url: result.download.url,
      filename: result.download.filename || `${result.metadata.title}.${type}`,
      metadata: result.metadata // Add this line
    });
    
  } catch (err) {
    console.error("Download Error:", err);
    res.status(500).json({ error: "Error fetching download link" });
  }
}
