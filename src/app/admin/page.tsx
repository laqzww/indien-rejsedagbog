import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, FileText, LogOut, Settings, Route } from "lucide-react";
import { RecentPostsList } from "@/components/admin/RecentPostsList";

const INITIAL_POSTS_LIMIT = 20;

export default async function AdminPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();

  const { data: posts, count } = await supabase
    .from("posts")
    .select("id, body, location_name, created_at", { count: "exact" })
    .eq("author_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(INITIAL_POSTS_LIMIT);
  
  const totalPosts = count || 0;
  const hasMorePosts = totalPosts > INITIAL_POSTS_LIMIT;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header with actions */}
      <div className="flex justify-end gap-2 mb-8">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Indstillinger
          </Button>
        </Link>
        <form action="/auth/signout" method="POST">
          <Button variant="ghost" size="sm" type="submit" className="gap-2">
            <LogOut className="h-4 w-4" />
            Log ud
          </Button>
        </form>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Link href="/admin/new" className="block">
          <Card className="h-full hover:border-saffron hover:shadow-md transition-all cursor-pointer group">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-full bg-saffron/10 text-saffron group-hover:bg-saffron group-hover:text-white transition-colors">
                <PlusCircle className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-navy">Nyt opslag</h2>
                <p className="text-muted-foreground">Del et øjeblik fra rejsen</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/timeline" className="block">
          <Card className="h-full hover:border-india-green hover:shadow-md transition-all cursor-pointer group">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-full bg-india-green/10 text-india-green group-hover:bg-india-green group-hover:text-white transition-colors">
                <Route className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-navy">Rediger rejserute</h2>
                <p className="text-muted-foreground">Tilføj og rediger destinationer</p>
              </div>
            </CardContent>
          </Card>
        </Link>

      </div>

      {/* All posts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-saffron" />
            Alle opslag
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecentPostsList 
            initialPosts={posts || []} 
            initialTotal={totalPosts}
            initialHasMore={hasMorePosts}
          />
        </CardContent>
      </Card>
    </div>
  );
}

