import { NextRequest, NextResponse } from "next/server";

interface OGData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    // Fetch the page
    const response = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IndienRejsedagbog/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch URL" },
        { status: 502 }
      );
    }

    const html = await response.text();

    // Parse OpenGraph and meta tags
    const ogData = parseOGData(html, parsedUrl.origin);

    return NextResponse.json({
      url: parsedUrl.href,
      title: ogData.title,
      description: ogData.description,
      image_url: ogData.image,
      site_name: ogData.siteName,
    });
  } catch (error) {
    console.error("OG scraping error:", error);
    return NextResponse.json(
      { error: "Failed to scrape OpenGraph data" },
      { status: 500 }
    );
  }
}

function parseOGData(html: string, origin: string): OGData {
  const getMetaContent = (property: string): string | null => {
    // Try og: prefix
    const ogMatch = html.match(
      new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i")
    );
    if (ogMatch) return ogMatch[1];

    // Try reversed order
    const ogMatch2 = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i")
    );
    if (ogMatch2) return ogMatch2[1];

    // Try name attribute
    const nameMatch = html.match(
      new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")
    );
    if (nameMatch) return nameMatch[1];

    // Try reversed
    const nameMatch2 = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i")
    );
    if (nameMatch2) return nameMatch2[1];

    return null;
  };

  // Get title
  let title = getMetaContent("title");
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();
  }

  // Get description
  const description = getMetaContent("description");

  // Get image
  let image = getMetaContent("image");
  if (image && !image.startsWith("http")) {
    // Convert relative URL to absolute
    image = new URL(image, origin).href;
  }

  // Get site name
  const siteName = getMetaContent("site_name");

  return {
    url: origin,
    title: title ? decodeHTMLEntities(title) : null,
    description: description ? decodeHTMLEntities(description) : null,
    image,
    siteName: siteName ? decodeHTMLEntities(siteName) : null,
  };
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

