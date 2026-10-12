package com.mysystemlla.twa;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** Two big buttons: Chocolate calculator and Flower calculator. Static, no data needed. */
public class LbCalcWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.lb_calc);
        v.setOnClickPendingIntent(R.id.calc_choc, LbWidgetProvider.openApp(ctx, 51, "chocolate-calc.html"));
        v.setOnClickPendingIntent(R.id.calc_flower, LbWidgetProvider.openApp(ctx, 52, "flower-calc.html"));
        for (int id : ids) mgr.updateAppWidget(id, v);
    }
}
