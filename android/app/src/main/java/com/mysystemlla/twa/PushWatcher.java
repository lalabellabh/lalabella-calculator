package com.mysystemlla.twa;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Watches for Chrome (website) notifications from Lalabella (new chat message / new order).
 *  - refreshes the home-screen widget right away
 *  - shows a Messenger-style pop-up (heads-up) notification; tapping it opens that exact chat or the orders page
 * Needs "Notification access" turned ON for Lalabella (Android settings).
 */
public class PushWatcher extends NotificationListenerService {
    private static final String CHANNEL = "lb_alerts";
    private static final String SITE = "https://mysystemlla.com/";
    private static final Pattern DM = Pattern.compile("chat-d(\\d+)");
    private static final Pattern GRP = Pattern.compile("chat-g(\\d+)");

    private final Handler handler = new Handler(Looper.getMainLooper());

    private static boolean fromChrome(StatusBarNotification sbn) {
        String p = sbn == null ? null : sbn.getPackageName();
        return p != null && (p.equals("com.android.chrome") || p.startsWith("com.chrome.") || p.equals("com.google.android.apps.chrome"));
    }

    private static String str(Bundle e, String k) {
        CharSequence c = e == null ? null : e.getCharSequence(k);
        return c == null ? "" : c.toString();
    }

    /** Is this Chrome notification from the Lalabella website? */
    private static boolean fromLalabella(StatusBarNotification sbn, String title, String sub) {
        String tag = sbn.getTag() == null ? "" : sbn.getTag();
        if (tag.contains("mysystemlla.com") || sub.contains("mysystemlla.com")) return true;
        return title.startsWith("New order to assign") || title.endsWith("new orders to assign") || title.contains(" · Team chat");
    }

    private boolean appInForeground() {
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            List<ActivityManager.RunningAppProcessInfo> l = am.getRunningAppProcesses();
            if (l == null) return false;
            for (ActivityManager.RunningAppProcessInfo p : l) {
                if (p.processName.equals(getPackageName())) {
                    return p.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (!fromChrome(sbn)) return;
        Context ctx = getApplicationContext();
        LbWidgetProvider.refreshAll(ctx);
        try {
            popup(sbn);
        } catch (Exception ignored) { /* Chrome's own notification stays if anything goes wrong */ }
    }

    private void popup(StatusBarNotification sbn) {
        Notification n = sbn.getNotification();
        Bundle e = n == null ? null : n.extras;
        String title = str(e, Notification.EXTRA_TITLE);
        String text = str(e, Notification.EXTRA_TEXT);
        String sub = str(e, Notification.EXTRA_SUB_TEXT);
        if (!fromLalabella(sbn, title, sub)) return;
        if (appInForeground()) return; // already looking at the app: no pop-up needed

        String tag = sbn.getTag() == null ? "" : sbn.getTag();
        String path = "index.html";
        boolean chat = true;
        String key = "lb-chat";
        Matcher m;
        if ((m = DM.matcher(tag)).find()) { path = "chatbox.html?dm=" + m.group(1); key = "lb-dm-" + m.group(1); }
        else if ((m = GRP.matcher(tag)).find()) { path = "chatbox.html?g=" + m.group(1); key = "lb-g-" + m.group(1); }
        else if (tag.contains("chat-team") || title.contains(" · Team chat")) { path = "chatbox.html?team=1"; key = "lb-team"; }
        else if (tag.contains("orders") || title.contains("to assign")) { path = "index.html"; chat = false; key = "lb-orders"; }
        else if (title.equals("Lalabella")) return; // test notification: leave Chrome's own
        else path = "chatbox.html";

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Orders & messages", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(LbWidgetProvider.site(this, path)));
        open.setPackage(getPackageName());
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, key.hashCode(), open, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFFC9506B)
                .setContentTitle(title.length() == 0 ? "Lalabella" : title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setCategory(chat ? Notification.CATEGORY_MESSAGE : Notification.CATEGORY_EVENT)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
        try {
            b.setLargeIcon(BitmapFactory.decodeResource(getResources(), chat ? R.drawable.lb_bubble_3d : R.drawable.lb_bell_3d));
        } catch (Exception ignored) { }
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        nm.notify(key, 1, b.build());
        // our pop-up replaces Chrome's copy so there is only one
        try { cancelNotification(sbn.getKey()); } catch (Exception ignored) { }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (!fromChrome(sbn)) return;
        final Context ctx = getApplicationContext();
        // opened/dismissed: give the website a moment to save "read", then refresh the counts
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                LbWidgetProvider.refreshAll(ctx);
            }
        }, 20000);
    }
}
