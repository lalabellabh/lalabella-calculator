package com.mysystemlla.messenger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Keeps listening for new messages (foreground service) and shows Messenger-style notifications.
 * Only this app notifies — the website and the main Lalabella app do not.
 */
public class WatchService extends Service {
    private static final String CH_SVC = "lbm_service", CH_SOUND = "lbm_msg_sound", CH_QUIET = "lbm_msg_quiet";
    private static final int SVC_ID = 4711;

    private volatile boolean run;
    private Thread worker;
    private long peopleAt;

    static void start(Context c) {
        Intent i = new Intent(c, WatchService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { }
    }
    static void stop(Context c) { try { c.stopService(new Intent(c, WatchService.class)); } catch (Exception ignored) { } }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        channels(this);
    }

    @Override public int onStartCommand(Intent in, int flags, int id) {
        Notification n = serviceNote();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(SVC_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(SVC_ID, n);
        } catch (Throwable t) { stopSelf(); return START_NOT_STICKY; }
        if (worker == null || !worker.isAlive()) {
            run = true;
            worker = new Thread(this::loop, "lbm-watch");
            worker.start();
        }
        return START_STICKY;
    }

    @Override public void onDestroy() {
        run = false;
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }

    @Override public void onTaskRemoved(Intent rootIntent) { super.onTaskRemoved(rootIntent); }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel s = new NotificationChannel(CH_SVC, "Running in background", NotificationManager.IMPORTANCE_MIN);
        s.setShowBadge(false);
        nm.createNotificationChannel(s);
        NotificationChannel m = new NotificationChannel(CH_SOUND, "Messages", NotificationManager.IMPORTANCE_HIGH);
        m.enableVibration(true);
        m.setShowBadge(true);
        nm.createNotificationChannel(m);
        NotificationChannel q = new NotificationChannel(CH_QUIET, "Messages (silent)", NotificationManager.IMPORTANCE_DEFAULT);
        q.setSound(null, null);
        q.enableVibration(false);
        q.setShowBadge(true);
        nm.createNotificationChannel(q);
    }

    private Notification serviceNote() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_SVC) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Lalabella Messenger").setContentText("Listening for new messages").setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MIN);
        return b.build();
    }

    // ------------------------------------------------------------ loop
    private void loop() {
        while (run) {
            try { poll(); } catch (Throwable ignored) { }
            long wait = 8000;
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (!Ui.appVisible() && pm != null && !pm.isInteractive()) wait = 20000;
                else if (!Ui.appVisible()) wait = 10000;
            } catch (Throwable ignored) { }
            try { Thread.sleep(wait); } catch (InterruptedException e) { if (!run) return; }
        }
    }

    private static String convBody(String key) { return key; }

    private JSONObject listBody(String key, long since, int limit) {
        JSONObject o = Api.o("action", "list", "limit", limit);
        try {
            if (since > 0) o.put("sinceId", since);
            if (key.startsWith("d")) o.put("peerId", Long.parseLong(key.substring(1)));
            else if (key.startsWith("g")) o.put("groupId", Long.parseLong(key.substring(1)));
        } catch (Exception ignored) { }
        return o;
    }

    private void refreshDirectory(Context c) {
        if (System.currentTimeMillis() - peopleAt < 300000) return;
        JSONObject pr = Api.chat(c, Api.o("action", "people"));
        if (pr.optBoolean("success") && pr.optJSONArray("people") != null) {
            Store.sp(c).edit().putLong("meId", pr.optLong("meId")).putString("people", pr.optJSONArray("people").toString()).apply();
            peopleAt = System.currentTimeMillis();
        }
        JSONObject gr = Api.chat(c, Api.o("action", "groups"));
        if (gr.optBoolean("success") && gr.optJSONArray("groups") != null) Store.put(c, "groupsCache", gr.optJSONArray("groups").toString());
    }

    private String avatarOf(Context c, long uid) {
        try {
            JSONArray a = new JSONArray(Store.s(c, "people"));
            for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optLong("id") == uid) return a.optJSONObject(i).optString("avatar", "");
        } catch (Exception ignored) { }
        return "";
    }
    private String groupName(Context c, long gid) {
        try {
            JSONArray a = new JSONArray(Store.s(c, "groupsCache"));
            for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optLong("id") == gid) return a.optJSONObject(i).optString("name", "Group");
        } catch (Exception ignored) { }
        return "Group";
    }

    private void poll() {
        final Context c = getApplicationContext();
        if (!Store.loggedIn(c) || !Store.b(c, "notif", true)) { run = false; stopSelf(); return; }
        refreshDirectory(c);
        long meId = Store.meId(c);

        JSONObject seen = Store.seenAll(c);
        JSONObject seenDm = new JSONObject(), seenGrp = new JSONObject();
        try {
            Iterator<String> it = seen.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (k.startsWith("d")) seenDm.put(k.substring(1), seen.optLong(k));
                else if (k.startsWith("g")) seenGrp.put(k.substring(1), seen.optLong(k));
            }
        } catch (Exception ignored) { }
        JSONObject ur = Api.chat(c, Api.o("action", "unread", "seenGroup", seen.optLong("t", 0), "seenDm", seenDm, "seenGrp", seenGrp));
        if (!ur.optBoolean("success")) return;

        LinkedHashMap<String, Integer> counts = new LinkedHashMap<>();
        if (ur.optInt("group") > 0) counts.put("t", ur.optInt("group"));
        JSONObject dm = ur.optJSONObject("dm"), grp = ur.optJSONObject("grp");
        try {
            if (dm != null) { Iterator<String> it = dm.keys(); while (it.hasNext()) { String k = it.next(); if (dm.optInt(k) > 0) counts.put("d" + k, dm.optInt(k)); } }
            if (grp != null) { Iterator<String> it = grp.keys(); while (it.hasNext()) { String k = it.next(); if (grp.optInt(k) > 0) counts.put("g" + k, grp.optInt(k)); } }
        } catch (Exception ignored) { }

        // first run: everything already there counts as read (so you don't get a flood of old notifications)
        if (!Store.b(c, "baselined", false)) {
            for (String key : counts.keySet()) {
                JSONObject r = Api.chat(c, listBody(key, 0, 1));
                JSONArray ms = r.optJSONArray("messages");
                if (ms != null && ms.length() > 0) Store.setSeen(c, key, ms.optJSONObject(ms.length() - 1).optLong("id"));
            }
            Store.put(c, "baselined", true);
            return;
        }

        JSONObject lastCnt, notified, recentMap;
        try { lastCnt = new JSONObject(Store.s(c, "lastCnt").length() > 0 ? Store.s(c, "lastCnt") : "{}"); } catch (Exception e) { lastCnt = new JSONObject(); }
        try { notified = new JSONObject(Store.s(c, "notified").length() > 0 ? Store.s(c, "notified") : "{}"); } catch (Exception e) { notified = new JSONObject(); }
        try { recentMap = new JSONObject(Store.s(c, "recent").length() > 0 ? Store.s(c, "recent") : "{}"); } catch (Exception e) { recentMap = new JSONObject(); }

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        int total = 0;
        String bubbleTitle = "", bubbleAvatar = "", bubbleType = "t";
        long bubbleId = 0, bubbleConv = 0, bubbleTime = 0;

        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            String key = e.getKey();
            int count = e.getValue();
            total += count;
            if (count != lastCnt.optInt(key, 0)) {
                long since = Math.max(Store.seen(c, key), notified.optLong(key, 0));
                JSONObject r = Api.chat(c, listBody(key, since, 20));
                JSONArray ms = r.optJSONArray("messages");
                ArrayList<JSONObject> fresh = new ArrayList<>();
                long maxId = since;
                if (ms != null) for (int i = 0; i < ms.length(); i++) {
                    JSONObject m = ms.optJSONObject(i);
                    if (m == null) continue;
                    maxId = Math.max(maxId, m.optLong("id"));
                    if (m.optLong("userId") != meId) fresh.add(m);
                }
                if (!fresh.isEmpty()) {
                    JSONObject last = fresh.get(fresh.size() - 1);
                    String type = key.substring(0, 1);
                    long convId = key.length() > 1 ? Long.parseLong(key.substring(1)) : 0;
                    String title = type.equals("t") ? "Lalabella Team" : type.equals("g") ? groupName(c, convId) : last.optString("name", "Message");
                    String avatar = avatarOf(c, last.optLong("userId"));
                    String preview = type.equals("d") ? last.optString("text") : last.optString("name") + ": " + last.optString("text");
                    try {
                        JSONObject rc = new JSONObject();
                        rc.put("key", key); rc.put("title", title); rc.put("text", preview); rc.put("time", Ui.parseIso(last.optString("time")));
                        rc.put("avatar", avatar); rc.put("type", type); rc.put("id", convId); rc.put("uid", last.optLong("userId"));
                        recentMap.put(key, rc);
                    } catch (Exception ignored) { }
                    if (!Ui.appVisible()) notifyMsg(c, nm, key, type, convId, title, avatar, fresh, count);
                }
                if (maxId > since) { try { notified.put(key, maxId); } catch (Exception ignored) { } }
                try { lastCnt.put(key, count); } catch (Exception ignored) { }
            }
            JSONObject rc = recentMap.optJSONObject(key);
            if (rc != null && rc.optLong("time") >= bubbleTime) {
                bubbleTime = rc.optLong("time"); bubbleTitle = rc.optString("title"); bubbleAvatar = rc.optString("avatar");
                bubbleType = rc.optString("type"); bubbleConv = rc.optLong("id"); bubbleId = rc.optLong("uid");
            }
        }
        // conversations that are read now: clear their notification and counters
        ArrayList<String> gone = new ArrayList<>();
        Iterator<String> lit = lastCnt.keys();
        while (lit.hasNext()) { String k = lit.next(); if (!counts.containsKey(k)) gone.add(k); }
        for (String k : gone) {
            lastCnt.remove(k);
            try { if (nm != null) nm.cancel(k.hashCode()); } catch (Exception ignored) { }
        }
        // per-conversation unread for the widget
        try {
            Iterator<String> rit = recentMap.keys();
            while (rit.hasNext()) { String k = rit.next(); recentMap.getJSONObject(k).put("unread", counts.containsKey(k) ? counts.get(k) : 0); }
        } catch (Exception ignored) { }

        int prevTotal = Store.i(c, "unreadTotal", -1);
        String oldRecent = Store.s(c, "recent");
        Store.sp(c).edit().putString("lastCnt", lastCnt.toString()).putString("notified", notified.toString()).putString("recent", recentMap.toString()).putInt("unreadTotal", total).apply();
        if (prevTotal != total || !oldRecent.equals(recentMap.toString())) MsgWidget.refresh(c);

        if (total > 0 && Store.b(c, "bubble", false) && !Ui.appVisible()) {
            Bubble.show(c, bubbleTitle, bubbleAvatar, bubbleId, total, bubbleType, bubbleConv);
        } else {
            Bubble.hide(c);
        }
    }

    private void notifyMsg(Context c, NotificationManager nm, String key, String type, long convId, String title, String avatar, ArrayList<JSONObject> fresh, int count) {
        if (nm == null) return;
        boolean sound = Store.b(c, "sound", true);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, sound ? CH_SOUND : CH_QUIET) : new Notification.Builder(c);
        JSONObject last = fresh.get(fresh.size() - 1);
        StringBuilder sb = new StringBuilder();
        int from = Math.max(0, fresh.size() - 5);
        for (int i = from; i < fresh.size(); i++) {
            JSONObject m = fresh.get(i);
            if (sb.length() > 0) sb.append('\n');
            if (!type.equals("d")) sb.append(m.optString("name")).append(": ");
            sb.append(m.optString("text"));
        }
        String one = type.equals("d") ? last.optString("text") : last.optString("name") + ": " + last.optString("text");
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(one)
                .setStyle(new Notification.BigTextStyle().bigText(sb.toString()))
                .setAutoCancel(true).setCategory(Notification.CATEGORY_MESSAGE)
                .setWhen(Ui.parseIso(last.optString("time"))).setShowWhen(true)
                .setColor(Ui.ACC);
        if (count > 1) b.setNumber(count);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_HIGH);
            b.setDefaults(sound ? Notification.DEFAULT_ALL : 0);
        }
        if (avatar.length() > 0) {
            Bitmap bm = Ui.loadSync(avatar, 128);
            if (bm != null) b.setLargeIcon(Ui.circle(bm, 128));
        }
        Intent chat = new Intent(c, ChatActivity.class);
        chat.putExtra("type", type).putExtra("id", convId).putExtra("title", title).putExtra("avatar", avatar);
        android.app.TaskStackBuilder tsb = android.app.TaskStackBuilder.create(c);
        tsb.addNextIntent(new Intent(c, MainActivity.class));
        tsb.addNextIntent(chat);
        PendingIntent pi = tsb.getPendingIntent(key.hashCode(), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setContentIntent(pi);
        try { nm.notify(key.hashCode(), b.build()); } catch (Exception ignored) { }
    }
}
