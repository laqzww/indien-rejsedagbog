import { createClient } from "@/lib/supabase/server";
import { TimelineEditor } from "./TimelineEditor";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function TimelinePage() {
  const supabase = await createClient();

  // Fetch all milestones ordered by display_order
  const { data: milestones } = await supabase
    .from("milestones")
    .select("*")
    .order("display_order", { ascending: true });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-navy">Rediger Rejserute</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tilføj, rediger og sorter destinationer på tidslinjen
          </p>
        </div>
      </div>

      <TimelineEditor initialMilestones={milestones || []} />
    </div>
  );
}
