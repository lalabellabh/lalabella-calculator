package com.mysystemlla.twa;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Watches for Chrome (website) notifications, e.g. a new Lalabella chat message or order, and refreshes the
 * home-screen widget right away. Needs "Notification access" turned ON for Lalabella (Android settings).
 * It only looks at which app posted the notification, never at its content.
 */
public class PushWatcher extends NotificationListenerService {
    private final Handler handler = new Handler(Looper.getMainLooper());

    private static boolean fromChrome(StatusBarNotification sbn) {
        String p = sbn == null ? null : sbn.getPackageName();
        return p != null && (p.equals("com.android.chrome") || p.startsWith("com.chrome.") || p.equals("com.google.android.apps.chrome"));
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (fromChrome(sbn)) LbWidgetProvider.refreshAll(getApplicationContext());
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
