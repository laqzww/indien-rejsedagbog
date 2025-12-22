-- Migration: Add thumbnail_path column to media table
-- This column stores the path to a JPEG thumbnail image for video files
-- The thumbnail is used for fast loading previews (click-to-play pattern)

-- Add the thumbnail_path column
ALTER TABLE public.media 
ADD COLUMN IF NOT EXISTS thumbnail_path TEXT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.media.thumbnail_path IS 'Storage path for video thumbnail image (JPEG). Used for fast-loading video previews.';

-- Optional: Create an index if you need to query videos without thumbnails frequently
-- CREATE INDEX IF NOT EXISTS idx_media_video_no_thumbnail 
-- ON public.media (type) 
-- WHERE type = 'video' AND thumbnail_path IS NULL;
