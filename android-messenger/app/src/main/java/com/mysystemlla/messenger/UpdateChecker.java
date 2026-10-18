package com.mysystemlla.messenger;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

/** Looks at downloads/messenger-app-version.json on the website and tells the person when a newer app is ready. */
final class UpdateChecker {
    static final String VERSION_URL = "https://mysystemlla.com/downloads/messenger-app-version.json";
    static final String PAGE_URL = "https://mysystemlla.com/get-app.html?app=messenger&dl=1";
    static final String CH = "lbm_updates";

    private UpdateChecker() { }

    static int installedCode(Context c) {
        try {
            android.content.pm.PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return (int) (Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
        } catch (Exception e) { return 0; }
    }

    static boolean newer(Context c) { return Store.i(c, "latestCode", 0) > installedCode(c); }

    /** Background check (at most every 30 minutes unless force). cb runs on the main thread when finished. */
    static void check(final Context ctx, final boolean force, final Runnable cb) {
        final Context c = ctx.getApplicationContext();
        long last = Store.sp(c).getLong("updAt", 0);
        if (!force && System.currentTimeMillis() - last < 30 * 60 * 1000L) return;
        new Thread(() -> {
            checkSync(c);
            if (cb != null) Ui.MAIN.post(cb);
        }).start();
    }

    /** Runs on the calling (background) thread. Returns true when it could reach the server. */
    static boolean checkSync(Context c) {
        JSONObject j = Api.http("GET", VERSION_URL + "?t=" + System.currentTimeMillis(), null);
        // the version file has no "success" field: look for versionCode
        if (j.optInt("versionCode", 0) <= 0) return false;
        Store.sp(c).edit().putInt("latestCode", j.optInt("versionCode")).putString("latestName", j.optString("versionName")).putLong("updAt", System.currentTimeMillis()).apply();
        return true;
    }

    static void openDownload(Context c) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(PAGE_URL));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception ignored) { }
    }

    /** Called by the background service: one notification per new version. */
    static void notifyIfNew(Context c) {
        try {
            if (!newer(c)) return;
            int code = Store.i(c, "latestCode", 0);
            if (Store.i(c, "updNotified", 0) >= code) return;
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(PAGE_URL));
            b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Lalabella Messenger update")
                    .setContentText("Version " + Store.s(c, "latestName") + " is ready. Tap to download.")
                    .setAutoCancel(true).setColor(Ui.ACC)
                    .setContentIntent(PendingIntent.getActivity(c, 77, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            nm.notify(7777, b.build());
            Store.put(c, "updNotified", code);
        } catch (Throwable ignored) { }
    }
}
