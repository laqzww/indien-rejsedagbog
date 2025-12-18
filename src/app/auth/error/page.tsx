import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ reason?: string; redirect?: string }>;
}

export default async function AuthErrorPage({ searchParams }: PageProps) {
  const { reason, redirect } = await searchParams;
  const goTo = redirect || "/admin";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-white via-orange-50 to-green-50">
      <Card className="w-full max-w-md border-saffron/20 shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-navy">Login fejlede</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Der skete en fejl under login.
          </p>
          {reason && (
            <p className="text-sm text-muted-foreground">
              Årsag: <span className="font-medium text-foreground">{reason}</span>
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Link href={`/login?redirect=${encodeURIComponent(goTo)}`}>
              <Button className="w-full">Tilbage til login</Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full">Tilbage til forsiden</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
