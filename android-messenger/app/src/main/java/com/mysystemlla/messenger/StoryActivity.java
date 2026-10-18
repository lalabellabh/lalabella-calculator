package com.mysystemlla.messenger;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.VideoView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Full-screen story viewer (24-hour statuses). Tap right = next, tap left = back, hold = pause. */
public class StoryActivity extends Activity {
    static List<List<JSONObject>> groups = new ArrayList<>();
    static int start = 0;

    private static final long BASE_MS = 6000;
    private long showMs = BASE_MS;
    private android.media.MediaPlayer sound;
    private int g, s;
    private FrameLayout stage;
    private LinearLayout bars;
    private final List<View> fills = new ArrayList<>();
    private TextView nameT, timeT;
    private AvatarView av;
    private long shownAt, elapsedBefore;
    private boolean paused, isVideo;
    private VideoView video;
    private String loadedFor = "";
    private final Runnable frame = new Runnable() {
        @Override public void run() {
            if (isFinishing()) return;
            if (!paused && !isVideo) {
                long e = elapsedBefore + (System.currentTimeMillis() - shownAt);
                setProgress(Math.min(1f, e / (float) showMs));
                if (e >= showMs) { next(); return; }
            }
            Ui.MAIN.postDelayed(this, 40);
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (groups == null || groups.isEmpty()) { finish(); return; }
        g = Math.max(0, Math.min(start, groups.size() - 1));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        stage = new FrameLayout(this);
        root.addView(stage, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setPadding(Ui.dp(this, 10), Ui.dp(this, 30), Ui.dp(this, 10), Ui.dp(this, 10));
        top.setBackground(new android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM, new int[] { 0x99000000, 0x00000000 }));
        bars = new LinearLayout(this);
        bars.setOrientation(LinearLayout.HORIZONTAL);
        top.addView(bars, new LinearLayout.LayoutParams(-1, Ui.dp(this, 3)));
        LinearLayout who = new LinearLayout(this);
        who.setGravity(Gravity.CENTER_VERTICAL);
        who.setPadding(0, Ui.dp(this, 10), 0, 0);
        av = new AvatarView(this);
        who.addView(av, new LinearLayout.LayoutParams(Ui.dp(this, 38), Ui.dp(this, 38)));
        LinearLayout nt = new LinearLayout(this);
        nt.setOrientation(LinearLayout.VERTICAL);
        nt.setPadding(Ui.dp(this, 10), 0, 0, 0);
        nameT = Ui.tv(this, "", 15, Color.WHITE, true);
        timeT = Ui.tv(this, "", 12, 0xCCFFFFFF, false);
        nt.addView(nameT); nt.addView(timeT);
        who.addView(nt, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView close = Ui.tv(this, "✕", 22, Color.WHITE, false);
        close.setPadding(Ui.dp(this, 14), Ui.dp(this, 4), Ui.dp(this, 6), Ui.dp(this, 4));
        close.setOnClickListener(v -> finish());
        who.addView(close);
        top.addView(who);
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // tap zones
        View left = new View(this), right = new View(this);
        FrameLayout.LayoutParams ll = new FrameLayout.LayoutParams(Ui.screenW(this) / 3, -1, Gravity.START);
        ll.topMargin = Ui.dp(this, 110);
        FrameLayout.LayoutParams rl = new FrameLayout.LayoutParams(Ui.screenW(this) * 2 / 3, -1, Gravity.END);
        rl.topMargin = Ui.dp(this, 110);
        root.addView(left, ll);
        root.addView(right, rl);
        hold(left, false);
        hold(right, true);
        setContentView(root);
        showGroup();
    }

    private void hold(View v, final boolean isRight) {
        final long[] down = { 0 };
        v.setOnTouchListener((vw, e) -> {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    down[0] = System.currentTimeMillis();
                    pause(true);
                    return true;
                case MotionEvent.ACTION_UP:
                    pause(false);
                    if (System.currentTimeMillis() - down[0] < 300) { if (isRight) next(); else prev(); }
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    pause(false);
                    return true;
                default:
                    return true;
            }
        });
    }

    private void pause(boolean on) {
        if (on == paused) return;
        if (on) { elapsedBefore += System.currentTimeMillis() - shownAt; if (video != null && isVideo) video.pause(); try { if (sound != null && sound.isPlaying()) sound.pause(); } catch (Exception ignored) { } }
        else { shownAt = System.currentTimeMillis(); if (video != null && isVideo) video.start(); try { if (sound != null) sound.start(); } catch (Exception ignored) { } }
        paused = on;
    }

    @Override protected void onResume() { super.onResume(); Ui.track(this, true); if (paused) pause(false); }
    @Override protected void onPause() { super.onPause(); Ui.track(this, false); pause(true); }
    @Override protected void onDestroy() { super.onDestroy(); Ui.MAIN.removeCallbacks(frame); stopSound(); }

    private void stopSound() {
        try { if (sound != null) sound.release(); } catch (Exception ignored) { }
        sound = null;
    }

    private void playSound(final String url, final String stamp) {
        try {
            final android.media.MediaPlayer mp = new android.media.MediaPlayer();
            sound = mp;
            mp.setDataSource(url);
            mp.setOnPreparedListener(m -> {
                if (!stamp.equals(loadedFor) || sound != m) { try { m.release(); } catch (Exception ignored) { } return; }
                int d = m.getDuration();
                if (d > 0) showMs = Math.max(BASE_MS, Math.min(31000L, (long) d + 400));
                if (!paused) m.start();
            });
            mp.setOnErrorListener((m, w, e) -> true);
            mp.prepareAsync();
        } catch (Exception ignored) { }
    }

    private List<JSONObject> cur() { return groups.get(g); }

    private void showGroup() {
        s = 0;
        // jump to the first story not seen yet
        List<JSONObject> l = cur();
        java.util.Set<String> seen = seenSet();
        for (int i = 0; i < l.size(); i++) if (!seen.contains(String.valueOf(l.get(i).optLong("id")))) { s = i; break; }
        bars.removeAllViews(); fills.clear();
        for (int i = 0; i < l.size(); i++) {
            FrameLayout seg = new FrameLayout(this);
            seg.setBackground(Ui.round(this, 0x55FFFFFF, 3));
            View f = new View(this);
            f.setBackground(Ui.round(this, Color.WHITE, 3));
            seg.addView(f, new FrameLayout.LayoutParams(0, -1));
            fills.add(f);
            LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(0, -1, 1f);
            sl.rightMargin = Ui.dp(this, 3);
            bars.addView(seg, sl);
        }
        JSONObject f0 = l.get(0);
        String nm = f0.optString("name", "Staff");
        nameT.setText(f0.optBoolean("mine") ? "Your story" : nm);
        av.set(nm, f0.optLong("userId"), photoFor(f0.optLong("userId")));
        showStory();
    }

    private String photoFor(long uid) {
        try {
            JSONArray a = new JSONArray(Store.s(this, "people"));
            for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optLong("id") == uid) return a.optJSONObject(i).optString("avatar", "");
        } catch (Exception ignored) { }
        return "";
    }

