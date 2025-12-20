#!/usr/bin/env node

/**
 * Fix script for videos that lost rotation metadata during optimization
 * Re-processes videos with proper auto-rotation handling
 */

import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
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

const CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  storageBucket: 'media',
  tempDir: join(__dirname, '.temp-video-fix'),
  
  // Compression settings - preserve original aspect ratio
  videoBitrate: '2M',
  audioBitrate: '128k',
  crf: 28,
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Get video metadata including rotation
function getVideoMetadata(filePath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath}"`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(result);
    const videoStream = data.streams?.find(s => s.codec_type === 'video');
    
    // Check for rotation in side_data or tags
    let rotation = 0;
    if (videoStream?.side_data_list) {
      const displayMatrix = videoStream.side_data_list.find(s => s.side_data_type === 'Display Matrix');
      if (displayMatrix?.rotation) {
        rotation = displayMatrix.rotation;
      }
    }
    if (videoStream?.tags?.rotate) {
      rotation = parseInt(videoStream.tags.rotate);
    }
    
    return {
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      duration: parseFloat(data.format?.duration || 0),
      rotation: rotation,
      codec: videoStream?.codec_name || 'unknown',
    };
  } catch (error) {
    console.error('Error getting video metadata:', error.message);
    return null;
  }
}

// Re-encode video preserving aspect ratio with proper rotation handling
function reencodeVideo(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const metadata = getVideoMetadata(inputPath);
    if (!metadata) {
      reject(new Error('Could not read video metadata'));
      return;
    }
    
    console.log(`   📐 Detected: ${metadata.width}x${metadata.height}, rotation: ${metadata.rotation}°`);
    
    // FFmpeg auto-rotates by default, so we just need to ensure dimensions are even
    // Use scale filter that preserves aspect ratio and ensures even dimensions
    const ffmpegArgs = [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', CONFIG.crf.toString(),
      '-maxrate', CONFIG.videoBitrate,
      '-bufsize', `${parseInt(CONFIG.videoBitrate) * 2}M`,
      // Scale to ensure even dimensions while preserving aspect ratio
      // -2 means "keep aspect ratio, round to nearest even number"
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
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
        // Get output metadata to confirm dimensions
        const outputMeta = getVideoMetadata(outputPath);
        resolve({
          inputWidth: metadata.width,
          inputHeight: metadata.height,
          inputRotation: metadata.rotation,
          outputWidth: outputMeta?.width || 0,
          outputHeight: outputMeta?.height || 0,
        });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', reject);
  });
}

async function main() {
  console.log('\n🔧 Video Rotation Fix Script');
  console.log('='.repeat(50));
  
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseServiceKey) {
    console.error('❌ Missing environment variables!');
    process.exit(1);
  }
  
  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
    auth: { persistSession: false }
  });
  
  if (!existsSync(CONFIG.tempDir)) {
    mkdirSync(CONFIG.tempDir, { recursive: true });
  }
  
  // Fetch all video entries
  const { data: videos, error } = await supabase
    .from('media')
    .select('id, storage_path, width, height')
    .eq('type', 'video');
  
  if (error || !videos?.length) {
    console.log('No videos found');
    process.exit(0);
  }
  
  console.log(`📹 Found ${videos.length} video(s)\n`);
  
  let fixed = 0;
  
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.log(`\n[${i + 1}/${videos.length}] ${video.storage_path.split('/').pop()}`);
    console.log(`   Current DB dimensions: ${video.width}x${video.height}`);
    
    try {
      // Download
      console.log('   ⬇️  Downloading...');
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(CONFIG.storageBucket)
        .download(video.storage_path);
      
      if (downloadError) throw new Error(downloadError.message);
      
      const inputPath = join(CONFIG.tempDir, `input_${video.id}.mp4`);
      const outputPath = join(CONFIG.tempDir, `output_${video.id}.mp4`);
      
      const buffer = Buffer.from(await fileData.arrayBuffer());
      writeFileSync(inputPath, buffer);
      
      // Check actual dimensions of downloaded file
      const currentMeta = getVideoMetadata(inputPath);
      console.log(`   📐 Actual file: ${currentMeta?.width}x${currentMeta?.height}`);
      
      // Re-encode
      console.log('   🔄 Re-encoding with proper dimensions...');
      let lastProgress = 0;
      const result = await reencodeVideo(inputPath, outputPath, (p) => {
        const percent = Math.round(p * 100);
        if (percent >= lastProgress + 20) {
          process.stdout.write(`\r   🔄 Re-encoding... ${percent}%`);
          lastProgress = percent;
        }
      });
      console.log(`\r   🔄 Re-encoding... 100%`);
      console.log(`   📐 Output: ${result.outputWidth}x${result.outputHeight}`);
      
      // Upload
      console.log('   ⬆️  Uploading...');
      const compressedBuffer = readFileSync(outputPath);
      
      const { error: uploadError } = await supabase.storage
        .from(CONFIG.storageBucket)
        .upload(video.storage_path, compressedBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });
      
      if (uploadError) throw new Error(uploadError.message);
      
      // Update database with correct dimensions
      await supabase
        .from('media')
        .update({
          width: result.outputWidth,
          height: result.outputHeight,
          mime_type: 'video/mp4',
        })
        .eq('id', video.id);
      
      console.log(`   ✅ Fixed! Now ${result.outputWidth}x${result.outputHeight}`);
      fixed++;
      
      // Cleanup
      if (existsSync(inputPath)) unlinkSync(inputPath);
      if (existsSync(outputPath)) unlinkSync(outputPath);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Fixed ${fixed}/${videos.length} videos`);
  
  // Cleanup temp dir
  try {
    const { rmdirSync } = await import('fs');
    rmdirSync(CONFIG.tempDir);
  } catch {}
}

main().catch(console.error);
