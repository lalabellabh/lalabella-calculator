package com.mysystemlla.messenger;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the message listener again after the phone restarts or the app is updated. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (Store.loggedIn(c) && Store.b(c, "notif", true)) WatchService.start(c);
        MsgWidget.refresh(c);
    }
}
