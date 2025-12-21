import { createClient } from "@/lib/supabase/server";
import { JourneyClient } from "./JourneyClient";
import type { Metadata } from "next";
import { getIsAuthor } from "@/lib/author";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Rejserute",
  description: "Se hele rejseruten gennem Indien på kortet",
};

// Redirect to home page - map is now integrated there
export default async function JourneyPage() {
  redirect("/?view=map");
}
