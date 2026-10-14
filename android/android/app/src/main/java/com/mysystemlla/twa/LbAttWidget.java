package com.mysystemlla.twa;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
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
import java.util.TimeZone;

/**
 * Attendance widget: shows today's state, the buttons that make sense right now (Time in / Break / End break / Time out)
 * and a small map of your branch. A button opens the Attendance page and starts that punch there, so the fingerprint and
 * location checks still happen (the widget key itself can only read).
 */
public class LbAttWidget extends AppWidgetProvider {
    private static final int Z = 17;

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

    private static String label(String kind) {
        if ("in".equals(kind)) return "Time in";
        if ("break_out".equals(kind)) return "Break";
        if ("break_in".equals(kind)) return "End break";
        return "Time out";
    }

    private static String stateText(String s) {
        if ("in".equals(s) || "break_in".equals(s)) return "Working";
        if ("break_out".equals(s)) return "On break";
        if ("out".equals(s)) return "Timed out";
        return "Not in yet";
    }

    private static String clock(String iso) {
        try {
            SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            in.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = in.parse(iso.substring(0, 19));
            SimpleDateFormat out = new SimpleDateFormat("h:mm a", Locale.US);
            out.setTimeZone(TimeZone.getTimeZone("Asia/Bahrain"));
            return out.format(d);
        } catch (Exception e) {
            return "";
        }
    }

    static void paint(Context ctx, AppWidgetManager mgr, int[] ids) {
        if (ids == null || ids.length == 0) return;
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        boolean linked = !sp.getString("key", "").isEmpty();
        String data = sp.getString("data", "");
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_att);
        JSONObject att = null;
        try {
            if (!data.isEmpty()) att = new JSONObject(data).optJSONObject("att");
        } catch (Exception ignored) { }
        if (!linked || att == null) {
            v.setViewVisibility(R.id.at_main, View.GONE);
            v.setViewVisibility(R.id.at_unlinked, View.VISIBLE);
            v.setTextViewText(R.id.at_unlinked, linked ? "Loading…" : "Open the app, then Menu → Link home-screen widget");
            v.setOnClickPendingIntent(R.id.at_root, LbWidgetProvider.openApp(ctx, 61, "attendance.html"));
            for (int id : ids) mgr.updateAppWidget(id, v);
            return;
        }
        v.setViewVisibility(R.id.at_main, View.VISIBLE);
        v.setViewVisibility(R.id.at_unlinked, View.GONE);

        String state = att.optString("state", "");
        v.setTextViewText(R.id.at_state, stateText(state));
        String last = att.optString("last", "");
        JSONObject br = att.optJSONObject("branch");
        String sub = last.isEmpty() ? "" : "since " + clock(last);
        if (br != null) sub = (sub.isEmpty() ? "" : sub + " · ") + br.optString("name");
        v.setTextViewText(R.id.at_sub, sub);
        v.setTextViewText(R.id.at_mapname, br != null ? "\uD83D\uDDFA\uFE0F " + br.optString("name") : "\uD83D\uDDFA\uFE0F");

        JSONArray next = att.optJSONArray("next");
        int[] bid = {R.id.at_b0, R.id.at_b1};
        for (int i = 0; i < 2; i++) {
            String k = next != null && i < next.length() ? next.optString(i) : "";
            if (k.isEmpty()) {
                v.setViewVisibility(bid[i], View.GONE);
            } else {
                v.setViewVisibility(bid[i], View.VISIBLE);
                v.setTextViewText(bid[i], label(k));
                v.setOnClickPendingIntent(bid[i], LbWidgetProvider.openApp(ctx, 62 + i, "attendance.html?act=" + k));
            }
        }
        if (next == null || next.length() == 0) { // finished for today: show a single open button
            v.setViewVisibility(R.id.at_b0, View.VISIBLE);
            v.setTextViewText(R.id.at_b0, "Open attendance");
            v.setOnClickPendingIntent(R.id.at_b0, LbWidgetProvider.openApp(ctx, 62, "attendance.html"));
        }
        v.setOnClickPendingIntent(R.id.at_map, LbWidgetProvider.openApp(ctx, 64, "attendance.html"));

        File f = new File(ctx.getCacheDir(), "att_map.png");
        if (f.exists()) {
            try {
                Bitmap b = BitmapFactory.decodeFile(f.getAbsolutePath());
                if (b != null) v.setImageViewBitmap(R.id.at_map, b);
            } catch (Exception ignored) { }
        }
        for (int id : ids) mgr.updateAppWidget(id, v);
    }

    /** Downloads one OpenStreetMap tile around the branch and draws a pin on it (cached; re-made only if the branch changes). */
    static void fetchMap(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
            String data = sp.getString("data", "");
            if (data.isEmpty()) return;
            JSONObject att = new JSONObject(data).optJSONObject("att");
            JSONObject br = att == null ? null : att.optJSONObject("branch");
            if (br == null) return;
            double lat = br.getDouble("lat"), lng = br.getDouble("lng");
            String sig = lat + "," + lng;
            File f = new File(ctx.getCacheDir(), "att_map.png");
            if (f.exists() && sig.equals(sp.getString("attMapSig", ""))) return;
            double n = Math.pow(2, Z);
            double xf = (lng + 180.0) / 360.0 * n;
            double lr = Math.toRadians(lat);
            double yf = (1.0 - Math.log(Math.tan(lr) + 1.0 / Math.cos(lr)) / Math.PI) / 2.0 * n;
            int tx = (int) Math.floor(xf), ty = (int) Math.floor(yf);
            HttpURLConnection c = (HttpURLConnection) new URL("https://tile.openstreetmap.org/" + Z + "/" + tx + "/" + ty + ".png").openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestProperty("User-Agent", "LalabellaAndroid/1.3 (mysystemlla.com)");
            InputStream is = c.getInputStream();
            Bitmap tile = BitmapFactory.decodeStream(is);
            is.close();
            c.disconnect();
            if (tile == null) return;
            Bitmap out = tile.copy(Bitmap.Config.ARGB_8888, true);
            float px = (float) ((xf - tx) * out.getWidth()), py = (float) ((yf - ty) * out.getHeight());
            Canvas cv = new Canvas(out);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setColor(Color.WHITE);
            cv.drawCircle(px, py, 15, p);
            p.setColor(0xFFC9506B);
            cv.drawCircle(px, py, 11, p);
            p.setColor(Color.WHITE);
            cv.drawCircle(px, py, 4, p);
            FileOutputStream fo = new FileOutputStream(f);
            out.compress(Bitmap.CompressFormat.PNG, 100, fo);
            fo.close();
            sp.edit().putString("attMapSig", sig).apply();
        } catch (Exception ignored) { }
    }

    static int[] ids(Context ctx) {
        return AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, LbAttWidget.class));
    }
}
