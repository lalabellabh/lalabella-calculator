package com.mysystemlla.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * "My schedule" widget as a month calendar: pink = working day, green = day off, tap a day to see its shift.
 * ‹ › change month, "My Schedule" shows yours, "Others" opens a small search list to see anyone else's calendar.
 */
public class LbScheduleWidget extends AppWidgetProvider {
    static final String ACTION_DAY = "com.mysystemlla.twa.SCHED_DAY";
    static final String ACTION_NAV = "com.mysystemlla.twa.SCHED_NAV";
    static final String ACTION_ME = "com.mysystemlla.twa.SCHED_ME";
    private static final String[] DOW_LONG = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    private static final String[] MONTHS = {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        LbWidgetProvider.scheduleAuto(ctx);
        LbWidgetProvider.doRefresh(ctx, goAsync());
    }

    @Override
    public void onEnabled(Context ctx) {
        LbWidgetProvider.scheduleAuto(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        LbWidgetProvider.cancelAutoIfNone(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent == null ? null : intent.getAction();
        if (a == null) return;
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, LbScheduleWidget.class));
        if (ACTION_DAY.equals(a)) {
            String d = intent.getStringExtra("date");
            if (d != null && d.matches("\\d{4}-\\d{2}-\\d{2}")) sp.edit().putString("scSel", d).apply();
            paint(ctx, mgr, ids);
        } else if (ACTION_NAV.equals(a)) {
            int delta = intent.getIntExtra("delta", 0);
            Calendar c = monthOf(sp);
            c.add(Calendar.MONTH, delta);
            Calendar now = Calendar.getInstance();
            int diff = (c.get(Calendar.YEAR) - now.get(Calendar.YEAR)) * 12 + c.get(Calendar.MONTH) - now.get(Calendar.MONTH);
            if (diff >= -2 && diff <= 2) {
                sp.edit().putString("scMonth", new SimpleDateFormat("yyyy-MM", Locale.US).format(c.getTime())).remove("scSel").apply();
            }
            paint(ctx, mgr, ids);
        } else if (ACTION_ME.equals(a)) {
            sp.edit().remove("scWho").remove("scSel").remove("scMonth").apply();
            paint(ctx, mgr, ids);
            LbWidgetProvider.refreshAll(ctx);
        }
    }

