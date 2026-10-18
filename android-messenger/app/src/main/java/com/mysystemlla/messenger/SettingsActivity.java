package com.mysystemlla.messenger;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.CompoundButton;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

/** Wallpaper, transparency, notifications and chat head. Changes are saved and shown in the preview straight away. */
public class SettingsActivity extends Activity {
    private static final int REQ_WP = 31, REQ_OVERLAY = 32;
    private LinearLayout box;
    private FrameLayout preview;
    private LinearLayout gradRow;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(0xFFF4F8F9);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 16);
        box.setPadding(p, Ui.dp(this, 14), p, Ui.dp(this, 30));
        sv.addView(box);
        setContentView(sv);
        build();
    }

    @Override protected void onResume() { super.onResume(); Ui.track(this, true); }
    @Override protected void onPause() { super.onPause(); Ui.track(this, false); }

    private void build() {
        box.removeAllViews();
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = Ui.tv(this, "‹", 34, Ui.ACC, false);
        back.setPadding(0, 0, Ui.dp(this, 14), Ui.dp(this, 4));
        back.setOnClickListener(v -> finish());
        top.addView(back);
        top.addView(Ui.tv(this, "Settings", 24, Ui.INK, true));
        box.addView(top);

        // ---- preview
        box.addView(head("Preview"));
        preview = new FrameLayout(this);
        box.addView(preview, new LinearLayout.LayoutParams(-1, Ui.dp(this, 190)));
        drawPreview();

        // ---- wallpaper
        box.addView(head("Wallpaper"));
        gradRow = new LinearLayout(this);
        gradRow.setOrientation(LinearLayout.HORIZONTAL);
        android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        hs.addView(gradRow);
        box.addView(hs);
        drawGradRow();
        LinearLayout btns = new LinearLayout(this);
        btns.setPadding(0, Ui.dp(this, 10), 0, 0);
        TextView photo = chip("📷  My photo", v -> {
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.setType("image/*");
            startActivityForResult(Intent.createChooser(i, "Choose a wallpaper"), REQ_WP);
        });
        TextView none = chip("None", v -> { Store.put(this, "wpMode", 0); changed(); drawGradRow(); });
        btns.addView(photo); btns.addView(none);
        box.addView(btns);
        box.addView(slider("Darken wallpaper", Store.wpDim(this), 0, 70, v -> { Store.put(this, "wpDim", v); changed(); }));

        // ---- transparency
        box.addView(head("Transparency"));
        box.addView(slider("Chat bubbles & cards", Store.bubbleOpacity(this), 30, 100, v -> { Store.put(this, "bubbleOp", v); changed(); }));
        box.addView(slider("Top & bottom bars", Store.headOpacity(this), 30, 100, v -> { Store.put(this, "headOp", v); changed(); }));
        box.addView(slider("Home-screen widget", Store.widgetOpacity(this), 30, 100, v -> { Store.put(this, "widgetOp", v); MsgWidget.refresh(this); }));

        // ---- notifications
        box.addView(head("Notifications"));
        box.addView(toggle("Message notifications", "Only this app notifies you — the website and the main Lalabella app stay quiet.", Store.b(this, "notif", true), (bt, on) -> {
            Store.put(this, "notif", on);
            if (on) WatchService.start(this); else { WatchService.stop(this); Bubble.hide(this); }
        }));
        box.addView(toggle("Sound & vibration", "", Store.b(this, "sound", true), (bt, on) -> { Store.put(this, "sound", on); WatchService.start(this); }));
        box.addView(toggle("Floating chat head", "A round bubble shows over other apps when a new message comes in. Needs \"Display over other apps\".", Store.b(this, "bubble", false), (bt, on) -> {
            if (on && !canOverlay()) {
                bt.setChecked(false);
                Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
                Ui.toast(this, "Allow \"Display over other apps\", then turn this on again.");
                startActivityForResult(i, REQ_OVERLAY);
                return;
            }
            Store.put(this, "bubble", on);
            if (!on) Bubble.hide(this);
        }));
        box.addView(chip("🔋  Keep messages coming (battery setting)", v -> askBattery()));
        TextView note = Ui.tv(this, "Tip: set Lalabella Messenger to \"Unrestricted\" battery so Android doesn't pause it when the phone sleeps.", 12, Ui.MUTED, false);
        note.setPadding(Ui.dp(this, 4), Ui.dp(this, 6), Ui.dp(this, 4), 0);
        box.addView(note);
    }

    private boolean canOverlay() { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this); }

    private void askBattery() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) { Ui.toast(this, "Already allowed."); return; }
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignored) { }
        }
    }

    private void changed() { drawPreview(); MsgWidget.refresh(this); }

    // ------------------------------------------------------------ pieces
    private TextView head(String s) {
        TextView t = Ui.tv(this, s, 14, Ui.ACC, true);
        t.setPadding(Ui.dp(this, 4), Ui.dp(this, 20), 0, Ui.dp(this, 8));
        return t;
    }

    private TextView chip(String text, View.OnClickListener click) {
        TextView t = Ui.tv(this, text, 14, Ui.ACC, true);
        t.setBackground(Ui.round(this, 0xFFE3EFF1, 20));
        t.setPadding(Ui.dp(this, 16), Ui.dp(this, 10), Ui.dp(this, 16), Ui.dp(this, 10));
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(-2, -2);
        l.topMargin = Ui.dp(this, 8); l.rightMargin = Ui.dp(this, 8);
        t.setLayoutParams(l);
        t.setOnClickListener(click);
        return t;
    }

    interface IntCb { void on(int v); }

    private View slider(String label, int val, final int min, int max, final IntCb cb) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(Ui.dp(this, 4), Ui.dp(this, 10), Ui.dp(this, 4), 0);
        final TextView t = Ui.tv(this, label + ": " + val + "%", 14, Ui.INK, false);
        l.addView(t);
        SeekBar sb = new SeekBar(this);
        sb.setMax(max - min);
        sb.setProgress(val - min);
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) {
                t.setText(label + ": " + (p + min) + "%");
                if (user) cb.on(p + min);
            }
            @Override public void onStartTrackingTouch(SeekBar s) { }
            @Override public void onStopTrackingTouch(SeekBar s) { cb.on(s.getProgress() + min); }
        });
        l.addView(sb);
        return l;
    }

    private View toggle(String label, String desc, boolean on, CompoundButton.OnCheckedChangeListener cb) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(Ui.dp(this, 4), Ui.dp(this, 10), Ui.dp(this, 4), Ui.dp(this, 6));
        LinearLayout tx = new LinearLayout(this);
        tx.setOrientation(LinearLayout.VERTICAL);
        tx.addView(Ui.tv(this, label, 16, Ui.INK, false));
        if (desc.length() > 0) tx.addView(Ui.tv(this, desc, 12, Ui.MUTED, false));
        row.addView(tx, new LinearLayout.LayoutParams(0, -2, 1f));
        Switch sw = new Switch(this);
        sw.setChecked(on);
        sw.setOnCheckedChangeListener(cb);
        row.addView(sw);
        return row;
    }

    private void drawGradRow() {
        gradRow.removeAllViews();
        for (int i = 0; i < Ui.GRADS.length; i++) {
            final int idx = i;
            View v = new View(this);
            GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, Ui.GRADS[i]);
            g.setCornerRadius(Ui.dp(this, 14));
            if (Store.wpMode(this) == 1 && Store.wpGrad(this) == i) g.setStroke(Ui.dp(this, 3), Ui.ACC);
            v.setBackground(g);
            LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(Ui.dp(this, 56), Ui.dp(this, 80));
            l.rightMargin = Ui.dp(this, 10);
            v.setOnClickListener(x -> { Store.put(this, "wpMode", 1); Store.put(this, "wpGrad", idx); changed(); drawGradRow(); });
            gradRow.addView(v, l);
        }
    }

    private void drawPreview() {
        preview.removeAllViews();
        preview.setBackground(Ui.wallpaper(this));
        int op = Store.bubbleOpacity(this);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(Ui.dp(this, 12), Ui.dp(this, 12), Ui.dp(this, 12), Ui.dp(this, 12));
        TextView a = Ui.tv(this, "Kumusta! 👋", 15, Ui.INK, false);
        GradientDrawable ga = new GradientDrawable(); ga.setColor(Ui.alpha(0xFFFFFFFF, op)); ga.setCornerRadius(Ui.dp(this, 20));
        a.setBackground(ga);
        a.setPadding(Ui.dp(this, 14), Ui.dp(this, 8), Ui.dp(this, 14), Ui.dp(this, 8));
        col.addView(a, new LinearLayout.LayoutParams(-2, -2));
        TextView m = Ui.tv(this, "Ganda ng wallpaper ko ngayon ✨", 15, Color.WHITE, false);
        GradientDrawable gm = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[] { Ui.alpha(Ui.ACC, op), Ui.alpha(Ui.ACC2, op) });
        gm.setCornerRadius(Ui.dp(this, 20));
        m.setBackground(gm);
        m.setPadding(Ui.dp(this, 14), Ui.dp(this, 8), Ui.dp(this, 14), Ui.dp(this, 8));
        LinearLayout.LayoutParams ml = new LinearLayout.LayoutParams(-2, -2);
        ml.topMargin = Ui.dp(this, 8); ml.gravity = Gravity.END;
        col.addView(m, ml);
        preview.addView(col);
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OVERLAY) { build(); return; }
        if (req == REQ_WP && res == RESULT_OK && data != null && data.getData() != null) {
            final Uri u = data.getData();
            new Thread(() -> {
                boolean ok = false;
                try {
                    InputStream is = getContentResolver().openInputStream(u);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192]; int n;
                    while ((n = is.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 30 * 1024 * 1024) break; }
                    is.close();
                    int target = Math.max(Ui.screenW(this), Ui.screenH(this));
                    Bitmap bm = Ui.decode(bo.toByteArray(), target);
                    if (bm != null) {
                        bm = Ui.scaleDown(bm, target);
                        FileOutputStream fo = new FileOutputStream(Ui.wallpaperFile(this));
                        bm.compress(Bitmap.CompressFormat.JPEG, 88, fo);
                        fo.close();
                        ok = true;
                    }
                } catch (Throwable ignored) { }
                final boolean done = ok;
                Ui.MAIN.post(() -> {
                    if (done) { Store.put(this, "wpMode", 2); changed(); drawGradRow(); }
                    else Ui.toast(this, "Could not use that picture.");
                });
            }).start();
        }
    }
}
