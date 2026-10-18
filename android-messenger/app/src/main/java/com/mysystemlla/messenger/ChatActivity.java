package com.mysystemlla.messenger;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.Manifest;
import android.content.ClipData;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.MediaRecorder;
import android.os.Build;
import android.provider.MediaStore;
import android.text.Editable;
import android.text.TextWatcher;
import java.io.File;
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
    private static final int REQ_PHOTO = 21, REQ_CAM = 22, REQ_MIC = 23;

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
    private LinearLayout bar, recBar;
    private TextView sendBtn, micBtn, recTime;
    private MediaRecorder rec;
    private File recFile;
    private long recStart;
    private final Runnable recTick = new Runnable() {
        @Override public void run() {
            if (rec == null) return;
            long ms = System.currentTimeMillis() - recStart;
            int sec = (int) (ms / 1000);
            recTime.setText("●  Recording  " + (sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60));
            if (ms >= 59000) { stopRec(true); return; }
            Ui.MAIN.postDelayed(this, 250);
        }
    };

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
        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Ui.alpha(0xFFFFFFFF, Math.max(55, Store.headOpacity(this))));
        bar.setPadding(Ui.dp(this, 6), Ui.dp(this, 6), Ui.dp(this, 8), Ui.dp(this, 6));
        TextView cam = Ui.tv(this, "📷", 23, Color.BLACK, false);
        cam.setPadding(Ui.dp(this, 7), Ui.dp(this, 4), Ui.dp(this, 5), Ui.dp(this, 4));
        cam.setOnClickListener(v -> openCamera());
        bar.addView(cam);
        TextView pic = Ui.tv(this, "🖼", 23, Color.BLACK, false);
        pic.setPadding(Ui.dp(this, 5), Ui.dp(this, 4), Ui.dp(this, 7), Ui.dp(this, 4));
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
        sendBtn = Ui.tv(this, "➤", 20, Color.WHITE, false);
        sendBtn.setGravity(Gravity.CENTER);
        sendBtn.setBackground(Ui.round(this, Ui.ACC, 30));
        sendBtn.setOnClickListener(v -> sendText());
        sendBtn.setVisibility(View.GONE);
        bar.addView(sendBtn, new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44)));
        micBtn = Ui.tv(this, "🎤", 22, Color.WHITE, false);
        micBtn.setGravity(Gravity.CENTER);
        micBtn.setBackground(Ui.round(this, Ui.ACC, 30));
        micBtn.setOnClickListener(v -> startRec());
        bar.addView(micBtn, new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44)));
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence a, int b, int c, int d) { }
            @Override public void onTextChanged(CharSequence a, int b, int c, int d) { }
            @Override public void afterTextChanged(Editable e) {
                boolean has = e.toString().trim().length() > 0;
                sendBtn.setVisibility(has ? View.VISIBLE : View.GONE);
                micBtn.setVisibility(has ? View.GONE : View.VISIBLE);
            }
        });
        root.addView(bar, new LinearLayout.LayoutParams(-1, -2));

        // recording bar (replaces the composer while you record a voice message)
        recBar = new LinearLayout(this);
        recBar.setOrientation(LinearLayout.HORIZONTAL);
        recBar.setGravity(Gravity.CENTER_VERTICAL);
        recBar.setBackgroundColor(0xFFFFFFFF);
        recBar.setPadding(Ui.dp(this, 14), Ui.dp(this, 8), Ui.dp(this, 10), Ui.dp(this, 8));
        recBar.setVisibility(View.GONE);
        TextView cancel = Ui.tv(this, "✕", 22, 0xFFE5484D, true);
        cancel.setPadding(Ui.dp(this, 6), Ui.dp(this, 6), Ui.dp(this, 14), Ui.dp(this, 6));
        cancel.setOnClickListener(v -> stopRec(false));
        recBar.addView(cancel);
        recTime = Ui.tv(this, "●  Recording  0:00", 16, 0xFFE5484D, true);
        recBar.addView(recTime, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView go = Ui.tv(this, "➤", 20, Color.WHITE, false);
        go.setGravity(Gravity.CENTER);
        go.setBackground(Ui.round(this, Ui.ACC, 30));
        go.setOnClickListener(v -> stopRec(true));
        recBar.addView(go, new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44)));
        root.addView(recBar, new LinearLayout.LayoutParams(-1, -2));
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
        if (rec != null) stopRec(false);
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

    private void openCamera() {
        try {
            File dir = new File(getCacheDir(), "camera");
            dir.mkdirs();
            File f = new File(dir, "pic.jpg");
            if (f.exists()) f.delete();
            Uri u = Uri.parse("content://" + CamProvider.AUTH + "/pic.jpg");
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, u);
            i.setClipData(ClipData.newRawUri("", u));
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(i, REQ_CAM);
        } catch (Exception e) { Ui.toast(this, "No camera app found."); }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK) return;
        final Context app = getApplicationContext();
        if (req == REQ_CAM) {
            Ui.toast(this, "Sending photo…");
            new Thread(() -> {
                Bitmap bm = null;
                try {
                    File f = new File(new File(getCacheDir(), "camera"), "pic.jpg");
                    java.io.FileInputStream is = new java.io.FileInputStream(f);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192]; int n;
                    while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                    is.close();
                    byte[] raw = bo.toByteArray();
                    bm = Ui.upright(raw, Ui.decode(raw, 1400));
                    f.delete();
                } catch (Throwable ignored) { }
                sendBitmap(app, bm);
            }).start();
        } else if (req == REQ_PHOTO && data != null && data.getData() != null) {
            final Uri u = data.getData();
            Ui.toast(this, "Sending photo…");
            new Thread(() -> {
                Bitmap bm = null;
                try {
                    InputStream is = getContentResolver().openInputStream(u);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192]; int n;
                    while ((n = is.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 25 * 1024 * 1024) break; }
                    is.close();
                    byte[] raw = bo.toByteArray();
                    bm = Ui.upright(raw, Ui.decode(raw, 1400));
                } catch (Throwable ignored) { }
                sendBitmap(app, bm);
            }).start();
        }
    }

    /** Shrinks the picture (long side 1280 px, JPEG under ~1 MB) and sends it. Runs on a background thread. */
    private void sendBitmap(Context app, Bitmap bm) {
        String uri = bm == null ? null : MainActivity.jpegData(bm, 1280, 1_300_000);
        if (uri == null) { Ui.MAIN.post(() -> Ui.toast(this, "Could not read that picture.")); return; }
        JSONObject q = body("send");
        try { q.put("kind", "image"); q.put("mime", "image/jpeg"); q.put("data", uri.substring(uri.indexOf(',') + 1)); } catch (Exception ignored) { }
        final JSONObject r = Api.chat(app, q);
        Ui.MAIN.post(() -> afterSend(r, "Could not send the photo."));
    }

    private void afterSend(JSONObject r, String fail) {
        if (r.optBoolean("success") && r.optJSONObject("message") != null) {
            addMsg(r.optJSONObject("message"));
            adapter.notifyDataSetChanged();
            list.setSelection(Math.max(0, adapter.getCount() - 1));
            markSeen();
        } else Ui.toast(this, r.optString("error", fail));
    }

    // ------------------------------------------------------------ voice recording
    private void startRec() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQ_MIC);
            return;
        }
        if (rec != null) return;
        stopPlayer();
        try {
            recFile = new File(getCacheDir(), "voice.m4a");
            MediaRecorder r = new MediaRecorder();
            r.setAudioSource(MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            r.setAudioEncodingBitRate(48000);
            r.setAudioSamplingRate(44100);
            r.setOutputFile(recFile.getAbsolutePath());
            r.prepare();
            r.start();
            rec = r;
            recStart = System.currentTimeMillis();
            bar.setVisibility(View.GONE);
            recBar.setVisibility(View.VISIBLE);
            Ui.MAIN.post(recTick);
        } catch (Throwable t) {
            try { if (rec != null) rec.release(); } catch (Throwable ignored) { }
            rec = null;
            Ui.toast(this, "Could not start the microphone.");
        }
    }

    private void stopRec(boolean send) {
        Ui.MAIN.removeCallbacks(recTick);
        MediaRecorder r = rec;
        rec = null;
        long dur = System.currentTimeMillis() - recStart;
        boolean ok = true;
        if (r != null) {
            try { r.stop(); } catch (Throwable t) { ok = false; }
            try { r.release(); } catch (Throwable ignored) { }
        }
        recBar.setVisibility(View.GONE);
        bar.setVisibility(View.VISIBLE);
        if (!send || !ok || recFile == null) { if (recFile != null) recFile.delete(); return; }
        if (dur < 800) { Ui.toast(this, "Hold on a little longer — too short."); recFile.delete(); return; }
        final File f = recFile;
        final long ms = Math.min(dur, 60000);
        final Context app = getApplicationContext();
        new Thread(() -> {
            String b64 = null;
            try {
                java.io.FileInputStream is = new java.io.FileInputStream(f);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                is.close();
                if (bo.size() <= 1_450_000) b64 = Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
            } catch (Throwable ignored) { }
            f.delete();
            if (b64 == null) { Ui.MAIN.post(() -> Ui.toast(this, "That voice message is too big.")); return; }
            JSONObject q = body("send");
            try { q.put("kind", "voice"); q.put("mime", "audio/mp4"); q.put("durationMs", ms); q.put("data", b64); } catch (Exception ignored) { }
            final JSONObject res = Api.chat(app, q);
            Ui.MAIN.post(() -> afterSend(res, "Could not send the voice message."));
        }).start();
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req == REQ_MIC) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startRec();
            else Ui.toast(this, "Allow the microphone to send voice messages.");
        }
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
                TextView tx = Ui.tv(c, m.optString("text", ""), Store.textSize(c), fg, false);
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
