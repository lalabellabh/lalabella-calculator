package com.mysystemlla.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Tells the person when a newer Lalabella app is available (reads downloads/app-version.json on the website). */
final class LbUpdate {
    private static final String INFO = LbWidgetProvider.SITE + "downloads/app-version.json";
    private static final String PAGE = LbWidgetProvider.SITE + "get-app.html?dl=1";
    private static final String CHANNEL = "lb_update";
    private static final long GAP_MS = 6 * 60 * 60 * 1000L;

    private LbUpdate() { }

    /** Runs on the caller's (background) thread. Never throws. */
    static void check(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
            long now = System.currentTimeMillis();
            if (now - sp.getLong("updCheckedAt", 0) < GAP_MS) return;
            JSONObject j = new JSONObject(get(INFO));
            sp.edit().putLong("updCheckedAt", now).apply();
            long latest = j.optLong("versionCode", 0);
            if (latest <= installedCode(ctx)) return;
            if (sp.getLong("updNotified", 0) >= latest) return;   // already told them about this one
            notifyNew(ctx, j.optString("versionName", ""));
            sp.edit().putLong("updNotified", latest).apply();
        } catch (Exception ignored) { }
    }

    @SuppressWarnings("deprecation")
    private static long installedCode(Context ctx) throws Exception {
        PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url + "?t=" + System.currentTimeMillis()).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setUseCaches(false);
        int code = c.getResponseCode();
        if (code != 200) { c.disconnect(); throw new Exception("http " + code); }
        InputStream is = c.getInputStream();
        StringBuilder sb = new StringBuilder();
        byte[] buf = new byte[2048];
        int n;
        while ((n = is.read(buf)) > 0) sb.append(new String(buf, 0, n, "UTF-8"));
        is.close();
        c.disconnect();
        return sb.toString();
    }

    private static void notifyNew(Context ctx, String name) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Tells you when a new Lalabella app version is ready");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(PAGE)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, 902, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        String text = "A new Lalabella app" + (name.isEmpty() ? "" : " (v" + name + ")") + " is ready. Tap to download and install it.";
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFFC9506B)
                .setContentTitle("⬆️ Lalabella update")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis());
        try {
            nm.notify(4100, b.build());
        } catch (Exception ignored) { }
    }
}
