import { ytmp3, ytmp4, search, metadata } from "@vreden/youtube_scraper";
import he from "he";

async function findFirstVideo(query) {
  try {
    const searchResult = await search(query);
    
    // Handle different response formats
    let videos = [];
    
    if (searchResult.videos && Array.isArray(searchResult.videos)) {
      videos = searchResult.videos;
    } else if (Array.isArray(searchResult)) {
      videos = searchResult;
    } else if (searchResult.results) {
      videos = searchResult.results;
    }
    
    if (!videos || videos.length === 0) return null;
    
    const first = videos[0];
    return { 
      title: he.decode(first.title || first.name || 'YouTube Video'), 
      url: first.url || `https://youtube.com/watch?v=${first.videoId}`,
      videoId: first.videoId || extractVideoId(first.url),
      thumbnail: first.thumbnail || first.image,
      author: {
        name: first.author?.name || first.channel?.name || 'YouTube Channel',
        avatar: first.author?.avatar || first.channel?.avatar || ''
      },
      views: first.views || 0,
      duration: first.duration?.timestamp || first.timestamp || '0:00',
      description: first.description || 'No description available',
      seconds: first.duration?.seconds || first.seconds || 0
    };
  } catch (error) {
    console.error('Search error:', error);
    return null;
  }
}

function extractVideoId(url) {
  if (!url) return null;
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

function formatNumber(num) {
  if (!num || num === 0) return "0";
  
  // Handle string numbers with commas
  if (typeof num === 'string') {
    num = parseInt(num.replace(/,/g, ''));
    if (isNaN(num)) return "0";
  }
  
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Get file size from URL using HEAD request
async function getFileSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    
    if (contentLength) {
      const sizeMB = parseInt(contentLength) / (1024 * 1024);
      return `${sizeMB.toFixed(1)} MB`;
    }
  } catch (error) {
    console.error('Error getting file size:', error);
  }
  
  return null;
}

// Generate formats based on available qualities from scraper
function generateFormatsFromScraper(scraperResult) {
  const formats = [];
  
  if (!scraperResult || !scraperResult.download) return formats;
  
  // Handle MP3 formats
  if (scraperResult.download.availableQuality && Array.isArray(scraperResult.download.availableQuality)) {
    scraperResult.download.availableQuality.forEach(quality => {
      formats.push({
        quality: `${quality} kbps`,
        bitrate: quality.toString(),
        type: 'audio',
        ext: 'mp3',
        fileSize: 'Checking...', // Will be updated later
        itag: `mp3_${quality}`
      });
    });
  }
  
  // Handle MP4 formats (assuming common qualities)
  const videoQualities = [144, 240, 360, 480, 720, 1080];
  videoQualities.forEach(quality => {
    formats.push({
      quality: `${quality}p`,
      bitrate: quality.toString(),
      type: 'video',
      ext: 'mp4',
      fileSize: 'Checking...',
      itag: quality.toString()
    });
  });
  
  return formats;
}

// Get metadata using the scraper
async function getVideoMetadata(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    
    // Get metadata from scraper
    const metaResult = await metadata(videoUrl);
    
    if (!metaResult) {
      // Fallback metadata
      return {
        title: 'YouTube Video',
        thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : '',
        author: {
          name: 'YouTube Channel',
          avatar: videoId ? `https://i.ytimg.com/vi/${videoId}/default.jpg` : ''
        },
        views: 0,
        duration: '0:00',
        description: 'No description available',
        uploadDate: 'Unknown'
      };
    }
    
    // Parse metadata from different response formats
    const metadata = {
      title: metaResult.title || metaResult.name || 'YouTube Video',
      thumbnail: metaResult.image || metaResult.thumbnails?.[0]?.url || 
                (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : ''),
      author: {
        name: metaResult.author?.name || metaResult.channel?.title || 'YouTube Channel',
        avatar: metaResult.author?.avatar || metaResult.channel?.avatar || 
                (videoId ? `https://i.ytimg.com/vi/${videoId}/default.jpg` : '')
      },
      views: metaResult.views || metaResult.statistics?.view || 0,
      duration: metaResult.duration?.timestamp || metaResult.timestamp || '0:00',
      description: metaResult.description || 'No description available',
      uploadDate: metaResult.ago || metaResult.published_format || 'Unknown',
      likes: metaResult.likes || metaResult.statistics?.like || 0
    };
    
    return metadata;
  } catch (error) {
    console.error('Metadata error:', error);
    return null;
  }
}

