package com.mysystemlla.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Rings an attendance alarm, and re-plans the alarms after a reboot / app update. */
public class LbAttReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context context, Intent intent) {
        final String action = intent == null ? "" : String.valueOf(intent.getAction());
        final PendingResult pr = goAsync();
        final String title = intent == null ? "" : String.valueOf(intent.getStringExtra("title"));
        final String text = intent == null ? "" : String.valueOf(intent.getStringExtra("text"));
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (LbAttendance.ACTION_FIRE.equals(action)) {
                        LbAttendance.ring(context, "null".equals(title) ? "" : title, "null".equals(text) ? "" : text);
                    }
                    // fire, boot, app update, or the 3-hourly check: refresh the plan with the server
                    LbAttendance.syncNow(context);
                } finally {
                    pr.finish();
                }
            }
        }).start();
    }
}
