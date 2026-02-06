-- Migration: Add video compression metadata columns to media table
-- Tracks compression status, codec, original/compressed sizes, and settings
-- Used to support client-side video compression before upload and batch re-compression of existing videos

-- Whether this media file has been compressed
ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN NOT NULL DEFAULT FALSE;

-- Original file size in bytes (before compression)
ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS original_size BIGINT NULL;

-- Compressed file size in bytes (after compression)
ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS compressed_size BIGINT NULL;

-- Codec used for compression (e.g., 'h264', 'h265', 'av1')
ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS compression_codec TEXT NULL;

-- Full compression settings as JSON (CRF, preset, resolution, bitrate, etc.)
ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS compression_settings JSONB NULL;

-- Path to the compressed version in storage (if different from storage_path)
ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS compressed_storage_path TEXT NULL;

-- Original width/height before compression (stored separately since width/height may be updated)
ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS original_width INTEGER NULL;

ALTER TABLE public.media
ADD COLUMN IF NOT EXISTS original_height INTEGER NULL;

-- Comments
COMMENT ON COLUMN public.media.is_compressed IS 'Whether this media file has been compressed';
COMMENT ON COLUMN public.media.original_size IS 'Original file size in bytes before compression';
COMMENT ON COLUMN public.media.compressed_size IS 'Compressed file size in bytes after compression';
COMMENT ON COLUMN public.media.compression_codec IS 'Video codec used for compression (h264, h265, av1)';
COMMENT ON COLUMN public.media.compression_settings IS 'Full compression settings as JSON (crf, preset, maxResolution, etc.)';
COMMENT ON COLUMN public.media.compressed_storage_path IS 'Storage path for compressed version (if stored separately from original)';
COMMENT ON COLUMN public.media.original_width IS 'Original video width before compression/downscale';
COMMENT ON COLUMN public.media.original_height IS 'Original video height before compression/downscale';

-- Index for finding uncompressed videos (useful for batch compression admin tool)
CREATE INDEX IF NOT EXISTS idx_media_uncompressed_videos
ON public.media (type, is_compressed)
WHERE type = 'video' AND is_compressed = FALSE;
