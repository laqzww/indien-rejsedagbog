-- Migration: Add cover_image_path column to milestones table
-- This column stores the path to a cover image for each milestone
-- The cover image is displayed in the journey carousel to show the city/area

-- Add the cover_image_path column
ALTER TABLE public.milestones 
ADD COLUMN IF NOT EXISTS cover_image_path TEXT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.milestones.cover_image_path IS 'Storage path for milestone cover image. Displayed in the journey carousel to visually represent the destination.';
