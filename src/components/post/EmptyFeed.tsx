import { Compass } from "lucide-react";

export function EmptyFeed() {
  return (
    <div className="text-center py-16 px-4">
      {/* Decorative illustration placeholder */}
      <div className="relative inline-block mb-6">
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-saffron/20 to-india-green/20 flex items-center justify-center">
          <Compass className="h-16 w-16 text-saffron" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-india-green/20 flex items-center justify-center">
          <span className="text-2xl">✈️</span>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-navy mb-2">
        Eventyret starter snart!
      </h2>
      <p className="text-muted-foreground max-w-md mx-auto">
        Vi er i gang med at pakke taskerne og gøre klar til vores store Indien-eventyr. 
        Kom tilbage snart for at følge med i rejsen!
      </p>

      {/* Decorative route preview */}
      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="px-3 py-1 bg-saffron/10 rounded-full">Delhi</span>
        <span>→</span>
        <span className="px-3 py-1 bg-saffron/10 rounded-full">Jaipur</span>
        <span>→</span>
        <span className="px-3 py-1 bg-saffron/10 rounded-full">Goa</span>
        <span>→</span>
        <span className="px-3 py-1 bg-india-green/10 rounded-full">Kerala</span>
      </div>
    </div>
  );
}

