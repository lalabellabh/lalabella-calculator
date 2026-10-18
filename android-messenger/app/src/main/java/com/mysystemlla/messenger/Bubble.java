package com.mysystemlla.messenger;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

/** The floating round chat head (needs "Display over other apps"). Drag it, tap to open the chat, drop it at the bottom to dismiss. */
final class Bubble {
    private static FrameLayout view;
    private static WindowManager.LayoutParams lp;
    private static int lastX = -1, lastY = -1;

    private Bubble() { }

    static void show(Context ctx, final String title, final String avatar, final long id, final int count, final String type, final long convId) {
        final Context c = ctx.getApplicationContext();
        Ui.MAIN.post(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(c)) return;
                removeNow(c);
                final WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
                if (wm == null) return;
                final int size = Ui.dp(c, 64);
                final int sw = Ui.screenW(c), sh = Ui.screenH(c);
                FrameLayout f = new FrameLayout(c);
                AvatarView av = new AvatarView(c);
                if (type.equals("t")) av.set("LT", 3, ""); else av.set(title, id, avatar);
                f.addView(av, new FrameLayout.LayoutParams(Ui.dp(c, 58), Ui.dp(c, 58), Gravity.CENTER));
                if (count > 0) {
                    TextView b = Ui.badge(c, count);
                    f.addView(b, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END));
                }
                f.setAlpha(Math.max(30, Store.bubbleOpacity(c)) / 100f);
                f.setElevation(Ui.dp(c, 6));

                lp = new WindowManager.LayoutParams(size, size,
                        Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT);
                lp.gravity = Gravity.TOP | Gravity.START;
                lp.x = lastX >= 0 ? lastX : sw - size;
                lp.y = lastY >= 0 ? lastY : sh / 3;

                final int[] st = new int[4];   // downX, downY, startX, startY
                final boolean[] moved = { false };
                f.setOnTouchListener((v, e) -> {
                    switch (e.getAction()) {
                        case MotionEvent.ACTION_DOWN:
                            st[0] = (int) e.getRawX(); st[1] = (int) e.getRawY(); st[2] = lp.x; st[3] = lp.y; moved[0] = false;
                            return true;
                        case MotionEvent.ACTION_MOVE: {
                            int dx = (int) e.getRawX() - st[0], dy = (int) e.getRawY() - st[1];
                            if (Math.abs(dx) > Ui.dp(c, 8) || Math.abs(dy) > Ui.dp(c, 8)) moved[0] = true;
                            if (moved[0]) {
                                lp.x = st[2] + dx; lp.y = st[3] + dy;
                                try { wm.updateViewLayout(v, lp); } catch (Exception ignored) { }
                            }
                            return true;
                        }
                        case MotionEvent.ACTION_UP: {
                            if (!moved[0]) {
                                Intent i = new Intent(c, ChatActivity.class);
                                i.putExtra("type", type).putExtra("id", convId).putExtra("title", title).putExtra("avatar", avatar == null ? "" : avatar);
                                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                                try { c.startActivity(i); } catch (Exception ignored) { }
                                removeNow(c);
                            } else if (e.getRawY() > sh * 0.86f) {
                                removeNow(c);
                            } else {
                                lp.x = (lp.x + size / 2 < sw / 2) ? 0 : sw - size;
                                lastX = lp.x; lastY = lp.y;
                                try { wm.updateViewLayout(v, lp); } catch (Exception ignored) { }
                            }
                            return true;
                        }
                        default:
                            return true;
                    }
                });
                wm.addView(f, lp);
                view = f;
            } catch (Throwable ignored) { }
        });
    }

    static void hide(Context ctx) {
        final Context c = ctx.getApplicationContext();
        Ui.MAIN.post(() -> removeNow(c));
    }

    private static void removeNow(Context c) {
        try {
            if (view != null) {
                WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
                if (lp != null) { lastX = lp.x; lastY = lp.y; }
                if (wm != null) wm.removeView(view);
            }
        } catch (Throwable ignored) { }
        view = null;
    }
}
