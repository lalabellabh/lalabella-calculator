package com.mysystemlla.twa;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.widget.ImageView;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/** The small chat window shown inside a Messenger-style bubble: last messages + a box to answer. */
public class LbBubbleActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LinearLayout list;
    private ScrollView scroll;
    private EditText input;
    private int peer, grp;
    private boolean team, alive;
    private String lastSig = "";
    private static final Map<String, Bitmap> PICS = new HashMap<String, Bitmap>();

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        peer = getIntent().getIntExtra("peer", 0);
        grp = getIntent().getIntExtra("grp", 0);
        team = getIntent().getBooleanExtra("team", false);
        String title = getIntent().getStringExtra("title");
        final String path = getIntent().getStringExtra("path");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setBackgroundColor(0xFFC9506B);
        head.setPadding(dp(12), dp(10), dp(8), dp(10));
        TextView tv = new TextView(this);
        tv.setText(title == null || title.isEmpty() ? "Lalabella chat" : title);
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(15);
        tv.setTypeface(null, android.graphics.Typeface.BOLD);
        tv.setSingleLine(true);
        head.addView(tv, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView open = new TextView(this);
        open.setText("Open ↗");
        open.setTextColor(Color.WHITE);
        open.setTextSize(13);
        open.setPadding(dp(10), dp(4), dp(10), dp(4));
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(LbWidgetProvider.site(LbBubbleActivity.this, path == null ? "chatbox.html" : path)))
                            .setPackage(getPackageName()).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) { }
            }
        });
        head.addView(open);
        root.addView(head);

        scroll = new ScrollView(this);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(10), dp(8), dp(10), dp(8));
        scroll.addView(list);
        root.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(8), dp(6), dp(8), dp(6));
        bar.setBackgroundColor(0xFFF7EEF0);
        input = new EditText(this);
        input.setHint("Message…");
        input.setSingleLine(false);
        input.setMaxLines(3);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        bar.addView(input, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        Button send = new Button(this);
        send.setText("Send");
        send.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                send();
            }
        });
        bar.addView(send);
        root.addView(bar);
        setContentView(root);
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onResume() {
        super.onResume();
        alive = true;
        tick();
    }

    @Override
    protected void onPause() {
        alive = false;
        super.onPause();
    }

    private void tick() {
        if (!alive) return;
        load();
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                tick();
            }
        }, 5000);
    }

    private String key() {
        return getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).getString("key", "");
    }

    private JSONObject base(String action) throws Exception {
        JSONObject r = new JSONObject().put("action", action).put("key", key());
        if (peer > 0) r.put("peerId", peer); else if (grp > 0) r.put("groupId", grp); else r.put("team", true);
        return r;
    }

    private void load() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String res = LbWidgetProvider.httpPost(LbReplyReceiver.CHATX, base("keyRecent").toString());
                    int nl = res.indexOf('\n');
                    final JSONObject j = new JSONObject(res.substring(nl + 1));
                    if (!j.optBoolean("success")) return;
                    final JSONArray a = j.getJSONArray("messages");
                    final String sig = a.length() == 0 ? "" : a.getJSONObject(a.length() - 1).optString("id") + ":" + a.length();
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            if (!sig.equals(lastSig)) {
                                lastSig = sig;
                                draw(a);
                            }
                        }
                    });
                } catch (Exception ignored) { }
            }
        }).start();
    }

    private void draw(JSONArray a) {
        list.removeAllViews();
        for (int i = 0; i < a.length(); i++) {
            JSONObject m = a.optJSONObject(i);
            if (m == null) continue;
            boolean mine = m.optBoolean("mine");
            String pic = m.optString("url", "");
            if (!pic.isEmpty()) { // sticker / GIF: show the picture itself
                final ImageView iv = new ImageView(this);
                iv.setAdjustViewBounds(true);
                iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
                iv.setMaxHeight(dp(150));
                LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(150), LinearLayout.LayoutParams.WRAP_CONTENT);
                ip.gravity = mine ? Gravity.END : Gravity.START;
                ip.setMargins(0, dp(3), 0, dp(3));
                list.addView(iv, ip);
                showPic(iv, pic);
                continue;
            }
            TextView t = new TextView(this);
            String from = m.optString("from", "");
            t.setText((mine || from.isEmpty() || peer > 0 ? "" : from.split(" ")[0] + ": ") + m.optString("text", ""));
            t.setTextSize(14);
            t.setTextColor(mine ? Color.WHITE : 0xFF3A2A2E);
            t.setBackgroundColor(mine ? 0xFFC9506B : 0xFFF1E6E8);
            t.setPadding(dp(10), dp(6), dp(10), dp(6));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.gravity = mine ? Gravity.END : Gravity.START;
            lp.setMargins(mine ? dp(40) : 0, dp(3), mine ? 0 : dp(40), dp(3));
            list.addView(t, lp);
        }
        scroll.post(new Runnable() {
            @Override
            public void run() {
                scroll.fullScroll(View.FOCUS_DOWN);
            }
        });
    }

    /** Loads a sticker/GIF (first frame) into the image view; remembered while the bubble is open. */
    private void showPic(final ImageView iv, final String url) {
        Bitmap hit = PICS.get(url);
        if (hit != null) { iv.setImageBitmap(hit); return; }
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    InputStream is = c.getInputStream();
                    final Bitmap b = BitmapFactory.decodeStream(is);
                    is.close();
                    c.disconnect();
                    if (b == null) return;
                    if (PICS.size() > 40) PICS.clear();
                    PICS.put(url, b);
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            iv.setImageBitmap(b);
                            scroll.fullScroll(View.FOCUS_DOWN);
                        }
                    });
                } catch (Exception ignored) { }
            }
        }).start();
    }

    private void send() {
        final String msg = input.getText().toString().trim();
        if (msg.isEmpty()) return;
        input.setText("");
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    LbWidgetProvider.httpPost(LbReplyReceiver.CHATX, base("keyReply").put("text", msg).toString());
                } catch (Exception ignored) { }
                load();
            }
        }).start();
    }
}
