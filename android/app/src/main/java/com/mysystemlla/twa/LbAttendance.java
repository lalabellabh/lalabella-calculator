package com.mysystemlla.twa;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Attendance alarms: one minute before Time In, Break, End of break and Time Out.
 * The server (attendance-fast / wsum) works out the times from today's duty schedule and what the person already
 * punched; this class only schedules them as real alarms (they ring even when the app is closed).
 */
public class LbAttendance {
    static final String API = "https://zoratiahjeldgsognfsj.supabase.co/functions/v1/attendance-fast";
    static final String CHANNEL = "lb_att_alarm";
    static final String ACTION_FIRE = "com.mysystemlla.twa.ATT_ALARM";
    static final String ACTION_SYNC = "com.mysystemlla.twa.ATT_SYNC";
    static final int MAX_ALARMS = 8;
    static final long RESYNC_MS = 3 * 60 * 60 * 1000L;

    private static long lastSync = 0;

    /** Fetch today's alarm times and (re)schedule them. Safe to call often; runs on its own thread. */
    static void sync(final Context app, long minGapMs) {
        final Context ctx = app.getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        if (!sp.getBoolean("attOn", true) || sp.getString("key", "").isEmpty()) {
            cancelAll(ctx);
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastSync < minGapMs) return;
        lastSync = now;
        new Thread(new Runnable() {
            @Override
            public void run() {
                syncNow(ctx);
            }
        }).start();
    }

    /** Same as sync() but on the calling thread (used by the alarm receiver, which is already off the main thread). */
    static void syncNow(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        String key = sp.getString("key", "");
        try {
            if (!sp.getBoolean("attOn", true) || key.isEmpty()) {
                cancelAll(ctx);
                return;
            }
            String res = LbWidgetProvider.httpPost(API, new JSONObject().put("action", "wsum").put("key", key).toString());
            int nl = res.indexOf('\n');
            int code = Integer.parseInt(res.substring(0, nl));
            JSONObject j = new JSONObject(res.substring(nl + 1));
            if (code == 401) { // unlinked or revoked: no alarms
                cancelAll(ctx);
                return;
            }
            if (code != 200 || !j.optBoolean("success")) throw new Exception("bad " + code);
            schedule(ctx, j.optJSONArray("events"));
        } catch (Exception e) {
            // offline: keep the alarms we already have, and try again soon
        } finally {
            scheduleResync(ctx);
        }
    }

    private static PendingIntent firePi(Context ctx, int slot, String title, String text, int flagExtra) {
        Intent i = new Intent(ctx, LbAttReceiver.class).setAction(ACTION_FIRE).setData(Uri.parse("lbatt://alarm/" + slot));
        i.putExtra("title", title).putExtra("text", text);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | flagExtra | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, slot, i, flags);
    }

    private static PendingIntent showPi(Context ctx) {
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(LbWidgetProvider.SITE + "attendance.html"));
        open.setPackage(ctx.getPackageName());
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, 900, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    }

    static void cancelAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int s = 0; s < MAX_ALARMS; s++) {
            try {
                am.cancel(firePi(ctx, s, "", "", 0));
            } catch (Exception ignored) { }
        }
    }

    private static void schedule(Context ctx, JSONArray events) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        cancelAll(ctx);
        if (events == null) return;
        long now = System.currentTimeMillis();
        int slot = 0;
        for (int i = 0; i < events.length() && slot < MAX_ALARMS; i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null) continue;
            long at = e.optLong("atMs", 0);
            if (at <= now + 2000) continue;
            try {
                // setAlarmClock needs no special permission and is delivered on time even in Doze.
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPi(ctx)), firePi(ctx, slot, e.optString("title"), e.optString("text"), 0));
                slot++;
            } catch (Exception ignored) { }
        }
    }

    /** A quiet "check again later" so the chain never breaks, even if the app is never opened. */
    private static void scheduleResync(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, LbAttReceiver.class).setAction(ACTION_SYNC);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, 901, i, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            long at = System.currentTimeMillis() + RESYNC_MS;
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.set(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (Exception ignored) { }
    }

    static void ring(Context ctx, String title, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Attendance alarms", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("1 minute before Time In, Break and Time Out");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
            ch.setSound(sound, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.setBypassDnd(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFFC9506B)
                .setContentTitle(title.isEmpty() ? "Attendance" : title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(showPi(ctx))
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setWhen(System.currentTimeMillis());
        if (Build.VERSION.SDK_INT < 26) {
            b.setSound(sound, AudioManager.STREAM_ALARM).setPriority(Notification.PRIORITY_MAX).setVibrate(new long[]{0, 500, 250, 500, 250, 500});
        }
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(10 * 60 * 1000L);
        try {
            nm.notify((int) (System.currentTimeMillis() % 100000) + 3000, b.build());
        } catch (Exception ignored) { }
    }
}
