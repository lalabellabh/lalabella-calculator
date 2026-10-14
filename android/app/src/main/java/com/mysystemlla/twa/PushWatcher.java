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
    static final String CHANNEL = "lb_alerts";
    static final String CHANNEL_QUIET = "lb_alerts_quiet";
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
        int peer = 0, grp = 0;
        boolean team = false;
        Matcher m;
        if ((m = DM.matcher(tag)).find()) { path = "chatbox.html?dm=" + m.group(1); key = "lb-dm-" + m.group(1); peer = Integer.parseInt(m.group(1)); }
        else if ((m = GRP.matcher(tag)).find()) { path = "chatbox.html?g=" + m.group(1); key = "lb-g-" + m.group(1); grp = Integer.parseInt(m.group(1)); }
        else if (tag.contains("chat-team") || title.contains(" · Team chat")) { path = "chatbox.html?team=1"; key = "lb-team"; team = true; }
        else if (tag.contains("orders") || title.contains("to assign")) { path = "index.html"; chat = false; key = "lb-orders"; }
        else if (title.equals("Lalabella")) return; // test notification: leave Chrome's own
        else path = "chatbox.html";

        final Context ctx = getApplicationContext();
        final String fKey = key, fPath = path, fTitle = title, fText = text, fSbnKey = sbn.getKey();
        final boolean fChat = chat, fTeam = team;
        final int fPeer = peer, fGrp = grp;
        // the sender's picture comes from the network, so build and show our copy on a background thread
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (fChat) LbAvatar.fetch(ctx, fKey, fPeer, fGrp, fTeam, senderName(fTitle));
                    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    Notification out = build(ctx, fKey, fPath, fChat, fTitle, fText, "", fPeer, fGrp, fTeam, false);
                    if (fChat) shortcutFor(ctx, fKey, fTitle, fPeer, fGrp, fTeam);   // lets Android show it as a chat bubble
                    nm.notify(fKey, 1, out);
                    // our pop-up replaces Chrome's copy so there is only one
                    try { cancelNotification(fSbnKey); } catch (Exception ignored) { }
                } catch (Exception ignored) { /* Chrome's own notification stays if anything goes wrong */ }
            }
        }).start();
    }

    static String mode(Context ctx) {
        String m = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).getString("chatMode", "bubble");
        return "popup".equals(m) || "quiet".equals(m) ? m : "bubble";
    }

    private static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Orders & messages", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_QUIET) == null) {
            // "Notification only": sits in the notification list with a Reply box, no pop-up over the screen
            NotificationChannel q = new NotificationChannel(CHANNEL_QUIET, "Messages (no pop-up)", NotificationManager.IMPORTANCE_DEFAULT);
            q.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(q);
        }
    }

    /** A long-lived shortcut for this chat: Android needs it before it will show the message as a bubble (Android 11+). */
    static void shortcutFor(Context ctx, String key, String title, int peer, int grp, boolean team) {
        if (Build.VERSION.SDK_INT < 30 || !"bubble".equals(mode(ctx))) return;
        try {
            android.content.pm.ShortcutManager sm = (android.content.pm.ShortcutManager) ctx.getSystemService(Context.SHORTCUT_SERVICE);
            if (sm == null) return;
            android.graphics.Bitmap av = LbAvatar.cached(ctx, key, senderName(title));
            android.app.Person p = new android.app.Person.Builder().setName(senderName(title)).setKey(key).setImportant(true)
                    .setIcon(android.graphics.drawable.Icon.createWithBitmap(av)).build();
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(LbWidgetProvider.site(ctx, chatPath(peer, grp, team))));
            i.setPackage(ctx.getPackageName());
            android.content.pm.ShortcutInfo si = new android.content.pm.ShortcutInfo.Builder(ctx, key)
                    .setShortLabel(senderName(title).length() == 0 ? "Chat" : senderName(title))
                    .setLongLived(true)
                    .setPerson(p)
                    .setIcon(android.graphics.drawable.Icon.createWithBitmap(av))
                    .setIntent(i)
                    .build();
            sm.pushDynamicShortcut(si);
        } catch (Exception ignored) { }
    }

    static String chatPath(int peer, int grp, boolean team) {
        if (peer > 0) return "chatbox.html?dm=" + peer;
        if (grp > 0) return "chatbox.html?g=" + grp;
        return team ? "chatbox.html?team=1" : "chatbox.html";
    }

    /** "Maria · Team chat" -> "Maria". */
    static String senderName(String title) {
        if (title == null) return "";
        int i = title.indexOf(" · ");
        return (i > 0 ? title.substring(0, i) : title).trim();
    }

    /**
     * Builds our own notification. chat notifications get a Reply box; with "bubble" mode (Android 11+) they can float as a bubble.
     * orig = the message being answered, mine = what you just replied (shown after a Reply), alertOnce = do not buzz again.
     */
    static Notification build(Context ctx, String key, String path, boolean chat, String title, String text, String mine,
                              int peer, int grp, boolean team, boolean alertOnce) {
        ensureChannels(ctx);
        String mode = mode(ctx);
        boolean quiet = chat && "quiet".equals(mode);
        String channel = quiet ? CHANNEL_QUIET : CHANNEL;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(LbWidgetProvider.site(ctx, path)));
        open.setPackage(ctx.getPackageName());
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, key.hashCode(), open, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, channel) : new Notification.Builder(ctx);
        String shown = mine.length() > 0 ? text + "\nYou: " + mine : text;
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFFC9506B)
                .setContentTitle(title.length() == 0 ? "Lalabella" : title)
                .setContentText(mine.length() > 0 ? "You: " + mine : text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setCategory(chat ? Notification.CATEGORY_MESSAGE : Notification.CATEGORY_EVENT)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (alertOnce) b.setOnlyAlertOnce(true);
        android.graphics.Bitmap av = chat ? LbAvatar.cached(ctx, key, senderName(title)) : null;
        try {
            b.setLargeIcon(av != null ? av : BitmapFactory.decodeResource(ctx.getResources(), chat ? R.drawable.lb_bubble_3d : R.drawable.lb_bell_3d));
        } catch (Exception ignored) { }
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(quiet ? Notification.PRIORITY_DEFAULT : Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }

        boolean replyOk = chat && (peer > 0 || grp > 0 || team) && !ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).getString("key", "").isEmpty();
        boolean bubble = replyOk && Build.VERSION.SDK_INT >= 30 && "bubble".equals(mode);
        boolean styled = false;
        if (bubble) {
            try {
                android.app.Person me = new android.app.Person.Builder().setName("You").build();
                android.app.Person them = new android.app.Person.Builder().setName(senderName(title).length() == 0 ? "Chat" : senderName(title)).setKey(key).setImportant(true)
                        .setIcon(android.graphics.drawable.Icon.createWithBitmap(av)).build();
                Notification.MessagingStyle ms = new Notification.MessagingStyle(me);
                if (team) ms.setConversationTitle(title.contains(" · ") ? title.substring(title.indexOf(" · ") + 3) : title);
                if (text.length() > 0) ms.addMessage(text, System.currentTimeMillis() - 1000, them);
                if (mine.length() > 0) ms.addMessage(mine, System.currentTimeMillis(), me);
                b.setStyle(ms).setShortcutId(key);
                Intent bi = new Intent(ctx, LbBubbleActivity.class)
                        .putExtra("title", title).putExtra("peer", peer).putExtra("grp", grp).putExtra("team", team).putExtra("path", path);
                bi.setAction("lb.bubble." + key);
                PendingIntent bpi = PendingIntent.getActivity(ctx, key.hashCode() + 7, bi, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0));
                Notification.BubbleMetadata bm = new Notification.BubbleMetadata.Builder(bpi,
                        android.graphics.drawable.Icon.createWithBitmap(av))
                        .setDesiredHeight(520)
                        .setAutoExpandBubble(false)
                        .setSuppressNotification(false)
                        .build();
                b.setBubbleMetadata(bm);
                styled = true;
            } catch (Exception ignored) { styled = false; }
        }
        if (!styled) b.setStyle(new Notification.BigTextStyle().bigText(shown));

        if (replyOk) {
            try {
                Intent ri = new Intent(ctx, LbReplyReceiver.class).setAction("lb.reply." + key)
                        .putExtra("nkey", key).putExtra("path", path).putExtra("title", title).putExtra("orig", text)
                        .putExtra("peer", peer).putExtra("grp", grp).putExtra("team", team);
                PendingIntent rpi = PendingIntent.getBroadcast(ctx, key.hashCode() + 3, ri,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0));
                android.app.RemoteInput rin = new android.app.RemoteInput.Builder(LbReplyReceiver.KEY_TEXT).setLabel("Reply…").build();
                Notification.Action.Builder ab = new Notification.Action.Builder(R.drawable.ic_stat, "Reply", rpi).addRemoteInput(rin);
                if (Build.VERSION.SDK_INT >= 28) ab.setSemanticAction(Notification.Action.SEMANTIC_ACTION_REPLY);
                b.addAction(ab.build());
            } catch (Exception ignored) { }
        }
        return b.build();
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
