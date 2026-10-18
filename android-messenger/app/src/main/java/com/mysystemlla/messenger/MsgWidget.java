package com.mysystemlla.messenger;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;

/** Home-screen widget: unread count and the latest chats. Tap a row to open that chat. */
public class MsgWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(c));
    }

    @Override public void onEnabled(Context c) { WatchStart.ensure(c); }

    static void refresh(Context ctx) {
        try {
            Context c = ctx.getApplicationContext();
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, MsgWidget.class));
            if (ids == null || ids.length == 0) return;
            for (int id : ids) mgr.updateAppWidget(id, build(c));
        } catch (Throwable ignored) { }
    }

    /** Small helper so adding the widget also wakes the listener. */
    static final class WatchStart {
        static void ensure(Context c) { if (Store.loggedIn(c) && Store.b(c, "notif", true)) WatchService.start(c); }
    }

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_msg);
        int a = Math.round(255f * Store.widgetOpacity(c) / 100f);
        v.setInt(R.id.w_bg, "setImageAlpha", a);

        PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.w_root, open);

        int[] rowId = { R.id.w_r1, R.id.w_r2, R.id.w_r3 };
        int[] ic = { R.id.w_i1, R.id.w_i2, R.id.w_i3 };
        int[] tt = { R.id.w_t1, R.id.w_t2, R.id.w_t3 };
        int[] mm = { R.id.w_m1, R.id.w_m2, R.id.w_m3 };
        int[] bb = { R.id.w_b1, R.id.w_b2, R.id.w_b3 };

        ArrayList<JSONObject> list = new ArrayList<>();
        try {
            JSONObject map = new JSONObject(Store.s(c, "recent").length() > 0 ? Store.s(c, "recent") : "{}");
            Iterator<String> it = map.keys();
            while (it.hasNext()) { JSONObject o = map.optJSONObject(it.next()); if (o != null) list.add(o); }
        } catch (Exception ignored) { }
        if (!Store.loggedIn(c)) list.clear();
        Collections.sort(list, (x, y) -> {
            boolean ux = x.optInt("unread") > 0, uy = y.optInt("unread") > 0;
            if (ux != uy) return ux ? -1 : 1;
            return Long.compare(y.optLong("time"), x.optLong("time"));
        });

        int total = Store.loggedIn(c) ? Store.i(c, "unreadTotal", 0) : 0;
        if (total > 0) { v.setViewVisibility(R.id.w_total, View.VISIBLE); v.setTextViewText(R.id.w_total, total > 99 ? "99+" : String.valueOf(total)); }
        else v.setViewVisibility(R.id.w_total, View.GONE);

        for (int i = 0; i < 3; i++) {
            if (i < list.size()) {
                JSONObject o = list.get(i);
                v.setViewVisibility(rowId[i], View.VISIBLE);
                v.setTextViewText(ic[i], Ui.initials(o.optString("title")));
                v.setTextViewText(tt[i], o.optString("title"));
                v.setTextViewText(mm[i], o.optString("text"));
                int un = o.optInt("unread");
                if (un > 0) { v.setViewVisibility(bb[i], View.VISIBLE); v.setTextViewText(bb[i], un > 99 ? "99+" : String.valueOf(un)); }
                else v.setViewVisibility(bb[i], View.GONE);
                Intent chat = new Intent(c, ChatActivity.class);
                chat.putExtra("type", o.optString("type", "t")).putExtra("id", o.optLong("id")).putExtra("title", o.optString("title")).putExtra("avatar", o.optString("avatar"));
                chat.setAction("open:" + o.optString("key"));
                chat.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                android.app.TaskStackBuilder tsb = android.app.TaskStackBuilder.create(c);
                tsb.addNextIntent(new Intent(c, MainActivity.class));
                tsb.addNextIntent(chat);
                PendingIntent pi = tsb.getPendingIntent(100 + i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                v.setOnClickPendingIntent(rowId[i], pi);
            } else {
                v.setViewVisibility(rowId[i], View.GONE);
            }
        }
        v.setViewVisibility(R.id.w_empty, list.isEmpty() ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, Store.loggedIn(c) ? "No new messages 🎉" : "Open the app to log in");
        return v;
    }
}
