package com.mysystemlla.twa;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import org.json.JSONObject;

/** Sends the text typed into a notification's Reply box to the chat, then updates the notification ("You: ..."). */
public class LbReplyReceiver extends BroadcastReceiver {
    static final String KEY_TEXT = "lb_reply_text";
    static final String CHATX = "https://zoratiahjeldgsognfsj.supabase.co/functions/v1/chatx";

    @Override
    public void onReceive(final Context ctx, final Intent in) {
        Bundle r = RemoteInput.getResultsFromIntent(in);
        CharSequence cs = r == null ? null : r.getCharSequence(KEY_TEXT);
        final String msg = cs == null ? "" : cs.toString().trim();
        final String nkey = in.getStringExtra("nkey");
        final String path = in.getStringExtra("path");
        final String title = in.getStringExtra("title") == null ? "" : in.getStringExtra("title");
        final String orig = in.getStringExtra("orig") == null ? "" : in.getStringExtra("orig");
        final int peer = in.getIntExtra("peer", 0), grp = in.getIntExtra("grp", 0);
        final boolean team = in.getBooleanExtra("team", false);
        if (nkey == null || path == null || msg.isEmpty()) return;
        final PendingResult pr = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean ok = false;
                try {
                    String key = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).getString("key", "");
                    if (!key.isEmpty()) {
                        JSONObject req = new JSONObject().put("action", "keyReply").put("key", key).put("text", msg);
                        if (peer > 0) req.put("peerId", peer); else if (grp > 0) req.put("groupId", grp); else if (team) req.put("team", true);
                        String res = LbWidgetProvider.httpPost(CHATX, req.toString());
                        int nl = res.indexOf('\n');
                        ok = Integer.parseInt(res.substring(0, nl)) == 200 && new JSONObject(res.substring(nl + 1)).optBoolean("success");
                    }
                } catch (Exception ignored) { }
                try {
                    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    // always update the notification, otherwise Android keeps showing the "sending" spinner
                    Notification n = ok
                            ? PushWatcher.build(ctx, nkey, path, true, title, orig, msg, peer, grp, team, true)
                            : PushWatcher.build(ctx, nkey, path, true, title, "⚠ Not sent: " + msg + "  (tap to open the chat)", "", peer, grp, team, true);
                    nm.notify(nkey, 1, n);
                } catch (Exception ignored) { }
                pr.finish();
            }
        }).start();
    }
}
