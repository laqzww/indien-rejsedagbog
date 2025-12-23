import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const POSTS_PER_PAGE = 20;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get pagination parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || String(POSTS_PER_PAGE), 10);
    const offset = (page - 1) * limit;

    // Get posts with pagination
    const { data: posts, error, count } = await supabase
      .from("posts")
      .select("id, body, location_name, created_at", { count: "exact" })
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching posts:", error);
      return NextResponse.json(
        { error: "Failed to fetch posts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      posts: posts || [],
      total: count || 0,
      page,
      limit,
      hasMore: count ? offset + limit < count : false,
    });
  } catch (error) {
    console.error("Posts API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
