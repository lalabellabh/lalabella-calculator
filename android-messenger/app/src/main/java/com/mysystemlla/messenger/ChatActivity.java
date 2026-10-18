package com.mysystemlla.messenger;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

public class ChatActivity extends Activity {
    private static final int REQ_PHOTO = 21;

    private String type, key, title, avatar;
    private long convId;
    private final ArrayList<JSONObject> msgs = new ArrayList<>();
    private final Set<Long> ids = new HashSet<>();
    private long lastId = 0;
    private String serverTime = "";
    private long meId;

    private ListView list;
    private EditText input;
    private LinearLayout root;
    private MsgAdapter adapter;
    private MediaPlayer player;
    private long playingId = -1;
    private boolean polling, loading, sending;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!polling) return;
            load(false);
            Ui.MAIN.postDelayed(this, 3000);
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        Intent in = getIntent();
        type = in.getStringExtra("type") == null ? "t" : in.getStringExtra("type");
        convId = in.getLongExtra("id", 0);
        title = in.getStringExtra("title") == null ? "Chat" : in.getStringExtra("title");
        avatar = in.getStringExtra("avatar") == null ? "" : in.getStringExtra("avatar");
        key = type.equals("t") ? "t" : type + convId;
        meId = Store.meId(this);
        if (!Store.loggedIn(this)) { finish(); return; }

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        // header
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setBackgroundColor(Ui.alpha(0xFFFFFFFF, Math.max(55, Store.headOpacity(this))));
        head.setPadding(Ui.dp(this, 6), Ui.dp(this, 8), Ui.dp(this, 14), Ui.dp(this, 8));
        TextView back = Ui.tv(this, "‹", 34, Ui.ACC, false);
        back.setPadding(Ui.dp(this, 10), 0, Ui.dp(this, 12), Ui.dp(this, 4));
        back.setOnClickListener(v -> finish());
        head.addView(back);
        AvatarView av = new AvatarView(this);
        if (type.equals("t")) av.set("LT", 3, ""); else av.set(title, convId, avatar);
        head.addView(av, new LinearLayout.LayoutParams(Ui.dp(this, 42), Ui.dp(this, 42)));
        LinearLayout tt = new LinearLayout(this);
        tt.setOrientation(LinearLayout.VERTICAL);
        tt.setPadding(Ui.dp(this, 10), 0, 0, 0);
        TextView t1 = Ui.tv(this, title, 17, Ui.INK, true);
        t1.setSingleLine(true);
        tt.addView(t1);
        String subtitle = type.equals("t") ? "Everyone in the team" : type.equals("g") ? "Group" : "Lalabella staff";
        tt.addView(Ui.tv(this, subtitle, 12, Ui.MUTED, false));
        head.addView(tt, new LinearLayout.LayoutParams(0, -2, 1f));
        root.addView(head, new LinearLayout.LayoutParams(-1, -2));

        // messages
        list = new ListView(this);
        list.setDivider(null);
        list.setSelector(android.R.color.transparent);
        list.setClipToPadding(false);
        list.setPadding(Ui.dp(this, 8), Ui.dp(this, 8), Ui.dp(this, 8), Ui.dp(this, 8));
        adapter = new MsgAdapter();
        list.setAdapter(adapter);
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));

        // composer
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Ui.alpha(0xFFFFFFFF, Math.max(55, Store.headOpacity(this))));
        bar.setPadding(Ui.dp(this, 8), Ui.dp(this, 6), Ui.dp(this, 8), Ui.dp(this, 6));
        TextView pic = Ui.tv(this, "🖼", 24, Color.BLACK, false);
        pic.setPadding(Ui.dp(this, 8), Ui.dp(this, 4), Ui.dp(this, 8), Ui.dp(this, 4));
        pic.setOnClickListener(v -> {
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.setType("image/*");
            startActivityForResult(Intent.createChooser(i, "Send a photo"), REQ_PHOTO);
        });
        bar.addView(pic);
        input = new EditText(this);
        input.setHint("Message");
        input.setTextSize(16);
        input.setTextColor(Ui.INK);
        input.setMaxLines(4);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setBackground(Ui.round(this, 0xFFEEF3F4, 22));
        input.setPadding(Ui.dp(this, 16), Ui.dp(this, 9), Ui.dp(this, 16), Ui.dp(this, 9));
        LinearLayout.LayoutParams il = new LinearLayout.LayoutParams(0, -2, 1f);
        il.setMargins(Ui.dp(this, 2), 0, Ui.dp(this, 6), 0);
        bar.addView(input, il);
        TextView send = Ui.tv(this, "➤", 20, Color.WHITE, false);
        send.setGravity(Gravity.CENTER);
        send.setBackground(Ui.round(this, Ui.ACC, 30));
        send.setOnClickListener(v -> sendText());
        bar.addView(send, new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44)));
        root.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);
    }

    @Override protected void onResume() {
        super.onResume();
        Ui.track(this, true);
        Ui.openConv = key;
        root.setBackground(Ui.wallpaper(this));
        adapter.notifyDataSetChanged();
        Bubble.hide(this);
        polling = true;
        Ui.MAIN.post(tick);
    }

    @Override protected void onPause() {
        super.onPause();
        Ui.track(this, false);
        if (key.equals(Ui.openConv)) Ui.openConv = "";
        polling = false;
        Ui.MAIN.removeCallbacks(tick);
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        stopPlayer();
    }

    // ------------------------------------------------------------ loading
    private JSONObject body(String action) {
        JSONObject o = Api.o("action", action);
        try {
            if (type.equals("d")) o.put("peerId", convId);
            else if (type.equals("g")) o.put("groupId", convId);
        } catch (Exception ignored) { }
        return o;
    }

    private void load(final boolean first) {
        if (loading) return;
        loading = true;
        final Context app = getApplicationContext();
        final long since = lastId;
        final String delSince = serverTime;
        new Thread(() -> {
            JSONObject q = body("list");
            try {
                if (since > 0) { q.put("sinceId", since); if (delSince.length() > 0) q.put("delSince", delSince); }
                else q.put("limit", 60);
            } catch (Exception ignored) { }
            final JSONObject r = Api.chat(app, q);
            Ui.MAIN.post(() -> {
                loading = false;
                if (isFinishing() || !r.optBoolean("success")) return;
                if (r.optLong("meId") > 0) { meId = r.optLong("meId"); Store.sp(app).edit().putLong("meId", meId).apply(); }
                serverTime = r.optString("serverTime", serverTime);
                boolean atBottom = atBottom();
                boolean changed = false;
                JSONArray del = r.optJSONArray("deletedIds");
                if (del != null && del.length() > 0) {
                    Set<Long> d = new HashSet<>();
                    for (int i = 0; i < del.length(); i++) d.add(del.optLong(i));
                    for (int i = msgs.size() - 1; i >= 0; i--) if (d.contains(msgs.get(i).optLong("id"))) { ids.remove(msgs.get(i).optLong("id")); msgs.remove(i); changed = true; }
                }
                JSONArray ms = r.optJSONArray("messages");
                if (ms != null) for (int i = 0; i < ms.length(); i++) changed |= addMsg(ms.optJSONObject(i));
                if (changed || first) {
                    adapter.notifyDataSetChanged();
                    if (atBottom || msgs.size() == (ms == null ? 0 : ms.length())) list.setSelection(Math.max(0, adapter.getCount() - 1));
                }
                markSeen();
            });
        }).start();
    }

    private boolean addMsg(JSONObject m) {
        if (m == null) return false;
        long id = m.optLong("id");
        if (id == 0 || ids.contains(id)) return false;
        ids.add(id);
        msgs.add(m);
        if (id > lastId) lastId = id;
        return true;
    }

    private boolean atBottom() { return msgs.isEmpty() || list.getLastVisiblePosition() >= adapter.getCount() - 2; }

    private void markSeen() {
        if (lastId > 0) Store.setSeen(this, key, lastId);
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(key.hashCode());
        } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------ sending
    private void sendText() {
        final String text = input.getText().toString().trim();
        if (text.length() == 0 || sending) return;
        sending = true;
        input.setText("");
        final Context app = getApplicationContext();
        new Thread(() -> {
            JSONObject q = body("send");
            try { q.put("text", text); } catch (Exception ignored) { }
            final JSONObject r = Api.chat(app, q);
            Ui.MAIN.post(() -> {
                sending = false;
                if (r.optBoolean("success") && r.optJSONObject("message") != null) {
                    addMsg(r.optJSONObject("message"));
                    adapter.notifyDataSetChanged();
                    list.setSelection(Math.max(0, adapter.getCount() - 1));
                    markSeen();
                } else {
                    input.setText(text);
                    Ui.toast(this, r.optString("error", "Could not send."));
                }
            });
        }).start();
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_PHOTO || res != RESULT_OK || data == null || data.getData() == null) return;
        final Uri u = data.getData();
        final Context app = getApplicationContext();
        Ui.toast(this, "Sending photo…");
        new Thread(() -> {
            String uri = null;
            try {
                InputStream is = getContentResolver().openInputStream(u);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while ((n = is.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 25 * 1024 * 1024) break; }
                is.close();
                Bitmap bm = Ui.decode(bo.toByteArray(), 1400);
                if (bm != null) uri = MainActivity.jpegData(bm, 1280, 1_300_000);
            } catch (Throwable ignored) { }
            if (uri == null) { Ui.MAIN.post(() -> Ui.toast(this, "Could not read that picture.")); return; }
            JSONObject q = body("send");
            try { q.put("kind", "image"); q.put("mime", "image/jpeg"); q.put("data", uri.substring(uri.indexOf(',') + 1)); } catch (Exception ignored) { }
            final JSONObject r = Api.chat(app, q);
            Ui.MAIN.post(() -> {
                if (r.optBoolean("success") && r.optJSONObject("message") != null) {
                    addMsg(r.optJSONObject("message"));
                    adapter.notifyDataSetChanged();
                    list.setSelection(Math.max(0, adapter.getCount() - 1));
                    markSeen();
                } else Ui.toast(this, r.optString("error", "Could not send the photo."));
            });
        }).start();
    }

    // ------------------------------------------------------------ voice playback
    private void stopPlayer() {
        try { if (player != null) { player.release(); } } catch (Exception ignored) { }
        player = null; playingId = -1;
    }
    private void playVoice(final JSONObject m) {
        long id = m.optLong("id");
        if (playingId == id) { stopPlayer(); adapter.notifyDataSetChanged(); return; }
        stopPlayer();
        try {
            player = new MediaPlayer();
            player.setDataSource(m.optString("mediaUrl"));
            player.setOnPreparedListener(mp -> mp.start());
            player.setOnCompletionListener(mp -> { stopPlayer(); adapter.notifyDataSetChanged(); });
            player.setOnErrorListener((mp, w, e) -> { stopPlayer(); adapter.notifyDataSetChanged(); return true; });
            playingId = id;
            player.prepareAsync();
        } catch (Exception e) { stopPlayer(); Ui.toast(this, "Could not play this voice message."); }
        adapter.notifyDataSetChanged();
    }

    // ------------------------------------------------------------ bubbles
    private final class MsgAdapter extends BaseAdapter {
        @Override public int getCount() { return msgs.size(); }
        @Override public Object getItem(int i) { return msgs.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override public View getView(int pos, View cv, ViewGroup parent) {
            final JSONObject m = msgs.get(pos);
            final boolean mine = m.optLong("userId") == meId;
            Context c = ChatActivity.this;
            LinearLayout row = new LinearLayout(c);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setGravity(mine ? Gravity.END : Gravity.START);
            row.setLayoutParams(new android.widget.AbsListView.LayoutParams(-1, -2));
            row.setPadding(0, Ui.dp(c, 2), 0, Ui.dp(c, 2));

            boolean prevSame = pos > 0 && msgs.get(pos - 1).optLong("userId") == m.optLong("userId");
            if (!mine && !type.equals("d") && !prevSame) {
                TextView nm = Ui.tv(c, m.optString("name", ""), 11, Ui.INK, true);
                nm.setBackground(Ui.round(c, 0x80FFFFFF, 8));
                nm.setPadding(Ui.dp(c, 6), 0, Ui.dp(c, 6), 0);
                LinearLayout.LayoutParams nl = new LinearLayout.LayoutParams(-2, -2);
                nl.leftMargin = Ui.dp(c, 8);
                row.addView(nm, nl);
            }

            LinearLayout bubble = new LinearLayout(c);
            bubble.setOrientation(LinearLayout.VERTICAL);
            int op = Store.bubbleOpacity(c);
            GradientDrawable bg;
            if (mine) bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[] { Ui.alpha(Ui.ACC, op), Ui.alpha(Ui.ACC2, op) });
            else { bg = new GradientDrawable(); bg.setColor(Ui.alpha(0xFFFFFFFF, op)); }
            bg.setCornerRadius(Ui.dp(c, 20));
            bubble.setBackground(bg);
            int ph = Ui.dp(c, 13), pv = Ui.dp(c, 8);
            String kind = m.optString("kind", "text");
            int fg = mine ? Color.WHITE : Ui.INK;

            if (kind.equals("image") || kind.equals("gif") || kind.equals("sticker")) {
                bubble.setPadding(Ui.dp(c, 4), Ui.dp(c, 4), Ui.dp(c, 4), Ui.dp(c, 4));
                if (m.optBoolean("expired") || m.optString("mediaUrl").length() == 0) {
                    TextView x = Ui.tv(c, "📷 Photo expired", 14, fg, false);
                    x.setPadding(ph, pv, ph, pv);
                    bubble.addView(x);
                } else {
                    final ImageView iv = new ImageView(c);
                    iv.setAdjustViewBounds(true);
                    iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
                    final String url = m.optString("mediaUrl");
                    iv.setTag(url);
                    iv.setMinimumHeight(Ui.dp(c, 120));
                    Ui.load(url, 700, b -> { if (b != null && url.equals(iv.getTag())) iv.setImageBitmap(b); });
                    iv.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
                    bubble.addView(iv, new LinearLayout.LayoutParams(Ui.dp(c, 220), -2));
                    String cap = m.optString("text", "");
                    if (kind.equals("image") && cap.length() > 0 && !cap.startsWith("📷")) {
                        TextView ct = Ui.tv(c, cap, 15, fg, false);
                        ct.setPadding(ph - Ui.dp(c, 4), pv, ph - Ui.dp(c, 4), Ui.dp(c, 2));
                        bubble.addView(ct);
                    }
                }
            } else if (kind.equals("voice")) {
                bubble.setPadding(ph, pv, ph, pv);
                int sec = Math.round(m.optInt("durationMs") / 1000f);
                String label = (playingId == m.optLong("id") ? "⏸  " : "▶  ") + (sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60);
                if (m.optBoolean("expired")) label = "🎤 Voice message expired";
                TextView vt = Ui.tv(c, label, 16, fg, true);
                bubble.addView(vt);
                if (!m.optBoolean("expired")) bubble.setOnClickListener(v -> playVoice(m));
            } else {
                bubble.setPadding(ph, pv, ph, pv);
                TextView tx = Ui.tv(c, m.optString("text", ""), 16, fg, false);
                tx.setAutoLinkMask(android.text.util.Linkify.WEB_URLS);
                tx.setLinkTextColor(mine ? 0xFFD6F1F7 : Ui.ACC);
                bubble.addView(tx);
            }
            if (mine) bubble.setOnLongClickListener(v -> {
                new AlertDialog.Builder(c).setMessage("Delete this message for everyone?").setNegativeButton("Cancel", null)
                        .setPositiveButton("Delete", (d, w) -> deleteMsg(m)).show();
                return true;
            });
            LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(-2, -2);
            bl.leftMargin = mine ? Ui.dp(c, 60) : 0; bl.rightMargin = mine ? 0 : Ui.dp(c, 60);
            row.addView(bubble, bl);

            boolean nextSame = pos + 1 < msgs.size() && msgs.get(pos + 1).optLong("userId") == m.optLong("userId");
            if (!nextSame) {
                TextView tm = Ui.tv(c, Ui.clock(m.optString("time")), 10, Ui.INK, false);
                tm.setBackground(Ui.round(c, 0x66FFFFFF, 8));
                tm.setPadding(Ui.dp(c, 6), 0, Ui.dp(c, 6), 0);
                LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(-2, -2);
                tl.setMargins(Ui.dp(c, 6), Ui.dp(c, 2), Ui.dp(c, 6), 0);
                row.addView(tm, tl);
            }
            return row;
        }
    }

    private void deleteMsg(final JSONObject m) {
        final Context app = getApplicationContext();
        final long id = m.optLong("id");
        new Thread(() -> {
            JSONObject r = Api.chat(app, Api.o("action", "delete", "id", id));
            Ui.MAIN.post(() -> {
                if (r.optBoolean("success")) { msgs.remove(m); ids.remove(id); adapter.notifyDataSetChanged(); }
                else Ui.toast(this, r.optString("error", "Could not delete."));
            });
        }).start();
    }
}
