#!/usr/bin/env node

/**
 * One-time script to optimize existing videos in Supabase Storage
 * 
 * Prerequisites:
 * - FFmpeg must be installed locally (brew install ffmpeg / apt install ffmpeg)
 * - Set environment variables or create a .env.local file
 * 
 * Usage:
 *   node scripts/optimize-existing-videos.mjs
 *   node scripts/optimize-existing-videos.mjs --dry-run    # Preview without changes
 *   node scripts/optimize-existing-videos.mjs --force      # Re-optimize all videos
 * 
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (NOT anon key)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.local if it exists
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  });
}

// Configuration
const CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  storageBucket: 'media',
  tempDir: join(__dirname, '.temp-video-optimization'),
  
  // Compression settings (matching the client-side settings)
  maxWidth: 1920,
  maxHeight: 1080,
  videoBitrate: '2M',
  audioBitrate: '128k',
  fps: 30,
  crf: 28,
  
  // Only optimize videos larger than this (in bytes)
  minSizeToOptimize: 5 * 1024 * 1024, // 5MB
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// Progress tracking file
const PROGRESS_FILE = join(__dirname, '.optimization-progress.json');

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completed: [] };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Formatting helpers
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

// Check if FFmpeg is installed
function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Get video metadata using ffprobe
function getVideoMetadata(filePath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath}"`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(result);
    const videoStream = data.streams?.find(s => s.codec_type === 'video');
    
    return {
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      duration: parseFloat(data.format?.duration || 0),
      bitrate: parseInt(data.format?.bit_rate || 0),
      codec: videoStream?.codec_name || 'unknown',
    };
  } catch (error) {
    console.error('Error getting video metadata:', error.message);
    return null;
  }
}

// Compress video using FFmpeg
function compressVideo(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const metadata = getVideoMetadata(inputPath);
    if (!metadata) {
      reject(new Error('Could not read video metadata'));
      return;
    }
    
    // Calculate target dimensions
    let targetWidth = metadata.width;
    let targetHeight = metadata.height;
    
    if (metadata.width > CONFIG.maxWidth || metadata.height > CONFIG.maxHeight) {
      const ratio = Math.min(CONFIG.maxWidth / metadata.width, CONFIG.maxHeight / metadata.height);
      targetWidth = Math.floor((metadata.width * ratio) / 2) * 2;
      targetHeight = Math.floor((metadata.height * ratio) / 2) * 2;
    } else {
      // Ensure even dimensions
      targetWidth = Math.floor(metadata.width / 2) * 2;
      targetHeight = Math.floor(metadata.height / 2) * 2;
    }
    
    // Use scale filter that preserves aspect ratio
    // force_original_aspect_ratio=decrease ensures we fit within max dimensions
    // The second scale ensures even dimensions (required by H.264)
    const needsResize = metadata.width > CONFIG.maxWidth || metadata.height > CONFIG.maxHeight;
    let videoFilter;
    if (needsResize) {
      videoFilter = `scale='min(${CONFIG.maxWidth},iw)':'min(${CONFIG.maxHeight},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
    } else {
      videoFilter = `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
    }
    
    const ffmpegArgs = [
      '-y', // Overwrite output
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'medium', // Better compression than 'fast' for one-time processing
      '-crf', CONFIG.crf.toString(),
      '-maxrate', CONFIG.videoBitrate,
      '-bufsize', `${parseInt(CONFIG.videoBitrate) * 2}M`,
      '-vf', videoFilter,
      '-r', CONFIG.fps.toString(),
      '-c:a', 'aac',
      '-b:a', CONFIG.audioBitrate,
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      outputPath
    ];
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    let stderr = '';
    
    ffmpeg.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time_ms=')) {
          const timeMs = parseInt(line.split('=')[1]) / 1000000;
          const progress = Math.min(timeMs / metadata.duration, 1);
          onProgress?.(progress);
        }
      }
    });
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve({
          originalMetadata: metadata,
          targetWidth,
          targetHeight,
        });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log('\n🎬 Video Optimization Script for Supabase Storage');
  console.log('='.repeat(50));
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  // Validate configuration
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseServiceKey) {
    console.error('❌ Missing environment variables!');
    console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    console.error('   You can add them to .env.local file');
    process.exit(1);
  }
  
  // Check FFmpeg
  if (!checkFFmpeg()) {
    console.error('❌ FFmpeg is not installed!');
    console.error('   Install with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)');
    process.exit(1);
  }
  console.log('✅ FFmpeg found');
  
  // Create Supabase client with service role key
  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
    auth: { persistSession: false }
  });
  console.log('✅ Connected to Supabase');
  
  // Create temp directory
  if (!existsSync(CONFIG.tempDir)) {
    mkdirSync(CONFIG.tempDir, { recursive: true });
  }
  
  // Load progress
  const progress = loadProgress();
  
  // Fetch all video entries from the media table
  console.log('\n📋 Fetching video entries from database...');
  const { data: videos, error } = await supabase
    .from('media')
    .select('id, storage_path, post_id, width, height, mime_type')
    .eq('type', 'video');
  
  if (error) {
    console.error('❌ Error fetching videos:', error.message);
    process.exit(1);
  }
  
  if (!videos || videos.length === 0) {
    console.log('ℹ️  No videos found in the database.');
    process.exit(0);
  }
  
  console.log(`📹 Found ${videos.length} video(s) in database\n`);
  
  // Process each video
  let processed = 0;
  let optimized = 0;
  let skipped = 0;
  let failed = 0;
  let totalSavedBytes = 0;
  
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const videoNum = i + 1;
    
    console.log(`\n[${videoNum}/${videos.length}] Processing: ${video.storage_path}`);
    
    // Skip if already processed (unless --force)
    if (!FORCE && progress.completed.includes(video.id)) {
      console.log('   ⏭️  Already processed, skipping');
      skipped++;
      continue;
    }
    
    try {
      // Download video from Supabase Storage
      console.log('   ⬇️  Downloading...');
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(CONFIG.storageBucket)
        .download(video.storage_path);
      
      if (downloadError) {
        throw new Error(`Download failed: ${downloadError.message}`);
      }
      
      const originalSize = fileData.size;
      console.log(`   📦 Original size: ${formatBytes(originalSize)}`);
      
      // Skip small files
      if (originalSize < CONFIG.minSizeToOptimize && !FORCE) {
        console.log(`   ⏭️  File too small (< ${formatBytes(CONFIG.minSizeToOptimize)}), skipping`);
        progress.completed.push(video.id);
        saveProgress(progress);
        skipped++;
        continue;
      }
      
      // Save to temp file
      const inputPath = join(CONFIG.tempDir, `input_${video.id}.mp4`);
      const outputPath = join(CONFIG.tempDir, `output_${video.id}.mp4`);
      
      const buffer = Buffer.from(await fileData.arrayBuffer());
      writeFileSync(inputPath, buffer);
      
      if (DRY_RUN) {
        const metadata = getVideoMetadata(inputPath);
        console.log(`   📐 Dimensions: ${metadata?.width}x${metadata?.height}`);
        console.log(`   ⏱️  Duration: ${metadata?.duration?.toFixed(1)}s`);
        console.log(`   🎥 Codec: ${metadata?.codec}`);
        console.log('   ✅ Would optimize this video');
        unlinkSync(inputPath);
        skipped++;
        continue;
      }
      
      // Compress video
      console.log('   🔄 Compressing...');
      let lastProgress = 0;
      await compressVideo(inputPath, outputPath, (p) => {
        const percent = Math.round(p * 100);
        if (percent >= lastProgress + 10) {
          process.stdout.write(`\r   🔄 Compressing... ${percent}%`);
          lastProgress = percent;
        }
      });
      console.log('\r   🔄 Compressing... 100%');
      
      // Check compressed size
      const compressedSize = statSync(outputPath).size;
      const savedBytes = originalSize - compressedSize;
      const savedPercent = savedBytes / originalSize;
      
      console.log(`   📦 Compressed size: ${formatBytes(compressedSize)} (saved ${formatBytes(savedBytes)}, ${formatPercent(savedPercent)})`);
      
      // Only upload if we actually saved space
      if (compressedSize < originalSize) {
        console.log('   ⬆️  Uploading optimized version...');
        
        const compressedBuffer = readFileSync(outputPath);
        
        // Upload with upsert to replace the original
        const { error: uploadError } = await supabase.storage
          .from(CONFIG.storageBucket)
          .upload(video.storage_path, compressedBuffer, {
            contentType: 'video/mp4',
            upsert: true,
          });
        
        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
        
        // Update media record with new dimensions if changed
        const newMetadata = getVideoMetadata(outputPath);
        if (newMetadata && (newMetadata.width !== video.width || newMetadata.height !== video.height)) {
          await supabase
            .from('media')
            .update({
              width: newMetadata.width,
              height: newMetadata.height,
              mime_type: 'video/mp4',
            })
            .eq('id', video.id);
        }
        
        totalSavedBytes += savedBytes;
        optimized++;
        console.log('   ✅ Optimization complete!');
      } else {
        console.log('   ⏭️  Compressed file is larger, keeping original');
        skipped++;
      }
      
      // Cleanup temp files
      if (existsSync(inputPath)) unlinkSync(inputPath);
      if (existsSync(outputPath)) unlinkSync(outputPath);
      
      // Save progress
      progress.completed.push(video.id);
      saveProgress(progress);
      processed++;
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`   Total videos: ${videos.length}`);
  console.log(`   Optimized: ${optimized}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  if (totalSavedBytes > 0) {
    console.log(`   Total space saved: ${formatBytes(totalSavedBytes)}`);
  }
  
  // Cleanup
  if (existsSync(CONFIG.tempDir)) {
    try {
      const { rmdirSync } = await import('fs');
      rmdirSync(CONFIG.tempDir);
    } catch {
      // Directory not empty, leave it
    }
  }
  
  if (!DRY_RUN && optimized > 0) {
    console.log('\n✨ Optimization complete! Progress saved to .optimization-progress.json');
    console.log('   Run with --force to re-optimize all videos');
  }
  
  console.log('');
}

main().catch(console.error);
