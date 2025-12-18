import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, FileText, MapPin, LogOut, Settings, Pencil } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";

export default async function AdminPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user!.id)
    .single();

  const { data: recentPosts } = await supabase
    .from("posts")
    .select("id, body, location_name, created_at")
    .eq("author_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: totalPosts } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("author_id", user!.id);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-navy">
            Hej, {profile?.display_name || "Rejsende"}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Hvad vil du dele i dag?
          </p>
        </div>
        <div className="flex items-center gap-2">
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

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 rounded-full bg-india-green/10 text-india-green">
              <FileText className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-navy">{totalPosts || 0}</h2>
              <p className="text-muted-foreground">Opslag i alt</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent posts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-saffron" />
            Seneste opslag
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentPosts && recentPosts.length > 0 ? (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <div 
                  key={post.id} 
                  className="flex items-start gap-2 p-3 rounded-lg hover:bg-muted transition-colors group"
                >
                  <Link 
                    href={`/post/${post.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {post.body.slice(0, 80)}...
                        </p>
                        {post.location_name && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {post.location_name}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeDate(post.created_at)}
                      </span>
                    </div>
                  </Link>
                  <Link 
                    href={`/admin/edit/${post.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-saffron">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Du har ikke skrevet nogen opslag endnu.</p>
              <Link href="/admin/new">
                <Button variant="link" className="mt-2">
                  Skriv dit første opslag →
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

