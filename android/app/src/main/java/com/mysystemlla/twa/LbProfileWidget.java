package com.mysystemlla.twa;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** "My profile" widget: photo (or initials), name, position · branch, and today's shift. Tap opens the profile page. */
public class LbProfileWidget extends AppWidgetProvider {
    static final String PHOTO_PREFIX = "https://zoratiahjeldgsognfsj.supabase.co/storage/v1/object/public/";
    static final String PHOTO_FILE = "lb_photo.img";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        LbWidgetProvider.scheduleAuto(ctx);
        LbWidgetProvider.doRefresh(ctx, goAsync());
    }

    @Override
    public void onEnabled(Context ctx) {
        LbWidgetProvider.scheduleAuto(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        LbWidgetProvider.cancelAutoIfNone(ctx);
    }

    /** Downloads the user's profile photo when it changed (only from our own storage). */
    static void fetchPhoto(Context ctx) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        String data = sp.getString("data", "");
        if (data.isEmpty()) return;
        JSONObject me = new JSONObject(data).optJSONObject("me");
        String url = me == null ? "" : me.optString("photo", "");
        File f = new File(ctx.getFilesDir(), PHOTO_FILE);
        if (url.isEmpty() || !url.startsWith(PHOTO_PREFIX)) {
            if (f.exists()) f.delete();
            sp.edit().remove("photoUrl").apply();
            return;
        }
        if (url.equals(sp.getString("photoUrl", "")) && f.exists()) return;
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        InputStream is = c.getInputStream();
        File tmp = new File(ctx.getFilesDir(), PHOTO_FILE + ".tmp");
        FileOutputStream os = new FileOutputStream(tmp);
        byte[] buf = new byte[8192];
        int n;
        long total = 0;
        while ((n = is.read(buf)) > 0) {
            total += n;
            if (total > 3 * 1024 * 1024) { os.close(); is.close(); tmp.delete(); return; } // too big: skip
            os.write(buf, 0, n);
        }
        os.close();
        is.close();
        c.disconnect();
        if (f.exists()) f.delete();
        if (tmp.renameTo(f)) sp.edit().putString("photoUrl", url).apply();
    }

    private static String initials(String name) {
        String[] w = name == null ? new String[0] : name.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < w.length && sb.length() < 2; i++) if (!w[i].isEmpty()) sb.append(Character.toUpperCase(w[i].charAt(0)));
        return sb.length() == 0 ? "L" : sb.toString();
    }

    /** Round avatar: the photo if we have it, otherwise coloured circle with initials. */
    static Bitmap avatar(Context ctx, String name, int size) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Bitmap photo = null;
        try {
            File f = new File(ctx.getFilesDir(), PHOTO_FILE);
            if (f.exists()) {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(f.getAbsolutePath(), o);
                int ss = 1;
                while (o.outWidth / (ss * 2) >= size && o.outHeight / (ss * 2) >= size) ss *= 2;
                o = new BitmapFactory.Options();
                o.inSampleSize = ss;
                photo = BitmapFactory.decodeFile(f.getAbsolutePath(), o);
            }
        } catch (Throwable ignored) { }
        float r = size / 2f;
        if (photo != null) {
            int side = Math.min(photo.getWidth(), photo.getHeight());
            Bitmap sq = Bitmap.createBitmap(photo, (photo.getWidth() - side) / 2, (photo.getHeight() - side) / 2, side, side);
            Bitmap sc = Bitmap.createScaledBitmap(sq, size, size, true);
            p.setShader(new android.graphics.BitmapShader(sc, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
            cv.drawCircle(r, r, r - 3, p);
            p.setShader(null);
        } else {
            p.setShader(new LinearGradient(0, 0, size, size, Color.parseColor("#E0708A"), Color.parseColor("#9E2F4A"), Shader.TileMode.CLAMP));
            cv.drawCircle(r, r, r - 3, p);
            p.setShader(null);
            p.setColor(Color.WHITE);
            p.setTextAlign(Paint.Align.CENTER);
            p.setTextSize(size * 0.42f);
            p.setFakeBoldText(true);
            cv.drawText(initials(name), r, r + size * 0.15f, p);
        }
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(4);
        ring.setColor(Color.parseColor("#CCFFFFFF"));
        cv.drawCircle(r, r, r - 3, ring);
        return out;
    }

    /** Short shift text: drops the "(1 HR break)" bit and turns " to " into a dash. */
    static String shortShift(String detail) {
        if (detail == null) return "";
        String main = detail.split(";")[0].trim();
        main = main.replaceAll("\\s*\\([^)]*\\)", "").replace(" to ", "–");
        return main.trim();
    }

    static String todayYmd() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /** Today's shift from a sparse [{date, detail}] list. */
    static String detailFor(JSONArray days, String ymd) {
        for (int k = 0; days != null && k < days.length(); k++) {
            JSONObject d = days.optJSONObject(k);
            if (d != null && ymd.equals(d.optString("date"))) return d.optString("detail");
        }
        return "";
    }

    static void paint(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        boolean linked = !sp.getString("key", "").isEmpty();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_profile);
        v.setOnClickPendingIntent(R.id.pf_root, LbWidgetProvider.openApp(ctx, 31, "profile.html"));
        String data = sp.getString("data", "");
        if (!linked || data.isEmpty()) {
            v.setViewVisibility(R.id.pf_main, View.GONE);
            v.setViewVisibility(R.id.pf_unlinked, View.VISIBLE);
            v.setInt(R.id.pf_root, "setBackgroundResource", R.drawable.lb_card);
            v.setViewVisibility(R.id.pf_flip, View.GONE);
            v.setTextViewText(R.id.pf_unlinked, linked ? "Loading…" : "Open the app, then Menu → Link home-screen widget");
            for (int id : ids) mgr.updateAppWidget(id, v);
            return;
        }
        v.setViewVisibility(R.id.pf_main, View.VISIBLE);
        v.setViewVisibility(R.id.pf_unlinked, View.GONE);
        try {
            JSONObject j = new JSONObject(data);
            JSONObject me = j.optJSONObject("me");
            String name = me == null ? "" : me.optString("name");
            String pos = me == null ? "" : me.optString("position");
            String br = me == null ? "" : me.optString("branch");
            String theme = me == null ? "" : me.optString("theme");
            if (!theme.equals("fish") && !theme.equals("snow") && !theme.equals("fire") && !theme.equals("petals") && !theme.equals("off")) theme = "fish";

            // same animation as the website menu (flipping frames); "off" = plain glass
            if (theme.equals("off")) {
                v.setViewVisibility(R.id.pf_flip, View.GONE);
                v.setInt(R.id.pf_root, "setBackgroundResource", R.drawable.lb_card);
            } else {
                v.setViewVisibility(R.id.pf_flip, View.VISIBLE);
                v.setInt(R.id.pf_root, "setBackgroundResource", 0);
                for (int f = 0; f < 6; f++) {
                    int viewId = ctx.getResources().getIdentifier("pf_f" + f, "id", ctx.getPackageName());
                    int res = ctx.getResources().getIdentifier("lb_pf_" + theme + "_" + f, "drawable", ctx.getPackageName());
                    if (viewId != 0 && res != 0) v.setImageViewResource(viewId, res);
                }
            }
            boolean light = theme.equals("petals");
            int cName = light ? 0xFF5A2A3A : 0xFFFFFFFF, cSub = light ? 0xFF8A3D58 : 0xFFFFD3DD;

            v.setImageViewBitmap(R.id.pf_avatar, avatar(ctx, name, 160));
            v.setTextViewText(R.id.pf_name, LbWidgetProvider.clean(name));
            v.setTextColor(R.id.pf_name, cName);
            String sub = pos;
            if (!br.isEmpty()) sub = sub.isEmpty() ? br : sub + " · " + br;
            v.setTextViewText(R.id.pf_sub, LbWidgetProvider.clean(sub));
            v.setTextColor(R.id.pf_sub, cSub);

            String today = "";
            JSONObject sc = j.optJSONObject("schedule");
            String det = detailFor(sc == null ? null : sc.optJSONArray("days"), todayYmd());
            if (!det.isEmpty()) today = det.trim().equalsIgnoreCase("off") ? "Today: Day off" : "Today: " + shortShift(det);
            v.setTextViewText(R.id.pf_today, today);
            v.setTextColor(R.id.pf_today, cName);
        } catch (Exception ignored) { }
        for (int id : ids) mgr.updateAppWidget(id, v);
    }
}
