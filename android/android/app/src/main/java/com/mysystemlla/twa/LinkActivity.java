package com.mysystemlla.twa;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

import java.util.regex.Pattern;

/** Opened by lalabella://widget?key=... from the website. Saves the widget key and refreshes the widget. */
public class LinkActivity extends Activity {
    private static final Pattern KEY = Pattern.compile("^[a-f0-9]{40}$");

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Uri u = getIntent() == null ? null : getIntent().getData();
        if (u != null && "att".equals(u.getHost())) { // lalabella://att?on=1|0 — Attendance alarms on/off
            boolean on = !"0".equals(u.getQueryParameter("on"));
            getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putBoolean("attOn", on).apply();
            if (on) LbAttendance.sync(this, 0); else LbAttendance.cancelAll(this);
            Toast.makeText(this, on ? "Attendance alarms ON ⏰" : "Attendance alarms OFF", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        if (u != null && "chatclear".equals(u.getHost())) { // lalabella://chatclear?p=<peerId>&id=<newest message id> — "Delete conversation" on the website
            try {
                int pe = Integer.parseInt(u.getQueryParameter("p"));
                long id = Long.parseLong(u.getQueryParameter("id"));
                SharedPreferences sp0 = getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
                if (pe > 0 && id > sp0.getLong("clr_" + pe, 0)) sp0.edit().putLong("clr_" + pe, id).apply();
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel("lb-dm-" + pe, 1);
            } catch (Exception ignored) { }
            finish();
            return;
        }
        if (u != null && "chatmode".equals(u.getHost())) { // lalabella://chatmode?m=bubble|popup|quiet — how chat notifications show
            String m = u.getQueryParameter("m");
            if (!"popup".equals(m) && !"quiet".equals(m)) m = "bubble";
            getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putString("chatMode", m).apply();
            Toast.makeText(this, "bubble".equals(m) ? "Chat alerts: bubble + pop-up 💬" : "popup".equals(m) ? "Chat alerts: pop-up only" : "Chat alerts: notification only (with Reply)", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        String key = u == null ? null : u.getQueryParameter("key");
        if (key != null && KEY.matcher(key).matches()) {
            getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("key", key).remove("data").apply();
            LbWidgetProvider.refreshAll(this);
            LbAttendance.sync(this, 0);
            Toast.makeText(this, "Widget linked ✅  Long-press your home screen → Widgets → Lalabella", Toast.LENGTH_LONG).show();
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                try { requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1); } catch (Exception ignored) { }
            }
            if (!listenerEnabled()) { // one-time: lets the widget refresh the moment a notification arrives
                Toast.makeText(this, "Next: turn ON \"Lalabella\" for instant widget updates", Toast.LENGTH_LONG).show();
                try {
                    startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) { }
            }
        } else {
            Toast.makeText(this, "Invalid widget link.", Toast.LENGTH_SHORT).show();
        }
        finish();
    }

    private boolean listenerEnabled() {
        String s = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return s != null && s.contains(getPackageName());
    }
}
