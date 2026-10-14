package com.mysystemlla.twa;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.Base64;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Round profile picture of whoever sent the message (used for the notification and the chat bubble). */
final class LbAvatar {
    private static final int SZ = 192;
    private static final long TTL = 6 * 3600 * 1000L;
    private static final int[] COLORS = {0xFFC9506B, 0xFF9E2F4A, 0xFFB8860B, 0xFF6B5B95, 0xFF2F7F86, 0xFF5B8C5A, 0xFFD2691E, 0xFF4A6FA5};

    private LbAvatar() { }

    private static File file(Context c, String key) {
        return new File(c.getCacheDir(), "av_" + key.replaceAll("[^A-Za-z0-9_-]", "_") + ".png");
    }

    /** Picture to show now: the saved one, or a coloured circle with the first letter. Never touches the network. */
    static Bitmap cached(Context c, String key, String name) {
        try {
            File f = file(c, key);
            if (f.exists()) {
                Bitmap b = BitmapFactory.decodeFile(f.getAbsolutePath());
                if (b != null) return b;
            }
        } catch (Exception ignored) { }
        return initial(name);
    }

    /** Downloads the sender's picture (at most every 6 hours). Call from a background thread. */
    static void fetch(Context c, String key, int peer, int grp, boolean team, String fallbackName) {
        try {
            File f = file(c, key);
            if (f.exists() && System.currentTimeMillis() - f.lastModified() < TTL) return;
            String k = c.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).getString("key", "");
            if (k.isEmpty()) return;
            JSONObject r = new JSONObject().put("action", "keyPerson").put("key", k);
            if (peer > 0) r.put("peerId", peer); else if (grp > 0) r.put("groupId", grp); else r.put("team", true);
            String res = LbWidgetProvider.httpPost(LbReplyReceiver.CHATX, r.toString());
            int nl = res.indexOf('\n');
            if (Integer.parseInt(res.substring(0, nl)) != 200) return;
            JSONObject j = new JSONObject(res.substring(nl + 1));
            if (!j.optBoolean("success")) return;
            String photo = j.optString("photo", "");
            Bitmap b = photo.isEmpty() ? null : load(photo);
            Bitmap round = b != null ? circle(b) : initial(j.optString("name", fallbackName));
            FileOutputStream os = new FileOutputStream(f);
            round.compress(Bitmap.CompressFormat.PNG, 100, os);
            os.close();
        } catch (Exception ignored) { }
    }

    private static Bitmap load(String photo) {
        try {
            if (photo.startsWith("data:image")) {
                int comma = photo.indexOf(',');
                byte[] raw = Base64.decode(photo.substring(comma + 1), Base64.DEFAULT);
                return BitmapFactory.decodeByteArray(raw, 0, raw.length);
            }
            if (!photo.startsWith("https://")) return null;
            HttpURLConnection c = (HttpURLConnection) new URL(photo).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            InputStream is = c.getInputStream();
            Bitmap b = BitmapFactory.decodeStream(is);
            is.close();
            c.disconnect();
            return b;
        } catch (Exception e) {
            return null;
        }
    }

    private static Bitmap circle(Bitmap src) {
        int s = Math.min(src.getWidth(), src.getHeight());
        Bitmap sq = Bitmap.createBitmap(src, (src.getWidth() - s) / 2, (src.getHeight() - s) / 2, s, s);
        Bitmap scaled = Bitmap.createScaledBitmap(sq, SZ, SZ, true);
        Bitmap out = Bitmap.createBitmap(SZ, SZ, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        cv.drawCircle(SZ / 2f, SZ / 2f, SZ / 2f, p);
        return out;
    }

    private static Bitmap initial(String name) {
        String n = name == null ? "" : name.trim();
        String letter = n.isEmpty() ? "L" : n.substring(0, n.offsetByCodePoints(0, 1)).toUpperCase();
        Bitmap out = Bitmap.createBitmap(SZ, SZ, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(COLORS[Math.abs(n.hashCode()) % COLORS.length]);
        cv.drawCircle(SZ / 2f, SZ / 2f, SZ / 2f, p);
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setColor(Color.WHITE);
        t.setTextSize(SZ * 0.5f);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextAlign(Paint.Align.CENTER);
        cv.drawText(letter, SZ / 2f, SZ / 2f - (t.descent() + t.ascent()) / 2f, t);
        return out;
    }
}