    private java.util.Set<String> seenSet() {
        java.util.Set<String> out = new java.util.HashSet<>();
        try { JSONArray a = new JSONArray(Store.s(this, "storySeen")); for (int i = 0; i < a.length(); i++) out.add(a.optString(i)); } catch (Exception ignored) { }
        return out;
    }

    private void markSeen(long id) {
        try {
            JSONArray a;
            try { a = new JSONArray(Store.s(this, "storySeen")); } catch (Exception e) { a = new JSONArray(); }
            for (int i = 0; i < a.length(); i++) if (a.optString(i).equals(String.valueOf(id))) return;
            a.put(String.valueOf(id));
            JSONArray trim = new JSONArray();
            for (int i = Math.max(0, a.length() - 300); i < a.length(); i++) trim.put(a.optString(i));
            Store.put(this, "storySeen", trim.toString());
        } catch (Exception ignored) { }
    }

    private void setProgress(float f) {
        for (int i = 0; i < fills.size(); i++) {
            View v = fills.get(i);
            float want = i < s ? 1f : (i == s ? f : 0f);
            ViewGroup.LayoutParams lp = v.getLayoutParams();
            int w = Math.round(((View) v.getParent()).getWidth() * want);
            if (lp.width != w) { lp.width = w; v.setLayoutParams(lp); }
        }
    }

