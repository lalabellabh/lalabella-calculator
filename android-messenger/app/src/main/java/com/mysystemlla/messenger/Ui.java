package com.mysystemlla.messenger;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Colours, small view helpers, picture loading and wallpapers. */
final class Ui {
    private Ui() { }

    static final int ACC = 0xFF2F6570;       // brand teal
    static final int ACC2 = 0xFF3F8FA0;
    static final int INK = 0xFF1B2A2F;
    static final int MUTED = 0xFF7B8A90;
    static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ExecutorService POOL = Executors.newFixedThreadPool(3);
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(24 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount(); }
    };

    /** Set by the activities so the background service knows whether to stay quiet. */
    static volatile int visibleCount = 0;
    static volatile String openConv = "";
    static boolean appVisible() { return visibleCount > 0; }

    static final int[][] GRADS = {
            { 0xFF2F6570, 0xFF6BB5C4 }, { 0xFFFF9A9E, 0xFFFAD0C4 }, { 0xFF667EEA, 0xFF764BA2 }, { 0xFF11998E, 0xFF38EF7D },
            { 0xFFFDC830, 0xFFF37335 }, { 0xFF232526, 0xFF414345 }, { 0xFF89F7FE, 0xFF66A6FF }, { 0xFFC471F5, 0xFFFA71CD }
    };
    private static final int[] AV = { 0xFF2F6570, 0xFFC9506B, 0xFFB07D2B, 0xFF5F8F63, 0xFF7A5A9E, 0xFF3D6FA3 };

    static int colorFor(long id) { return AV[(int) (Math.abs(id) % AV.length)]; }

    static String initials(String n) {
        String s = n == null ? "" : n.trim();
        if (s.length() == 0) return "?";
        String[] w = s.split("\\s+");
        String r = w[0].substring(0, 1);
        if (w.length > 1) r += w[1].substring(0, 1);
        return r.toUpperCase(Locale.getDefault());
    }

    static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }
    static int screenW(Context c) { DisplayMetrics m = c.getResources().getDisplayMetrics(); return m.widthPixels; }
    static int screenH(Context c) { DisplayMetrics m = c.getResources().getDisplayMetrics(); return m.heightPixels; }

    static int alpha(int color, int percent) {
        int a = Math.round(255f * Math.max(0, Math.min(100, percent)) / 100f);
        return (color & 0x00FFFFFF) | (a << 24);
    }

    static GradientDrawable round(Context c, int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(c, radiusDp));
        return g;
    }

    static TextView tv(Context c, String text, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        return t;
    }

    static LinearLayout.LayoutParams lp(int w, int h) { return new LinearLayout.LayoutParams(w, h); }
    static LinearLayout.LayoutParams lpw(float weight) { return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weight); }

    /** Round badge with a number (unread count). */
    static TextView badge(Context c, int n) {
        TextView t = tv(c, n > 99 ? "99+" : String.valueOf(n), 11, Color.WHITE, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(round(c, 0xFFE5484D, 20));
        int h = dp(c, 3);
        t.setPadding(dp(c, 7), h, dp(c, 7), h);
        return t;
    }

    static void toast(Context c, String m) { android.widget.Toast.makeText(c, m, android.widget.Toast.LENGTH_SHORT).show(); }

    // ---------------- time ----------------
    static long parseIso(String iso) {
        try {
            if (iso == null || iso.length() < 19) return 0;
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(iso.substring(0, 19));
            return d == null ? 0 : d.getTime();
        } catch (Exception e) { return 0; }
    }
    static String clock(String iso) {
        long t = parseIso(iso);
        return t == 0 ? "" : new SimpleDateFormat("h:mm a", Locale.getDefault()).format(new Date(t));
    }
    static String ago(String iso) {
        long t = parseIso(iso);
        if (t == 0) return "";
        long m = Math.max(0, (System.currentTimeMillis() - t) / 60000);
        if (m < 1) return "just now";
        if (m < 60) return m + "m";
        if (m < 1440) return (m / 60) + "h";
        return (m / 1440) + "d";
    }

    // ---------------- pictures ----------------
    interface BmpCb { void done(Bitmap b); }

    static Bitmap decode(byte[] data, int maxDim) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, o);
            int s = 1;
            while (o.outWidth / (s * 2) >= maxDim && o.outHeight / (s * 2) >= maxDim) s *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = s;
            return BitmapFactory.decodeByteArray(data, 0, data.length, o);
        } catch (Throwable t) { return null; }
    }

    /** Downloads (or decodes a data: URI) on the calling thread. */
    static Bitmap loadSync(String url, int maxDim) {
        if (url == null || url.length() == 0) return null;
        String key = url.length() > 200 ? url.substring(0, 100) + url.hashCode() + url.length() : url;
        Bitmap hit = CACHE.get(key);
        if (hit != null) return hit;
        Bitmap b = null;
        try {
            byte[] data;
            if (url.startsWith("data:")) {
                int i = url.indexOf(',');
                data = Base64.decode(url.substring(i + 1), Base64.DEFAULT);
            } else {
                HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
                h.setConnectTimeout(10000); h.setReadTimeout(20000);
                h.setInstanceFollowRedirects(true);
                InputStream is = h.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while ((n = is.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 8 * 1024 * 1024) break; }
                is.close(); h.disconnect();
                data = bo.toByteArray();
            }
            b = decode(data, maxDim);
        } catch (Throwable ignored) { }
        if (b != null) CACHE.put(key, b);
        return b;
    }

    static void load(final String url, final int maxDim, final BmpCb cb) {
        String key = url == null ? "" : (url.length() > 200 ? url.substring(0, 100) + url.hashCode() + url.length() : url);
        Bitmap hit = key.length() > 0 ? CACHE.get(key) : null;
        if (hit != null) { cb.done(hit); return; }
        POOL.execute(() -> {
            final Bitmap b = loadSync(url, maxDim);
            MAIN.post(() -> cb.done(b));
        });
    }

    static Bitmap circle(Bitmap src, int size) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        cv.drawCircle(size / 2f, size / 2f, size / 2f, p);
        p.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN));
        float sc = Math.max((float) size / src.getWidth(), (float) size / src.getHeight());
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setScale(sc, sc);
        m.postTranslate((size - src.getWidth() * sc) / 2f, (size - src.getHeight() * sc) / 2f);
        cv.drawBitmap(src, m, p);
        return out;
    }

    /** Scales a picture down so its longest side is at most maxDim. */
    static Bitmap scaleDown(Bitmap b, int maxDim) {
        int w = b.getWidth(), h = b.getHeight();
        float sc = Math.min(1f, (float) maxDim / Math.max(w, h));
        if (sc >= 1f) return b;
        return Bitmap.createScaledBitmap(b, Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(h * sc)), true);
    }

    // ---------------- wallpaper ----------------
    static File wallpaperFile(Context c) { return new File(c.getFilesDir(), "wallpaper.jpg"); }

    static Drawable wallpaper(Context c) {
        int mode = Store.wpMode(c);
        Drawable base;
        if (mode == 2 && wallpaperFile(c).exists()) {
            Bitmap b = null;
            try {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inSampleSize = 1;
                b = BitmapFactory.decodeFile(wallpaperFile(c).getAbsolutePath(), o);
            } catch (Throwable ignored) { }
            base = b != null ? new CoverDrawable(c, b) : new ColorDrawable(0xFFF4F8F9);
        } else if (mode == 1) {
            int[] g = GRADS[Math.max(0, Math.min(GRADS.length - 1, Store.wpGrad(c)))];
            GradientDrawable gd = new GradientDrawable(GradientDrawable.Orientation.TL_BR, g);
            base = gd;
        } else {
            base = new ColorDrawable(0xFFF4F8F9);
        }
        int dim = Store.wpDim(c);
        if (dim <= 0) return base;
        return new LayerDrawable(new Drawable[] { base, new ColorDrawable(alpha(0xFF000000, dim)) });
    }

    /** Draws a picture so it fills the whole area (centre-crop). */
    static final class CoverDrawable extends BitmapDrawable {
        CoverDrawable(Context c, Bitmap b) { super(c.getResources(), b); }
        @Override public void draw(Canvas cv) {
            Bitmap b = getBitmap();
            if (b == null) return;
            android.graphics.Rect r = getBounds();
            float sc = Math.max((float) r.width() / b.getWidth(), (float) r.height() / b.getHeight());
            float dx = r.left + (r.width() - b.getWidth() * sc) / 2f, dy = r.top + (r.height() - b.getHeight() * sc) / 2f;
            cv.save();
            cv.clipRect(r);
            cv.translate(dx, dy);
            cv.scale(sc, sc);
            cv.drawBitmap(b, 0, 0, getPaint());
            cv.restore();
        }
    }

    static void track(Activity a, boolean on) { visibleCount = Math.max(0, visibleCount + (on ? 1 : -1)); }
    static View space(Context c, int wDp, int hDp) { View v = new View(c); v.setLayoutParams(new LinearLayout.LayoutParams(dp(c, wDp), dp(c, hDp))); return v; }
}
