"use client";

// HEIC conversion utility - client-side only
export async function convertHeicToJpeg(file: File): Promise<Blob> {
  // Dynamic import to avoid SSR issues
  const heic2any = (await import("heic2any")).default;
  
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });

  // heic2any can return a single blob or array of blobs
  if (Array.isArray(result)) {
    return result[0];
  }
  return result;
}

export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

export function isLivePhotoVideo(file: File): boolean {
  // iOS Live Photos have a .MOV companion file
  const name = file.name.toLowerCase();
  return name.endsWith(".mov") && file.size < 10 * 1024 * 1024; // Usually < 10MB
}

export function findLivePhotoMatch(
  heicFile: File,
  allFiles: File[]
): File | undefined {
  // Match HEIC with MOV that has same base name
  const baseName = heicFile.name.replace(/\.(heic|heif)$/i, "");
  
  return allFiles.find((f) => {
    const name = f.name.toLowerCase();
    return name === `${baseName.toLowerCase()}.mov`;
  });
}

