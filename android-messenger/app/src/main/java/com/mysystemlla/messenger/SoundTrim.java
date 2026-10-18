package com.mysystemlla.messenger;

import android.content.Context;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.net.Uri;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;

/** Copies a chosen song/video to our cache and cuts out one part of it (no extra libraries). */
final class SoundTrim {
    private SoundTrim() { }

    /** Copies the picked file. Returns false when it is bigger than maxBytes. */
    static boolean copy(Context c, Uri u, File dest, long maxBytes) {
        try (InputStream is = c.getContentResolver().openInputStream(u); FileOutputStream fo = new FileOutputStream(dest)) {
            byte[] buf = new byte[16384];
            long total = 0; int n;
            while ((n = is.read(buf)) > 0) {
                total += n;
                if (total > maxBytes) return false;
                fo.write(buf, 0, n);
            }
            return total > 0;
        } catch (Throwable t) { return false; }
    }

    static long durationMs(File f) {
        try {
            MediaMetadataRetriever mr = new MediaMetadataRetriever();
            mr.setDataSource(f.getAbsolutePath());
            String d = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            mr.release();
            return d == null ? 0 : Long.parseLong(d);
        } catch (Throwable t) { return 0; }
    }

    static boolean isMp3(File f) {
        try (FileInputStream is = new FileInputStream(f)) {
            byte[] h = new byte[4];
            if (is.read(h) < 4) return false;
            if (h[0] == 'I' && h[1] == 'D' && h[2] == '3') return true;
            return (h[0] & 0xFF) == 0xFF && (h[1] & 0xE0) == 0xE0;
        } catch (Throwable t) { return false; }
    }

    /**
     * Cuts [startMs, startMs+lenMs) into out. Returns the mime of the result ("audio/mpeg" or "audio/mp4"), or null when
     * the file type cannot be cut. MP3 is cut by position; MP3-less files (M4A / MP4 video with AAC sound) are cut cleanly.
     */
    static String trim(File src, long startMs, long lenMs, long durMs, File out) {
        try {
            if (out.exists()) out.delete();
            if (isMp3(src)) return trimMp3(src, startMs, lenMs, durMs, out) ? "audio/mpeg" : null;
            return trimAac(src, startMs, lenMs, out) ? "audio/mp4" : null;
        } catch (Throwable t) { return null; }
    }

    private static boolean trimMp3(File src, long startMs, long lenMs, long durMs, File out) throws Exception {
        long size = src.length();
        try (RandomAccessFile raf = new RandomAccessFile(src, "r")) {
            long audioStart = 0;
            byte[] h = new byte[10];
            raf.readFully(h);
            if (h[0] == 'I' && h[1] == 'D' && h[2] == '3') {       // skip the ID3 tag (title/cover art)
                audioStart = 10 + (((h[6] & 0x7F) << 21) | ((h[7] & 0x7F) << 14) | ((h[8] & 0x7F) << 7) | (h[9] & 0x7F));
            }
            if (durMs <= 0 || audioStart >= size) return false;
            double perMs = (double) (size - audioStart) / durMs;
            long from = audioStart + (long) (startMs * perMs);
            long to = Math.min(size, from + (long) (lenMs * perMs));
            // line up on the next MP3 frame start
            raf.seek(from);
            byte[] probe = new byte[4096];
            int got = raf.read(probe);
            int skip = 0;
            for (int i = 0; i + 1 < got; i++) { if ((probe[i] & 0xFF) == 0xFF && (probe[i + 1] & 0xE0) == 0xE0) { skip = i; break; } }
            from += skip;
            raf.seek(from);
            try (FileOutputStream fo = new FileOutputStream(out)) {
                byte[] buf = new byte[16384];
                long left = to - from;
                while (left > 0) {
                    int n = raf.read(buf, 0, (int) Math.min(buf.length, left));
                    if (n <= 0) break;
                    fo.write(buf, 0, n);
                    left -= n;
                }
            }
        }
        return out.length() > 600;
    }

    private static boolean trimAac(File src, long startMs, long lenMs, File out) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mx = null;
        boolean started = false;
        try {
            ex.setDataSource(src.getAbsolutePath());
            int track = -1;
            MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) { track = i; fmt = f; break; }
            }
            if (track < 0 || fmt == null || !"audio/mp4a-latm".equals(fmt.getString(MediaFormat.KEY_MIME))) return false;
            ex.selectTrack(track);
            mx = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int dst = mx.addTrack(fmt);
            mx.start();
            started = true;
            long startUs = startMs * 1000L, endUs = startUs + lenMs * 1000L;
            ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            ByteBuffer buf = ByteBuffer.allocate(1 << 20);
            android.media.MediaCodec.BufferInfo info = new android.media.MediaCodec.BufferInfo();
            long first = -1;
            while (true) {
                buf.clear();
                int n = ex.readSampleData(buf, 0);
                if (n < 0) break;
                long t = ex.getSampleTime();
                if (t > endUs) break;
                if (first < 0) first = t;
                info.offset = 0;
                info.size = n;
                info.presentationTimeUs = Math.max(0, t - first);
                info.flags = (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? android.media.MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                mx.writeSampleData(dst, buf, info);
                ex.advance();
            }
            mx.stop();
            started = false;
            return out.length() > 600;
        } finally {
            try { if (mx != null) { if (started) mx.stop(); mx.release(); } } catch (Throwable ignored) { }
            ex.release();
        }
    }
}
