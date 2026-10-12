package com.mysystemlla.twa;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** "My schedule" widget: today's shift in big text, then the next few days. Tap opens the schedule page. */
public class LbScheduleWidget extends AppWidgetProvider {
    private static final String[] DOW = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"};
    private static final String[] DOW_LONG = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    private static final String[] MON = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

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

    private static boolean isOff(String d) {
        return d != null && d.trim().equalsIgnoreCase("off");
    }

    private static String dowLabel(String ymd) {
        try {
            int y = Integer.parseInt(ymd.substring(0, 4)), m = Integer.parseInt(ymd.substring(5, 7)), d = Integer.parseInt(ymd.substring(8, 10));
            java.util.Calendar c = java.util.Calendar.getInstance();
            c.clear();
            c.set(y, m - 1, d);
            return DOW_LONG[c.get(java.util.Calendar.DAY_OF_WEEK) - 1] + " " + d;
        } catch (Exception e) {
            return ymd;
        }
    }

    private static CharSequence row(String ymd, String detail) {
        SpannableStringBuilder b = new SpannableStringBuilder(dowLabel(ymd));
        b.setSpan(new StyleSpan(android.graphics.Typeface.BOLD), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        b.setSpan(new ForegroundColorSpan(Color.parseColor("#FFD3DD")), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        int st = b.length();
        if (detail == null || detail.isEmpty()) {
            b.append("   —");
            b.setSpan(new ForegroundColorSpan(Color.parseColor("#BBFFFFFF")), st, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        } else if (isOff(detail)) {
            b.append("   Off");
            b.setSpan(new ForegroundColorSpan(Color.parseColor("#8FF0B5")), st, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        } else {
            b.append("   ").append(LbWidgetProvider.clean(LbProfileWidget.shortShift(detail)));
            b.setSpan(new ForegroundColorSpan(Color.WHITE), st, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            String[] parts = detail.split(";", 2);
            if (parts.length > 1 && !parts[1].trim().isEmpty()) {
                int s2 = b.length();
                b.append("  ").append(LbWidgetProvider.clean(parts[1].trim()));
                b.setSpan(new ForegroundColorSpan(Color.parseColor("#FFB36B")), s2, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
        }
        return b;
    }

    static void paint(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        boolean linked = !sp.getString("key", "").isEmpty();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_schedule);
        v.setOnClickPendingIntent(R.id.sc_root, LbWidgetProvider.openApp(ctx, 41, "schedule.html#me"));
        String data = sp.getString("data", "");
        if (!linked || data.isEmpty()) {
            v.setViewVisibility(R.id.sc_main, View.GONE);
            v.setViewVisibility(R.id.sc_unlinked, View.VISIBLE);
            v.setTextViewText(R.id.sc_unlinked, linked ? "Loading…" : "Open the app, then Menu → Link home-screen widget");
            for (int id : ids) mgr.updateAppWidget(id, v);
            return;
        }
        v.setViewVisibility(R.id.sc_main, View.VISIBLE);
        v.setViewVisibility(R.id.sc_unlinked, View.GONE);
        int[] rows = {R.id.sc_r1, R.id.sc_r2, R.id.sc_r3};
        for (int r : rows) v.setTextViewText(r, "");
        try {
            JSONObject sc = new JSONObject(data).optJSONObject("schedule");
            JSONArray days = sc == null ? null : sc.optJSONArray("days");
            if (days == null || !sc.optBoolean("hasAny", true)) {
                v.setTextViewText(R.id.sc_today, "No schedule yet");
                v.setTextViewText(R.id.sc_today_label, "My schedule");
                v.setTextViewText(R.id.sc_r1, "Tap to add yours");
                for (int id : ids) mgr.updateAppWidget(id, v);
                return;
            }
            String t = LbProfileWidget.todayYmd();
            int first = -1;
            for (int k = 0; k < days.length(); k++) {
                if (days.getJSONObject(k).optString("date").compareTo(t) >= 0) { first = k; break; }
            }
            if (first < 0) { // cache too old: nothing left to show
                v.setTextViewText(R.id.sc_today, "—");
                for (int id : ids) mgr.updateAppWidget(id, v);
                return;
            }
            JSONObject d0 = days.getJSONObject(first);
            boolean isToday = t.equals(d0.optString("date"));
            String det0 = d0.optString("detail");
            v.setTextViewText(R.id.sc_today_label, isToday ? "TODAY · " + dowLabel(d0.optString("date")) : "NEXT · " + dowLabel(d0.optString("date")));
            if (det0.isEmpty()) v.setTextViewText(R.id.sc_today, "Not set");
            else if (isOff(det0)) v.setTextViewText(R.id.sc_today, "🌴 Day off");
            else v.setTextViewText(R.id.sc_today, LbWidgetProvider.clean(LbProfileWidget.shortShift(det0)));
            for (int k = 0; k < rows.length && first + 1 + k < days.length(); k++) {
                JSONObject d = days.getJSONObject(first + 1 + k);
                v.setTextViewText(rows[k], row(d.optString("date"), d.optString("detail")));
            }
        } catch (Exception ignored) { }
        for (int id : ids) mgr.updateAppWidget(id, v);
    }
}
