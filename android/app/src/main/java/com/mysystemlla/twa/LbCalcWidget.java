package com.mysystemlla.twa;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** Time, date and weather on the wallpaper, plus two glass buttons: Chocolate calculator and Flower calculator. */
public class LbCalcWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        LbWidgetProvider.scheduleAuto(ctx);
        paint(ctx, mgr, ids);
        LbWidgetProvider.doRefresh(ctx, goAsync()); // refreshes the weather
    }

    @Override
    public void onEnabled(Context ctx) {
        LbWidgetProvider.scheduleAuto(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        LbWidgetProvider.cancelAutoIfNone(ctx);
    }

    static void paint(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences sp = ctx.getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_calc);
        v.setOnClickPendingIntent(R.id.calc_choc, LbWidgetProvider.openApp(ctx, 51, "chocolate-calc.html"));
        v.setOnClickPendingIntent(R.id.calc_flower, LbWidgetProvider.openApp(ctx, 52, "flower-calc.html"));
        v.setTextViewText(R.id.cc_wx1, LbWidgetProvider.wxText(sp, 0));
        v.setTextViewText(R.id.cc_wx2, LbWidgetProvider.wxText(sp, 1));
        for (int id : ids) mgr.updateAppWidget(id, v);
    }
}
