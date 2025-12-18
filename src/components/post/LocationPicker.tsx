"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Search, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: { lat: number; lng: number; name: string } | null;
  onChange: (location: { lat: number; lng: number; name: string } | null) => void;
  disabled?: boolean;
}

export function LocationPicker({ value, onChange, disabled }: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Search for locations using Mapbox Geocoding
  const searchLocations = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchQuery
        )}.json?access_token=${token}&types=place,locality,neighborhood,address,poi&limit=5&country=in`
      );

      if (!response.ok) throw new Error("Geocoding failed");

      const data = await response.json();

      const locations: LocationResult[] = data.features.map(
        (feature: { id: string; place_name: string; center: [number, number] }) => ({
          id: feature.id,
          name: feature.place_name,
          lng: feature.center[0],
          lat: feature.center[1],
        })
      );

      setResults(locations);
    } catch (error) {
      console.error("Location search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (query) {
        searchLocations(query);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchLocations]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectLocation = (location: LocationResult) => {
    onChange({
      lat: location.lat,
      lng: location.lng,
      name: location.name,
    });
    setQuery("");
    setShowResults(false);
    setResults([]);
  };

  const clearLocation = () => {
    onChange(null);
  };

  // Reverse geocode from coordinates
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=place,locality,neighborhood&limit=1`
      );

      if (!response.ok) throw new Error("Reverse geocoding failed");

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        return data.features[0].place_name;
      }
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }, []);

  // If we have coordinates but no name, do reverse geocoding
  useEffect(() => {
    if (value?.lat && value?.lng && !value?.name) {
      reverseGeocode(value.lat, value.lng).then((name) => {
        onChange({ ...value, name });
      });
    }
  }, [value, onChange, reverseGeocode]);

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        // Show selected location
        <div className="flex items-center gap-2 p-3 bg-india-green/10 border border-india-green/20 rounded-lg">
          <MapPin className="h-5 w-5 text-india-green flex-shrink-0" />
          <span className="flex-1 text-sm truncate">{value.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearLocation}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        // Show search input
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Søg efter sted i Indien..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-10 pr-10"
            disabled={disabled}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
        </div>
      )}

      {/* Search results dropdown */}
      {showResults && results.length > 0 && !value && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => selectLocation(result)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-start gap-3",
                "border-b border-border last:border-b-0"
              )}
            >
              <MapPin className="h-4 w-4 text-saffron mt-0.5 flex-shrink-0" />
              <span className="text-sm">{result.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

