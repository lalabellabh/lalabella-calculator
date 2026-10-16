package com.mysystemlla.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Checks downloads/driver-app-version.json and shows a notification when a newer Driver app is ready. */
final class UpdateChecker {
    static final String VERSION_URL = "https://mysystemlla.com/downloads/driver-app-version.json";
    static final String PAGE_URL = "https://mysystemlla.com/get-driver-app.html?dl=1";
    private static final String CH = "lb_updates";

    private UpdateChecker() { }

    static int installedCode(Context c) {
        try {
            android.content.pm.PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return (int) (Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
        } catch (Exception e) { return 0; }
    }

    /** Runs on a background thread. Returns the newest versionCode found, or -1 when it could not check. */
    static int check(Context c, boolean notify) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(VERSION_URL + "?t=" + System.currentTimeMillis()).openConnection();
            h.setConnectTimeout(10000); h.setReadTimeout(10000); h.setUseCaches(false);
            if (h.getResponseCode() != 200) { h.disconnect(); return -1; }
            StringBuilder sb = new StringBuilder();
            try (InputStream is = h.getInputStream()) {
                byte[] buf = new byte[512]; int n;
                while ((n = is.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            }
            h.disconnect();
            JSONObject j = new JSONObject(sb.toString());
            int code = j.optInt("versionCode", 0);
            String name = j.optString("versionName", "");
            if (notify && code > installedCode(c)) {
                SharedPreferences sp = c.getSharedPreferences("lb_driver", Context.MODE_PRIVATE);
                if (sp.getInt("notified", 0) < code) {     // tell the driver once per new version
                    if (show(c, name)) sp.edit().putInt("notified", code).apply();
                }
            }
            return code;
        } catch (Exception e) { return -1; }
    }

    private static boolean show(Context c, String name) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CH, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
            Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(PAGE_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
            nb.setContentTitle("Lalabella Driver update")
                    .setContentText("New version " + name + " is ready. Tap to download.")
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentIntent(pi).setAutoCancel(true);
            nm.notify(2, nb.build());
            return true;
        } catch (Exception e) { return false; }
    }
}