    private void showStory() {
        Ui.MAIN.removeCallbacks(frame);
        stage.removeAllViews();
        stopSound();
        showMs = BASE_MS;
        video = null; isVideo = false;
        final JSONObject st = cur().get(s);
        final long id = st.optLong("id");
        markSeen(id);
        timeT.setText(Ui.ago(st.optString("createdAt")) + (Ui.ago(st.optString("createdAt")).equals("just now") ? "" : " ago"));
        int bg = Color.parseColor(st.optString("bg").matches("#[0-9a-fA-F]{6}") ? st.optString("bg") : "#2f6570");
        stage.setBackgroundColor(bg);
        String text = st.optString("text", "");
        final boolean hasPic = st.optBoolean("hasImage");
        final boolean vid = "video".equals(st.optString("kind"));

        if (!hasPic) {
            TextView t = Ui.tv(this, text, 28, Color.WHITE, true);
            t.setGravity(Gravity.CENTER);
            t.setPadding(Ui.dp(this, 28), 0, Ui.dp(this, 28), 0);
            stage.addView(t, new FrameLayout.LayoutParams(-1, -1));
        } else {
            final ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            stage.addView(iv, new FrameLayout.LayoutParams(-1, -1));
            String thumb = st.optString("thumb", "");
            if (thumb.length() > 0) Ui.load(thumb, 300, b -> { if (b != null && iv.getDrawable() == null) iv.setImageBitmap(b); });
            final String stamp = String.valueOf(id) + ":" + s + ":" + g;
            loadedFor = stamp;
            final Context app = getApplicationContext();
            new Thread(() -> {
                JSONObject r = Api.prof(app, "statusImage", "id", String.valueOf(id));
                final String src = r.optString("image", "");
                if (vid) {
                    Ui.MAIN.post(() -> { if (!stamp.equals(loadedFor) || isFinishing() || src.length() == 0) return; playVideo(src); });
                } else {
                    final android.graphics.Bitmap bm = Ui.loadSync(src, 1400);
                    Ui.MAIN.post(() -> { if (stamp.equals(loadedFor) && bm != null) iv.setImageBitmap(bm); });
                }
            }).start();
            if (vid) isVideo = true;
        }
        if (text.length() > 0 && hasPic) {
            TextView cap = Ui.tv(this, text, 17, Color.WHITE, false);
            cap.setGravity(Gravity.CENTER);
            cap.setBackground(Ui.round(this, 0x88000000, 14));
            cap.setPadding(Ui.dp(this, 14), Ui.dp(this, 8), Ui.dp(this, 14), Ui.dp(this, 8));
            FrameLayout.LayoutParams cl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
            cl.bottomMargin = Ui.dp(this, 70);
            stage.addView(cap, cl);
        }
        if (st.optBoolean("mine")) {
            TextView del = Ui.tv(this, "Delete", 14, Color.WHITE, true);
            del.setBackground(Ui.round(this, 0x99000000, 20));
            del.setPadding(Ui.dp(this, 16), Ui.dp(this, 8), Ui.dp(this, 16), Ui.dp(this, 8));
            FrameLayout.LayoutParams dl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
            dl.setMargins(0, 0, Ui.dp(this, 16), Ui.dp(this, 20));
            del.setOnClickListener(v -> new AlertDialog.Builder(this).setMessage("Delete this status?").setNegativeButton("Cancel", null)
                    .setPositiveButton("Delete", (d, w) -> {
                        final Context app = getApplicationContext();
                        new Thread(() -> Api.profPost(app, Api.o("action", "statusDelete", "id", id))).start();
                        cur().remove(st);
                        if (cur().isEmpty()) { groups.remove(g); finish(); } else { showGroup(); }
                    }).show());
            stage.addView(del, dl);
        }
        final String audio = st.optString("audio", "");
        if (audio.length() > 0 && !vid) {
            loadedFor = String.valueOf(id) + ":" + s + ":" + g;
            playSound(audio, loadedFor);
            TextView note = Ui.tv(this, "🎵  Sound", 12, Color.WHITE, true);
            note.setBackground(Ui.round(this, 0x88000000, 14));
            note.setPadding(Ui.dp(this, 10), Ui.dp(this, 4), Ui.dp(this, 10), Ui.dp(this, 4));
            FrameLayout.LayoutParams nl = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
            nl.setMargins(Ui.dp(this, 14), Ui.dp(this, 120), 0, 0);
            stage.addView(note, nl);
        }
        elapsedBefore = 0; shownAt = System.currentTimeMillis();
        setProgress(0f);
        Ui.MAIN.post(frame);
    }

    private void playVideo(String url) {
        stage.removeAllViews();
        video = new VideoView(this);
        FrameLayout.LayoutParams vl = new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER);
        stage.addView(video, vl);
        video.setVideoURI(Uri.parse(url));
        video.setOnPreparedListener(mp -> { if (!paused) mp.start(); });
        video.setOnCompletionListener(mp -> next());
        video.setOnErrorListener((mp, w, e) -> { next(); return true; });
    }

    private void next() {
        if (s + 1 < cur().size()) { s++; showStory(); return; }
        if (g + 1 < groups.size()) { g++; showGroup(); return; }
        finish();
    }

    private void prev() {
        if (s > 0) { s--; showStory(); return; }
        if (g > 0) { g--; showGroup(); s = 0; showStory(); return; }
        showStory();
    }
}