// Main API handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, type = 'mp4', quality = '360' } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: "YouTube URL or search term is required" });
  }

  let videoUrl = query;
  const ytRegex = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  
  // If not a YouTube URL, search for it
  if (!ytRegex.test(videoUrl)) {
    const first = await findFirstVideo(videoUrl);
    if (!first) {
      return res.status(404).json({ error: "No YouTube video found for your search" });
    }
    videoUrl = first.url;
    
    // If type is 'info', return metadata only
    if (type === 'info') {
      const videoMetadata = await getVideoMetadata(videoUrl);
      if (!videoMetadata) {
        return res.status(500).json({ error: "Failed to fetch video metadata" });
      }
      
      // Get formats by making a test request
      let formats = [];
      try {
        // Get MP3 formats
        const mp3Test = await ytmp3(videoUrl, 128);
        formats = generateFormatsFromScraper(mp3Test);
      } catch (error) {
        console.error('Error getting formats:', error);
        // Fallback to default formats
        formats = generateFormatsFromScraper(null);
      }
      
      return res.status(200).json({
        metadata: videoMetadata,
        formats: formats
      });
    }
  }

  try {
    let scraperResult;
    const parsedQuality = parseInt(quality) || 360;
    
    // Get video metadata
    const videoMetadata = await getVideoMetadata(videoUrl);
    
    if (type === 'mp3') {
      // Download as MP3
      scraperResult = await ytmp3(videoUrl, parsedQuality);
      
      if (!scraperResult?.download?.url) {
        throw new Error("Failed to generate MP3 download URL");
      }
      
      // Get actual file size
      const fileSize = await getFileSize(scraperResult.download.url);
      
      res.status(200).json({
        url: scraperResult.download.url,
        filename: scraperResult.download.filename || 
                 `${videoMetadata.title.replace(/[^a-z0-9]/gi, '_')}_${parsedQuality}kbps.mp3`,
        metadata: videoMetadata,
        quality: `${parsedQuality}kbps`,
        type: 'mp3',
        fileSize: fileSize,
        availableQualities: scraperResult.download.availableQuality || [128]
      });
      
    } else {
      // Download as MP4
      scraperResult = await ytmp4(videoUrl, parsedQuality);
      
      if (!scraperResult?.download?.url) {
        throw new Error("Failed to generate MP4 download URL");
      }
      
      // Get actual file size
      const fileSize = await getFileSize(scraperResult.download.url);
      
      res.status(200).json({
        url: scraperResult.download.url,
        filename: scraperResult.download.filename || 
                 `${videoMetadata.title.replace(/[^a-z0-9]/gi, '_')}_${parsedQuality}p.mp4`,
        metadata: videoMetadata,
        quality: `${parsedQuality}p`,
        type: 'mp4',
        fileSize: fileSize,
        availableQualities: scraperResult.download.availableQuality || [360]
      });
    }
    
  } catch (err) {
    console.error("Download Error:", err);
    
    // Provide user-friendly error messages
    let errorMessage = "Error downloading video. Please try again.";
    
    if (err.message.includes("Not Found") || err.message.includes("404")) {
      errorMessage = "Video not found. Please check the URL.";
    } else if (err.message.includes("Private") || err.message.includes("unavailable")) {
      errorMessage = "This video is private or unavailable.";
    } else if (err.message.includes("Copyright") || err.message.includes("restricted")) {
      errorMessage = "This video cannot be downloaded due to copyright restrictions.";
    } else if (err.message.includes("network") || err.message.includes("timeout")) {
      errorMessage = "Network error. Please check your connection.";
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

// Helper function to get actual file sizes for all formats
export async function getFormatsWithSizes(videoUrl) {
  const formats = [];
  
  try {
    // Get MP3 formats with sizes
    const mp3Qualities = [64, 92, 128, 256, 320];
    
    for (const quality of mp3Qualities) {
      try {
        const result = await ytmp3(videoUrl, quality);
        if (result?.download?.url) {
          const fileSize = await getFileSize(result.download.url);
          
          formats.push({
            quality: `${quality} kbps`,
            bitrate: quality.toString(),
            type: 'audio',
            ext: 'mp3',
            fileSize: fileSize || 'Unknown',
            itag: `mp3_${quality}`,
            url: result.download.url,
            available: true
          });
        }
      } catch (error) {
        console.log(`MP3 ${quality}kbps not available`);
      }
    }
    
    // Get MP4 formats with sizes
    const mp4Qualities = [144, 240, 360, 480, 720, 1080];
    
    for (const quality of mp4Qualities) {
      try {
        const result = await ytmp4(videoUrl, quality);
        if (result?.download?.url) {
          const fileSize = await getFileSize(result.download.url);
          
          formats.push({
            quality: `${quality}p`,
            bitrate: quality.toString(),
            type: 'video',
            ext: 'mp4',
            fileSize: fileSize || 'Unknown',
            itag: quality.toString(),
            url: result.download.url,
            available: true
          });
        }
      } catch (error) {
        console.log(`MP4 ${quality}p not available`);
      }
    }
    
  } catch (error) {
    console.error('Error getting formats with sizes:', error);
  }
  
  return formats;
}
