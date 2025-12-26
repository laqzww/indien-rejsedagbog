"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Save,
  Loader2,
  MapPin,
  Calendar,
  FileText,
  Search,
  ImageIcon,
  Upload,
  X,
} from "lucide-react";
import type { Milestone } from "@/types/database";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";

interface LocationResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface MilestoneFormProps {
  milestone?: Milestone;
  onSubmit: (data: Omit<Milestone, "id" | "created_at">, coverImageFile?: File) => Promise<boolean>;
  onCancel: () => void;
  title: string;
}

export function MilestoneForm({
  milestone,
  onSubmit,
  onCancel,
  title,
}: MilestoneFormProps) {
  const [name, setName] = useState(milestone?.name || "");
  const [description, setDescription] = useState(milestone?.description || "");
  const [lat, setLat] = useState<number | "">(milestone?.lat ?? "");
  const [lng, setLng] = useState<number | "">(milestone?.lng ?? "");
  const [arrivalDate, setArrivalDate] = useState(
    milestone?.arrival_date ? milestone.arrival_date.split("T")[0] : ""
  );
  const [departureDate, setDepartureDate] = useState(
    milestone?.departure_date ? milestone.departure_date.split("T")[0] : ""
  );
  const [displayOrder] = useState(milestone?.display_order ?? 0);

  // Cover image state
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(
    milestone?.cover_image_path ? getMediaUrl(milestone.cover_image_path) : null
  );
  const [existingCoverPath] = useState(milestone?.cover_image_path || null);
  const [removeCover, setRemoveCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Location search state
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedLocationName, setSelectedLocationName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search for locations using Mapbox Geocoding
  const searchLocations = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setLocationResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchQuery
        )}.json?access_token=${token}&types=place,locality,region,country&limit=5`
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

      setLocationResults(locations);
    } catch (error) {
      console.error("Location search failed:", error);
      setLocationResults([]);
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
      if (locationQuery) {
        searchLocations(locationQuery);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [locationQuery, searchLocations]);

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
    setLat(location.lat);
    setLng(location.lng);
    setSelectedLocationName(location.name);
    setLocationQuery("");
    setShowResults(false);
    setLocationResults([]);
  };

  // Handle cover image selection
  const handleCoverImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Kun billeder er tilladt");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Billedet må max være 5MB");
      return;
    }

    setCoverImageFile(file);
    setRemoveCover(false);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setCoverImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle cover image removal
  const handleRemoveCover = () => {
    setCoverImageFile(null);
    setCoverImagePreview(null);
    setRemoveCover(true);
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      setError("Navn er påkrævet");
      return;
    }

    if (lat === "" || lng === "") {
      setError("Vælg venligst en lokation");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Determine cover_image_path value
    let coverImagePath: string | null = existingCoverPath;
    if (removeCover) {
      coverImagePath = null;
    }
    // Note: If a new file is selected, the path will be set by the parent component after upload

    const data: Omit<Milestone, "id" | "created_at"> = {
      name: name.trim(),
      description: description.trim() || null,
      lat: Number(lat),
      lng: Number(lng),
      arrival_date: arrivalDate || null,
      departure_date: departureDate || null,
      display_order: displayOrder,
      cover_image_path: coverImagePath,
    };

    const success = await onSubmit(data, coverImageFile || undefined);
    
    if (!success) {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4 mb-6">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-bold text-navy">{title}</h2>
      </div>

      {/* Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-saffron" />
            Destinationsnavn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="F.eks. Delhi, Varanasi, Goa..."
            disabled={isSubmitting}
            className="text-base"
          />
        </CardContent>
      </Card>

      {/* Cover Image */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-india-green" />
            Cover-billede (valgfri)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload et billede der viser byen eller området. Vises i karrusellen på kortet.
          </p>

          {/* Preview */}
          {coverImagePreview && (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
              <Image
                src={coverImagePreview}
                alt="Cover preview"
                fill
                className="object-cover"
              />
              <button
                type="button"
                onClick={handleRemoveCover}
                disabled={isSubmitting}
                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
                title="Fjern billede"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Upload button */}
          {!coverImagePreview && (
            <label
              className={cn(
                "flex flex-col items-center justify-center w-full aspect-video",
                "border-2 border-dashed border-muted-foreground/25 rounded-lg",
                "hover:border-saffron/50 hover:bg-saffron/5 transition-colors cursor-pointer",
                isSubmitting && "opacity-50 cursor-not-allowed"
              )}
            >
              <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <span className="text-sm text-muted-foreground">
                Klik for at vælge billede
              </span>
              <span className="text-xs text-muted-foreground/70 mt-1">
                Max 5MB · JPG, PNG, WebP
              </span>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverImageSelect}
                disabled={isSubmitting}
                className="hidden"
              />
            </label>
          )}

          {/* Change button when image exists */}
          {coverImagePreview && (
            <label
              className={cn(
                "flex items-center justify-center gap-2 w-full py-2",
                "border border-muted-foreground/25 rounded-lg",
                "hover:border-saffron/50 hover:bg-saffron/5 transition-colors cursor-pointer",
                "text-sm text-muted-foreground",
                isSubmitting && "opacity-50 cursor-not-allowed"
              )}
            >
              <Upload className="h-4 w-4" />
              Skift billede
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverImageSelect}
                disabled={isSubmitting}
                className="hidden"
              />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-india-green" />
            Lokation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Location search */}
          <div ref={containerRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Søg efter sted..."
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                className="pl-10 pr-10"
                disabled={isSubmitting}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              )}
            </div>

            {/* Search results dropdown */}
            {showResults && locationResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in">
                {locationResults.map((result) => (
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

          {/* Selected location indicator */}
          {selectedLocationName && (
            <div className="flex items-center gap-2 p-3 bg-india-green/10 border border-india-green/20 rounded-lg">
              <MapPin className="h-5 w-5 text-india-green flex-shrink-0" />
              <span className="flex-1 text-sm truncate">{selectedLocationName}</span>
            </div>
          )}

          {/* Manual coordinate inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Breddegrad (lat)
              </label>
              <Input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : "")}
                placeholder="20.5937"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Længdegrad (lng)
              </label>
              <Input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : "")}
                placeholder="78.9629"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-navy" />
            Datoer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Ankomstdato
              </label>
              <Input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Afrejsedato (valgfri)
              </label>
              <Input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Opslag grupperes automatisk under destinationer baseret på deres optagelsesdato.
          </p>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            📝 Beskrivelse (valgfri)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="En kort beskrivelse af destinationen..."
            className="min-h-[100px]"
            disabled={isSubmitting}
          />
        </CardContent>
      </Card>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          Annuller
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gemmer...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Gem destination
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
