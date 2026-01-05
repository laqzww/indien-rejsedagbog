import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/posts/new-count?since=<ISO timestamp>
 *
 * Returns the count of posts created after the given timestamp.
 * Used for badge notifications to show how many new posts there are.
 *
 * This endpoint is public (no auth required) since we want to show
 * badge count to all users who have installed the app.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get("since");

    // Validate the since parameter
    if (!since) {
      return NextResponse.json(
        { error: "Missing 'since' parameter" },
        { status: 400 }
      );
    }

    // Validate it's a valid ISO date
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'since' parameter - must be ISO date string" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Count posts created after the given timestamp
    const { count, error } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .gt("created_at", since);

    if (error) {
      console.error("Error counting new posts:", error);
      return NextResponse.json(
        { error: "Failed to count posts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      count: count || 0,
      since,
    });
  } catch (error) {
    console.error("New posts count API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
