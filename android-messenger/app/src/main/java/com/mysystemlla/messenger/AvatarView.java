package com.mysystemlla.messenger;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

/** Round picture (or coloured initials) with an optional story ring and an online dot. */
final class AvatarView extends View {
    private Bitmap bmp;
    private String text = "?";
    private int color = 0xFF2F6570;
    private boolean ring, seenRing, online, add;
    private String url = "";
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rf = new RectF();

    AvatarView(Context c) { super(c); }

    void set(String name, long id, String photoUrl) {
        text = Ui.initials(name);
        color = Ui.colorFor(id);
        String u = photoUrl == null ? "" : photoUrl;
        if (!u.equals(url)) {
            url = u; bmp = null;
            if (u.length() > 0) {
                final String want = u;
                Ui.load(u, 160, b -> { if (b != null && want.equals(url)) { bmp = b; postInvalidate(); } });
            }
        }
        invalidate();
    }
    void setRing(boolean has, boolean seen) { ring = has; seenRing = seen; invalidate(); }
    void setOnline(boolean on) { online = on; invalidate(); }
    void setAdd(boolean a) { add = a; invalidate(); }

    @Override protected void onDraw(Canvas cv) {
        float w = getWidth(), h = getHeight(), s = Math.min(w, h);
        float cx = w / 2f, cy = h / 2f;
        float stroke = Math.max(2f, s * 0.045f);
        float pad = ring ? stroke * 1.9f : 0f;
        float r = s / 2f - pad;
        if (ring) {
            p.setShader(null); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(stroke);
            p.setColor(seenRing ? 0xFFB9C0C4 : 0xFF3FA7B8);
            cv.drawCircle(cx, cy, s / 2f - stroke / 2f, p);
        }
        p.setStyle(Paint.Style.FILL);
        if (bmp != null) {
            BitmapShader sh = new BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            Matrix m = new Matrix();
            float sc = Math.max(2f * r / bmp.getWidth(), 2f * r / bmp.getHeight());
            m.setScale(sc, sc);
            m.postTranslate(cx - bmp.getWidth() * sc / 2f, cy - bmp.getHeight() * sc / 2f);
            sh.setLocalMatrix(m);
            p.setShader(sh);
            cv.drawCircle(cx, cy, r, p);
            p.setShader(null);
        } else {
            p.setShader(null); p.setColor(color);
            cv.drawCircle(cx, cy, r, p);
            p.setColor(Color.WHITE); p.setTextAlign(Paint.Align.CENTER); p.setTextSize(r * 0.78f); p.setFakeBoldText(true);
            cv.drawText(add ? "+" : text, cx, cy + r * 0.27f, p);
            p.setFakeBoldText(false);
        }
        if (add && bmp != null) {
            p.setColor(0x66000000); cv.drawCircle(cx, cy, r, p);
            p.setColor(Color.WHITE); p.setTextAlign(Paint.Align.CENTER); p.setTextSize(r * 0.9f); cv.drawText("+", cx, cy + r * 0.3f, p);
        }
        if (online) {
            float dr = s * 0.15f;
            float dx = cx + s * 0.34f, dy = cy + s * 0.34f;
            p.setColor(Color.WHITE); cv.drawCircle(dx, dy, dr + s * 0.04f, p);
            p.setColor(0xFF31C46B); cv.drawCircle(dx, dy, dr, p);
        }
    }
}