    /** First day of the month being shown (this month unless the person moved with ‹ ›). */
    private static Calendar monthOf(SharedPreferences sp) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.DAY_OF_MONTH, 1);
        String m = sp.getString("scMonth", "");
        if (m.matches("\\d{4}-\\d{2}")) {
            c.set(Calendar.YEAR, Integer.parseInt(m.substring(0, 4)));
            c.set(Calendar.MONTH, Integer.parseInt(m.substring(5, 7)) - 1);
        }
        c.set(Calendar.HOUR_OF_DAY, 12);
        return c;
    }

    private static boolean isOff(String d) {
        return d != null && d.trim().equalsIgnoreCase("off");
    }

    private static String ymd(Calendar c) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.getTime());
    }

    private static String dayLabel(String ymd) {
        try {
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(Integer.parseInt(ymd.substring(0, 4)), Integer.parseInt(ymd.substring(5, 7)) - 1, Integer.parseInt(ymd.substring(8, 10)));
            return DOW_LONG[c.get(Calendar.DAY_OF_WEEK) - 1] + " " + c.get(Calendar.DAY_OF_MONTH);
        } catch (Exception e) {
            return ymd;
        }
    }

    private static PendingIntent bcast(Context ctx, int req, String action, String key, String sval, int ival) {
        Intent i = new Intent(ctx, LbScheduleWidget.class).setAction(action);
        if (sval != null) i.putExtra(key, sval);
        if (key != null && sval == null) i.putExtra(key, ival);
        return PendingIntent.getBroadcast(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void paint(Context ctx, AppWidgetManager mgr, int[] ids) {
        if (ids == null || ids.length == 0) return;
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        boolean linked = !sp.getString("key", "").isEmpty();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_schedule);
        String data = sp.getString("data", "");
        if (!linked || data.isEmpty()) {
            v.setViewVisibility(R.id.sc_main, View.GONE);
            v.setViewVisibility(R.id.sc_unlinked, View.VISIBLE);
            v.setTextViewText(R.id.sc_unlinked, linked ? "Loading…" : "Open the app, then Menu → Link home-screen widget");
            v.setOnClickPendingIntent(R.id.sc_root, LbWidgetProvider.openApp(ctx, 41, "index.html"));
            for (int id : ids) mgr.updateAppWidget(id, v);
            return;
        }
        v.setViewVisibility(R.id.sc_main, View.VISIBLE);
        v.setViewVisibility(R.id.sc_unlinked, View.GONE);

        String who = sp.getString("scWho", "");
        Map<String, String> map = new HashMap<String, String>();
        Map<String, String> rem = new HashMap<String, String>(); // date -> "HH:MM text" (my own reminders / alarms, only on My Schedule)
        String firstRemDate = "";
        boolean loaded = false, hasAny = true;
        String shownName = "";
        try {
            JSONObject j = new JSONObject(data);
            JSONObject sc = null;
            if (who.isEmpty()) {
                sc = j.optJSONObject("schedule");
            } else {
                JSONObject view = j.optJSONObject("view");
                if (view != null && who.equalsIgnoreCase(view.optString("name"))) { sc = view; shownName = view.optString("name"); }
            }
            if (sc != null) {
                loaded = true;
                hasAny = sc.optBoolean("hasAny", true);
                JSONArray days = sc.optJSONArray("days");
                for (int k = 0; days != null && k < days.length(); k++) {
                    JSONObject d = days.getJSONObject(k);
                    map.put(d.optString("date"), d.optString("detail"));
                }
            }
            JSONArray ra = who.isEmpty() ? j.optJSONArray("reminders") : null;
            String todayR = ymd(Calendar.getInstance());
            for (int k = 0; ra != null && k < ra.length(); k++) {
                JSONObject r = ra.getJSONObject(k);
                String rd = r.optString("date");
                String rt = r.optString("time");
                rem.put(rd, (rt.isEmpty() ? "" : rt + " ") + r.optString("text"));
                if (firstRemDate.isEmpty() && rd.compareTo(todayR) >= 0) firstRemDate = rd;
            }
        } catch (Exception ignored) { }

        Calendar first = monthOf(sp);
        int month = first.get(Calendar.MONTH);
        v.setTextViewText(R.id.sc_title, MONTHS[month] + " " + first.get(Calendar.YEAR));
        if (who.isEmpty()) v.setTextViewText(R.id.sc_who, "My schedule");
        else v.setTextViewText(R.id.sc_who, LbWidgetProvider.clean(who) + "'s schedule" + (loaded ? "" : " · loading…"));

        String today = ymd(Calendar.getInstance());
        String sel = sp.getString("scSel", "");
        if (sel.isEmpty()) sel = (first.get(Calendar.YEAR) + "-" + String.format(Locale.US, "%02d", month + 1)).equals(today.substring(0, 7)) ? today : ymd(first);

        Calendar cur = (Calendar) first.clone();
        cur.add(Calendar.DAY_OF_MONTH, -(first.get(Calendar.DAY_OF_WEEK) - 1));
        for (int i = 0; i < 42; i++) {
            String d = ymd(cur);
            int cellId = ctx.getResources().getIdentifier("sc_c" + i, "id", ctx.getPackageName());
            if (cellId != 0) {
                boolean inMonth = cur.get(Calendar.MONTH) == month;
                String det = map.get(d);
                char st = (det == null || det.isEmpty()) ? 'n' : (isOff(det) ? 'o' : 'w');
                char mk = d.equals(sel) ? 's' : (d.equals(today) ? 't' : 'p');
                int bg = ctx.getResources().getIdentifier("lb_cell_" + st + "_" + mk, "drawable", ctx.getPackageName());
                v.setTextViewText(cellId, cur.get(Calendar.DAY_OF_MONTH) + (inMonth && rem.containsKey(d) ? "\u2022" : ""));
                v.setInt(cellId, "setBackgroundResource", inMonth ? bg : 0);
                v.setTextColor(cellId, !inMonth ? 0x66FFFFFF : (d.equals(today) ? 0xFFFFE08A : 0xFFFFFFFF));
                v.setOnClickPendingIntent(cellId, bcast(ctx, 1000 + i, ACTION_DAY, "date", d, 0));
            }
            cur.add(Calendar.DAY_OF_MONTH, 1);
        }

        // info line for the selected day
        String sd = map.get(sel);
        CharSequence info;
        if (!loaded) info = "Loading…";
        else if (!hasAny) info = who.isEmpty() ? "No schedule yet — tap to add yours" : "No schedule found";
        else if (sd == null || sd.isEmpty()) info = dayLabel(sel) + " · no schedule";
        else if (isOff(sd)) info = dayLabel(sel) + " · 🌴 Day off";
        else {
            String note = "";
            String[] parts = sd.split(";", 2);
            if (parts.length > 1 && !parts[1].trim().isEmpty()) note = "  " + parts[1].trim();
            info = dayLabel(sel) + " · " + LbProfileWidget.shortShift(sd) + note;
        }
        String rs = rem.get(sel);
        String extra = "";
        if (rs != null) extra = "\n\uD83D\uDD14 " + rs;
        else if (!firstRemDate.isEmpty()) extra = "\n\uD83D\uDD14 " + dayLabel(firstRemDate) + " · " + rem.get(firstRemDate);
        v.setTextViewText(R.id.sc_info, LbWidgetProvider.clean(info.toString()) + extra);

        v.setOnClickPendingIntent(R.id.sc_prev, bcast(ctx, 2001, ACTION_NAV, "delta", null, -1));
        v.setOnClickPendingIntent(R.id.sc_next, bcast(ctx, 2002, ACTION_NAV, "delta", null, 1));
        v.setOnClickPendingIntent(R.id.sc_btn_me, bcast(ctx, 2003, ACTION_ME, null, null, 0));
        v.setOnClickPendingIntent(R.id.sc_info, LbWidgetProvider.openApp(ctx, 41, who.isEmpty() ? "schedule.html#me" : "schedule.html"));
        Intent pick = new Intent(ctx, LbPickActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.sc_btn_others, PendingIntent.getActivity(ctx, 2004, pick, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setTextViewText(R.id.sc_btn_me, who.isEmpty() ? "● My Schedule" : "My Schedule");
        for (int id : ids) mgr.updateAppWidget(id, v);
    }
}
