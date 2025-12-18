import exifr from "exifr";
import type { Json } from "@/types/database";

export interface ExifData {
  lat?: number;
  lng?: number;
  capturedAt?: Date;
  width?: number;
  height?: number;
  cameraMake?: string;
  cameraModel?: string;
  raw?: Json;
}

export async function extractExifData(file: File): Promise<ExifData> {
  try {
    const exif = await exifr.parse(file, {
      gps: true,
      pick: [
        "GPSLatitude",
        "GPSLongitude",
        "DateTimeOriginal",
        "CreateDate",
        "ImageWidth",
        "ImageHeight",
        "ExifImageWidth",
        "ExifImageHeight",
        "Make",
        "Model",
      ],
    });

    if (!exif) {
      return {};
    }

    // Get GPS coordinates
    let lat: number | undefined;
    let lng: number | undefined;

    if (exif.latitude !== undefined && exif.longitude !== undefined) {
      lat = exif.latitude;
      lng = exif.longitude;
    }

    // Get capture date
    let capturedAt: Date | undefined;
    if (exif.DateTimeOriginal) {
      capturedAt = new Date(exif.DateTimeOriginal);
    } else if (exif.CreateDate) {
      capturedAt = new Date(exif.CreateDate);
    }

    // Get dimensions
    const width = exif.ExifImageWidth || exif.ImageWidth;
    const height = exif.ExifImageHeight || exif.ImageHeight;

    return {
      lat,
      lng,
      capturedAt,
      width,
      height,
      cameraMake: exif.Make,
      cameraModel: exif.Model,
      raw: exif as Json,
    };
  } catch (error) {
    console.error("Failed to parse EXIF data:", error);
    return {};
  }
}

export function formatGpsCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

