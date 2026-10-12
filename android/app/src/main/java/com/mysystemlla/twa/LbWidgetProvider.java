package com.mysystemlla.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Home-screen widget: unassigned orders + new messages. Data comes from the widget-fast Edge Function. */
public class LbWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.mysystemlla.twa.WIDGET_REFRESH";
    static final String API = "https://zoratiahjeldgsognfsj.supabase.co/functions/v1/widget-fast";
    static final String SITE = "https://mysystemlla.com/";
    static final String PREFS = "lb_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        refresh(ctx, mgr, ids, goAsync());
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, LbWidgetProvider.class));
            refresh(ctx, mgr, ids, goAsync());
        }
    }

    /** Called by LinkActivity right after a new key is saved. */
    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, LbWidgetProvider.class));
        if (ids.length > 0) refresh(ctx, mgr, ids, null);
    }

    private static void refresh(final Context ctx, final AppWidgetManager mgr, final int[] ids, final PendingResult pr) {
        if (ids == null || ids.length == 0) {
            if (pr != null) pr.finish();
            return;
        }
        // 1) paint what we already know right away
        paint(ctx, mgr, ids, false);
        // 2) fetch fresh data in the background
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    fetch(ctx);
                    paint(ctx, mgr, ids, false);
                } catch (Exception e) {
                    paint(ctx, mgr, ids, true);
                } finally {
                    if (pr != null) pr.finish();
                }
            }
        }).start();
    }

    private static void fetch(Context ctx) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String key = sp.getString("key", "");
        if (key.isEmpty()) return;
        HttpURLConnection c = (HttpURLConnection) new URL(API).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setRequestMethod("POST");
        c.setRequestProperty("Content-Type", "application/json");
        c.setDoOutput(true);
        byte[] body = new JSONObject().put("action", "summary").put("key", key).toString().getBytes("UTF-8");
        OutputStream os = c.getOutputStream();
        os.write(body);
        os.close();
        int code = c.getResponseCode();
        InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
        StringBuilder sb = new StringBuilder();
        byte[] buf = new byte[4096];
        int n;
        while (is != null && (n = is.read(buf)) > 0) sb.append(new String(buf, 0, n, "UTF-8"));
        if (is != null) is.close();
        c.disconnect();
        JSONObject j = new JSONObject(sb.toString());
        if (code == 401 && j.optBoolean("revoked")) {
            sp.edit().remove("key").remove("data").apply(); // unlinked from the website: back to the "link" state
            return;
        }
        if (code != 200 || !j.optBoolean("success")) throw new Exception("bad response " + code);
        sp.edit().putString("data", sb.toString()).putLong("at", System.currentTimeMillis()).apply();
    }

    private static PendingIntent openApp(Context ctx, int req, String page) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(SITE + page));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void paint(Context ctx, AppWidgetManager mgr, int[] ids, boolean offline) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean linked = !sp.getString("key", "").isEmpty();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_widget);

        Intent r = new Intent(ctx, LbWidgetProvider.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.refresh,
                PendingIntent.getBroadcast(ctx, 10, r, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setOnClickPendingIntent(R.id.card_orders, openApp(ctx, 11, "index.html"));
        v.setOnClickPendingIntent(R.id.card_msgs, openApp(ctx, 12, "chatbox.html"));
        v.setOnClickPendingIntent(R.id.unlinked, openApp(ctx, 13, "index.html"));

        if (!linked) {
            v.setViewVisibility(R.id.content, android.view.View.GONE);
            v.setViewVisibility(R.id.unlinked, android.view.View.VISIBLE);
            for (int id : ids) mgr.updateAppWidget(id, v);
            return;
        }
        v.setViewVisibility(R.id.content, android.view.View.VISIBLE);
        v.setViewVisibility(R.id.unlinked, android.view.View.GONE);

        String data = sp.getString("data", "");
        if (!data.isEmpty()) {
            try {
                JSONObject j = new JSONObject(data);
                JSONObject o = j.getJSONObject("orders");
                int cnt = o.optInt("count", 0);
                v.setTextViewText(R.id.orders_count, String.valueOf(cnt));
                v.setTextViewText(R.id.orders_label, cnt == 0 ? "All assigned" : (cnt == 1 ? "order to assign" : "orders to assign"));
                JSONArray items = o.optJSONArray("items");
                StringBuilder s = new StringBuilder();
                for (int k = 0; items != null && k < Math.min(2, items.length()); k++) {
                    if (k > 0) s.append(" · ");
                    s.append('#').append(items.optString(k));
                }
                if (cnt > 2) s.append(" +").append(cnt - 2);
                v.setTextViewText(R.id.orders_items, s.toString());

                JSONObject m = j.getJSONObject("messages");
                int rc = m.optInt("recent24h", 0);
                v.setTextViewText(R.id.msg_count, rc > 99 ? "99+" : String.valueOf(rc));
                v.setTextViewText(R.id.msg_label, rc == 1 ? "new message" : "new messages");
                JSONArray mi = m.optJSONArray("items");
                String prev = "";
                if (mi != null) {
                    for (int k = 0; k < mi.length(); k++) { // newest message from someone else, else newest
                        JSONObject x = mi.getJSONObject(k);
                        if (!x.optBoolean("mine")) { prev = x.optString("from") + ": " + x.optString("text"); break; }
                    }
                    if (prev.isEmpty() && mi.length() > 0) prev = "You: " + mi.getJSONObject(0).optString("text");
                }
                v.setTextViewText(R.id.msg_preview, prev);
            } catch (Exception ignored) { }
        }
        long at = sp.getLong("at", 0);
        String t = at == 0 ? "" : new SimpleDateFormat("h:mm a", Locale.getDefault()).format(new Date(at));
        v.setTextViewText(R.id.updated, offline ? (t.isEmpty() ? "Offline" : "Offline · " + t) : t);
        for (int id : ids) mgr.updateAppWidget(id, v);
    }
}
