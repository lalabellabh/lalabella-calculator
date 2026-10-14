package com.mysystemlla.twa;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;

/**
 * Time, date and weather on the wallpaper, plus two glass buttons: Chocolate calculator and Flower calculator.
 * When the widget is resized small it switches to two app-style icons with a label (like phone icons).
 */
public class LbCalcWidget extends AppWidgetProvider {
    private static final int FULL_W = 170, FULL_H = 100; // dp: smaller than this => compact icons

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        LbWidgetProvider.scheduleAuto(ctx);
        paint(ctx, mgr, ids);
        LbWidgetProvider.doRefresh(ctx, goAsync()); // refreshes the weather
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opts) {
        paint(ctx, mgr, new int[]{id}); // the person resized it: pick the full or compact look
    }

    @Override
    public void onEnabled(Context ctx) {
        LbWidgetProvider.scheduleAuto(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        LbWidgetProvider.cancelAutoIfNone(ctx);
    }

    private static boolean compact(AppWidgetManager mgr, int id) {
        try {
            Bundle o = mgr.getAppWidgetOptions(id);
            int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            if (w <= 0 || h <= 0) return false; // size not known yet: keep the full look
            return w < FULL_W || h < FULL_H;
        } catch (Exception e) {
            return false;
        }
    }

    static void paint(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        for (int id : ids) {
            boolean small = compact(mgr, id);
            RemoteViews v = new RemoteViews(ctx.getPackageName(), small ? R.layout.lb_calc_small : R.layout.lb_calc);
            v.setOnClickPendingIntent(R.id.calc_choc, LbWidgetProvider.openApp(ctx, 51, "chocolate-calc.html"));
            v.setOnClickPendingIntent(R.id.calc_flower, LbWidgetProvider.openApp(ctx, 52, "flower-calc.html"));
            if (!small) {
                v.setTextViewText(R.id.cc_wx1, LbWidgetProvider.wxText(sp, 0));
                v.setTextViewText(R.id.cc_wx2, LbWidgetProvider.wxText(sp, 1));
            }
            mgr.updateAppWidget(id, v);
        }
    }
}
