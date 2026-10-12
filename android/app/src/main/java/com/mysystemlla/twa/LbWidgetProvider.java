package com.mysystemlla.twa;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Build;
import android.os.SystemClock;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.BreakIterator;

/**
 * Home-screen widget (transparent, HTC style): clock + weather on the wallpaper, then two glass cards:
 * orders to assign (number + branch / "For assign") and the latest messages (who + text).
 * Data comes from the widget-fast Edge Function; weather from Open-Meteo.
 */
public class LbWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.mysystemlla.twa.WIDGET_REFRESH";
    static final String API = "https://zoratiahjeldgsognfsj.supabase.co/functions/v1/widget-fast";
    static final String SITE = "https://mysystemlla.com/";
    static final String PREFS = "lb_widget";
    static final long WX_TTL = 10 * 60 * 1000L;
    static final long AUTO_REFRESH_MS = 3 * 60 * 1000L; // auto-refresh while the phone is awake

    // Same default places as the website menu: Bahrain and San Pedro, Laguna.
    static final String[] WX_FLAG = {"🇧🇭", "🇵🇭"};
    static final double[] WX_LAT = {26.2285, 14.3595};
    static final double[] WX_LON = {50.5860, 121.0473};
    static final String[] WX_TZ = {"Asia/Bahrain", "Asia/Manila"};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        scheduleAuto(ctx);
        doRefresh(ctx, goAsync());
    }

    @Override
    public void onEnabled(Context ctx) {
        scheduleAuto(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        cancelAutoIfNone(ctx);
    }

    /** Stops the auto-refresh alarm once no Lalabella widget of any kind is left on the home screen. */
    static void cancelAutoIfNone(Context ctx) {
        if (widgetIds(ctx, LbWidgetProvider.class).length + widgetIds(ctx, LbProfileWidget.class).length
                + widgetIds(ctx, LbScheduleWidget.class).length + widgetIds(ctx, LbCalcWidget.class).length > 0) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(autoIntent(ctx));
    }

    static int[] widgetIds(Context ctx, Class<?> cls) {
        return AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, cls));
    }

    private static PendingIntent autoIntent(Context ctx) {
        Intent i = new Intent(ctx, LbWidgetProvider.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(ctx, 20, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Inexact repeating alarm that does not wake the phone: refreshes every ~3 min while it is awake. */
    static void scheduleAuto(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + AUTO_REFRESH_MS, AUTO_REFRESH_MS, autoIntent(ctx));
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            doRefresh(ctx, goAsync());
        }
    }

    /** Called by LinkActivity right after a new key is saved, and by PushWatcher when a notification arrives. */
    static void refreshAll(Context ctx) {
        doRefresh(ctx, null);
    }

    /** Refreshes every Lalabella widget on the home screen (orders/messages, profile, schedule) with one network call. */
    static void doRefresh(final Context ctx, final PendingResult pr) {
        try {
            LbAttendance.sync(ctx, 10 * 60 * 1000L); // keep the Attendance alarms planned (cheap, at most every 10 min)
        } catch (Exception ignored) { }
        final AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        final int[] main = widgetIds(ctx, LbWidgetProvider.class);
        final int[] prof = widgetIds(ctx, LbProfileWidget.class);
        final int[] sched = widgetIds(ctx, LbScheduleWidget.class);
        final int[] calc = widgetIds(ctx, LbCalcWidget.class);
        if (main.length + prof.length + sched.length + calc.length == 0) {
            if (pr != null) pr.finish();
            return;
        }
        paintAll(ctx, mgr, main, prof, sched, calc, false); // what we already know, right away
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean offline = false;
                try {
                    fetchSummary(ctx);
                } catch (Exception e) {
                    offline = true;
                }
                if (main.length + prof.length + calc.length > 0) {
                    try {
                        fetchWeather(ctx);
                    } catch (Exception ignored) { }
                }
                if (prof.length > 0) {
                    try {
                        LbProfileWidget.fetchPhoto(ctx);
                    } catch (Exception ignored) { }
                }
                try {
                    paintAll(ctx, mgr, main, prof, sched, calc, offline);
                } finally {
                    if (pr != null) pr.finish();
                }
            }
        }).start();
    }

    private static void paintAll(Context ctx, AppWidgetManager mgr, int[] main, int[] prof, int[] sched, int[] calc, boolean offline) {
        if (main.length > 0) paint(ctx, mgr, main, offline);
        if (prof.length > 0) LbProfileWidget.paint(ctx, mgr, prof);
        if (sched.length > 0) LbScheduleWidget.paint(ctx, mgr, sched);
        if (calc.length > 0) LbCalcWidget.paint(ctx, mgr, calc);
    }

    static String httpPost(String url, String json) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setRequestMethod("POST");
        c.setRequestProperty("Content-Type", "application/json");
        c.setDoOutput(true);
        OutputStream os = c.getOutputStream();
        os.write(json.getBytes("UTF-8"));
        os.close();
        int code = c.getResponseCode();
        InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
        String out = readAll(is);
        c.disconnect();
        return code + "\n" + out;
    }

    private static String readAll(InputStream is) throws Exception {
        StringBuilder sb = new StringBuilder();
        byte[] buf = new byte[4096];
        int n;
        while (is != null && (n = is.read(buf)) > 0) sb.append(new String(buf, 0, n, "UTF-8"));
        if (is != null) is.close();
        return sb.toString();
    }

    private static void fetchSummary(Context ctx) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String key = sp.getString("key", "");
        if (key.isEmpty()) return;
        JSONObject req = new JSONObject().put("action", "summary").put("key", key);
        String who = sp.getString("scWho", ""); // schedule widget: whose calendar to show ("" = mine)
        if (!who.isEmpty()) req.put("employee", who);
        String res = httpPost(API, req.toString());
        int nl = res.indexOf('\n');
        int code = Integer.parseInt(res.substring(0, nl));
        JSONObject j = new JSONObject(res.substring(nl + 1));
        if (code == 401 && j.optBoolean("revoked")) {
            sp.edit().remove("key").remove("data").remove("photoUrl").apply(); // unlinked: back to the "link" state
            return;
        }
        if (code != 200 || !j.optBoolean("success")) throw new Exception("bad response " + code);
        sp.edit().putString("data", j.toString()).putLong("at", System.currentTimeMillis()).apply();
    }

    private static void fetchWeather(Context ctx) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (System.currentTimeMillis() - sp.getLong("wxAt", 0) < WX_TTL && !sp.getString("wx0", "").isEmpty()) return;
        SharedPreferences.Editor ed = sp.edit();
        boolean any = false;
        for (int i = 0; i < 2; i++) {
            try {
                String u = "https://api.open-meteo.com/v1/forecast?latitude=" + WX_LAT[i] + "&longitude=" + WX_LON[i]
                        + "&current=temperature_2m,weather_code&timezone=" + Uri.encode(WX_TZ[i]);
                HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                String body = readAll(c.getInputStream());
                c.disconnect();
                JSONObject cur = new JSONObject(body).getJSONObject("current");
                ed.putString("wx" + i, Math.round(cur.getDouble("temperature_2m")) + "|" + cur.getInt("weather_code"));
                any = true;
            } catch (Exception ignored) { }
        }
        if (any) ed.putLong("wxAt", System.currentTimeMillis());
        ed.apply();
    }

    private static String wxEmoji(int code) {
        if (code == 0) return "☀️";
        if (code == 1 || code == 2) return "⛅";
        if (code == 3) return "☁️";
        if (code == 45 || code == 48) return "🌫️";
        if (code >= 51 && code <= 57) return "🌦️";
        if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
        if ((code >= 71 && code <= 77) || code == 85 || code == 86) return "❄️";
        if (code >= 95) return "⛈️";
        return "🌡️";
    }

    static String wxText(SharedPreferences sp, int i) {
        String s = sp.getString("wx" + i, "");
        if (s.isEmpty()) return "";
        try {
            String[] p = s.split("\\|");
            return WX_FLAG[i] + " " + wxEmoji(Integer.parseInt(p[1])) + " " + p[0] + "°";
        } catch (Exception e) {
            return "";
        }
    }

    static PendingIntent openApp(Context ctx, int req, String page) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(SITE + page));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static CharSequence orderRow(String no, String branch) {
        SpannableStringBuilder b = new SpannableStringBuilder("#" + no);
        b.setSpan(new ForegroundColorSpan(Color.parseColor("#FFFFFF")), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        int st = b.length();
        boolean has = branch != null && !branch.isEmpty();
        b.append(has ? "  ➜ " + branch : "  ⚠ For assign");
        b.setSpan(new ForegroundColorSpan(Color.parseColor(has ? "#8FF0B5" : "#FFB36B")), st, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return b;
    }

    /** Drops emoji/symbols this phone's fonts cannot draw (they would show as empty boxes). */
    static String clean(String s) {
        if (s == null) return "";
        if (Build.VERSION.SDK_INT < 23) return s;
        Paint p = new Paint();
        BreakIterator bi = BreakIterator.getCharacterInstance();
        bi.setText(s);
        StringBuilder out = new StringBuilder();
        boolean dropped = false;
        int start = bi.first();
        for (int end = bi.next(); end != BreakIterator.DONE; start = end, end = bi.next()) {
            String g = s.substring(start, end);
            if (g.codePointAt(0) < 0x2000 || p.hasGlyph(g)) out.append(g);
            else dropped = true;
        }
        String r = out.toString().trim();
        return (r.isEmpty() && dropped) ? "[emoji]" : r;
    }

    private static CharSequence msgRow(String from, String text, boolean mine) {
        String name = mine ? "You" : clean(from);
        SpannableStringBuilder b = new SpannableStringBuilder(name);
        b.setSpan(new StyleSpan(android.graphics.Typeface.BOLD), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        b.setSpan(new ForegroundColorSpan(Color.parseColor("#FFD3DD")), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        b.append(": ").append(clean(text));
        return b;
    }

    private static void paint(Context ctx, AppWidgetManager mgr, int[] ids, boolean offline) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean linked = !sp.getString("key", "").isEmpty();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_widget);

        v.setOnClickPendingIntent(R.id.card_orders, openApp(ctx, 11, "index.html"));
        v.setOnClickPendingIntent(R.id.card_msgs, openApp(ctx, 12, "chatbox.html"));
        v.setOnClickPendingIntent(R.id.unlinked, openApp(ctx, 13, "index.html"));

        v.setTextViewText(R.id.wx1, wxText(sp, 0));
        v.setTextViewText(R.id.wx2, wxText(sp, 1));

        if (!linked) {
            v.setViewVisibility(R.id.unlinked, View.VISIBLE);
            v.setViewVisibility(R.id.card_orders, View.INVISIBLE);
            v.setViewVisibility(R.id.card_msgs, View.INVISIBLE);
            for (int id : ids) mgr.updateAppWidget(id, v);
            return;
        }
        v.setViewVisibility(R.id.unlinked, View.GONE);
        v.setViewVisibility(R.id.card_orders, View.VISIBLE);
        v.setViewVisibility(R.id.card_msgs, View.VISIBLE);

        int[] ordIds = {R.id.ord_1, R.id.ord_2, R.id.ord_3};
        int[] msgIds = {R.id.msg_1, R.id.msg_2};
        for (int id : ordIds) v.setTextViewText(id, "");
        for (int id : msgIds) v.setTextViewText(id, "");
        v.setTextViewText(R.id.ord_more, "");

        String data = sp.getString("data", "");
        if (!data.isEmpty()) {
            try {
                JSONObject j = new JSONObject(data);
                JSONObject o = j.getJSONObject("orders");
                int cnt = o.optInt("count", 0);
                v.setTextViewText(R.id.orders_count, String.valueOf(cnt));
                v.setTextViewText(R.id.orders_title, cnt == 0 ? "All assigned" : "To assign");
                JSONArray list = o.optJSONArray("list");
                int shown = 0;
                if (list != null) {
                    for (int k = 0; k < Math.min(3, list.length()); k++) {
                        JSONObject x = list.getJSONObject(k);
                        v.setTextViewText(ordIds[k], orderRow(x.optString("no"), x.optString("branch")));
                        shown++;
                    }
                } else { // older server: numbers only
                    JSONArray items = o.optJSONArray("items");
                    for (int k = 0; items != null && k < Math.min(3, items.length()); k++) {
                        v.setTextViewText(ordIds[k], orderRow(items.optString(k), ""));
                        shown++;
                    }
                }
                if (cnt > shown) v.setTextViewText(R.id.ord_more, "+" + (cnt - shown) + " more");

                JSONObject m = j.getJSONObject("messages");
                v.setTextViewText(R.id.msg_count, String.valueOf(m.optInt("unread", m.optInt("recent24h", 0))));
                JSONArray mi = m.optJSONArray("items");
                for (int k = 0; mi != null && k < Math.min(2, mi.length()); k++) {
                    JSONObject x = mi.getJSONObject(k);
                    v.setTextViewText(msgIds[k], msgRow(x.optString("from"), x.optString("text"), x.optBoolean("mine")));
                }
                if (mi == null || mi.length() == 0) v.setTextViewText(R.id.msg_1, "No new messages");
            } catch (Exception ignored) { }
        }
        for (int id : ids) mgr.updateAppWidget(id, v);
    }
}
