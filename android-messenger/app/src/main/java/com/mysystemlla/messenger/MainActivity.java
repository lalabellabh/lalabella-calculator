package com.mysystemlla.messenger;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ListView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int REQ_PHOTO = 11, REQ_NOTIF = 12;
    private static final String[] BG = { "#2f6570", "#c9506b", "#7a5a9e", "#3d6fa3", "#5f8f63", "#b07d2b" };

    private FrameLayout content;
    private LinearLayout root, navChats, navMe;
    private TextView navChatsT, navMeT;
    private int tab = 0;

    // chats
    private ListView list;
    private RowAdapter adapter;
    private LinearLayout storyRow;
    private final ArrayList<Row> all = new ArrayList<>(), shown = new ArrayList<>();
    private String filter = "";
    private JSONArray people = new JSONArray(), groups = new JSONArray();
    private JSONObject unread = new JSONObject();
    private final List<List<JSONObject>> storyGroups = new ArrayList<>();
    private final LinkedHashMap<Long, String> storyNames = new LinkedHashMap<>();
    private final ArrayList<JSONObject> myStories = new ArrayList<>();
    private final Map<Long, String> photoOf = new java.util.HashMap<>();

    // me
    private LinearLayout meBox;
    private JSONObject myProfile;

    // status compose
    private String pendingText = "", pendingBg = BG[0];

    private boolean polling;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!polling) return;
            refresh();
            Ui.MAIN.postDelayed(this, 8000);
        }
    };

    static final class Row {
        String key, type, title, sub, avatar; long id; boolean online; int unread; long userId; String lastTime = "";
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (!Store.loggedIn(this)) { startActivity(new Intent(this, LoginActivity.class)); finish(); return; }
        build();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIF);
        }
        if (Store.b(this, "notif", true)) WatchService.start(this);
        showTab(0);
    }

    @Override protected void onResume() {
        super.onResume();
        Ui.track(this, true);
        root.setBackground(Ui.wallpaper(this));
        polling = true;
        Ui.MAIN.post(tick);
        Bubble.hide(this);
        if (tab == 0) restyleList();
    }

    @Override protected void onPause() {
        super.onPause();
        Ui.track(this, false);
        polling = false;
        Ui.MAIN.removeCallbacks(tick);
    }

    // ------------------------------------------------------------ layout
    private void build() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1f));

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setBackgroundColor(0xF2FFFFFF);
        nav.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6));
        navChatsT = Ui.tv(this, "Chats", 12, Ui.ACC, true);
        navMeT = Ui.tv(this, "Me", 12, Ui.MUTED, true);
        navChats = navItem("💬", navChatsT);
        navMe = navItem("👤", navMeT);
        navChats.setOnClickListener(v -> showTab(0));
        navMe.setOnClickListener(v -> showTab(1));
        nav.addView(navChats, new LinearLayout.LayoutParams(0, -2, 1f));
        nav.addView(navMe, new LinearLayout.LayoutParams(0, -2, 1f));
        root.addView(nav, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);

        buildChatsTab();
        buildMeTab();
    }

    private LinearLayout navItem(String emoji, TextView label) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        TextView e = Ui.tv(this, emoji, 22, Color.BLACK, false);
        e.setGravity(Gravity.CENTER);
        l.addView(e);
        label.setGravity(Gravity.CENTER);
        l.addView(label);
        return l;
    }

    private void showTab(int t) {
        tab = t;
        content.removeAllViews();
        navChatsT.setTextColor(t == 0 ? Ui.ACC : Ui.MUTED);
        navMeT.setTextColor(t == 1 ? Ui.ACC : Ui.MUTED);
        if (t == 0) { content.addView(chatsView); restyleList(); } else { content.addView(meScroll); renderMe(); loadProfile(); }
        refresh();
    }

    private LinearLayout chatsView;
    private ScrollView meScroll;

    private void buildChatsTab() {
        chatsView = new LinearLayout(this);
        chatsView.setOrientation(LinearLayout.VERTICAL);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setBackgroundColor(0xF2FFFFFF);
        top.setPadding(Ui.dp(this, 16), Ui.dp(this, 12), Ui.dp(this, 16), Ui.dp(this, 10));
        TextView title = Ui.tv(this, "Chats", 26, Ui.INK, true);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView cog = Ui.tv(this, "⚙", 22, Ui.ACC, false);
        cog.setPadding(Ui.dp(this, 10), 0, 0, 0);
        cog.setOnClickListener(v -> startActivity(new Intent(this, SettingsActivity.class)));
        top.addView(cog);
        chatsView.addView(top, new LinearLayout.LayoutParams(-1, -2));

        list = new ListView(this);
        list.setDivider(null);
        list.setSelector(android.R.color.transparent);
        list.setClipToPadding(false);
        list.setPadding(Ui.dp(this, 10), Ui.dp(this, 4), Ui.dp(this, 10), Ui.dp(this, 8));

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.VERTICAL);
        EditText search = new EditText(this);
        search.setHint("Search");
        search.setSingleLine(true);
        search.setTextSize(15);
        search.setTextColor(Ui.INK);
        search.setBackground(Ui.round(this, 0xE6FFFFFF, 22));
        search.setPadding(Ui.dp(this, 16), Ui.dp(this, 10), Ui.dp(this, 16), Ui.dp(this, 10));
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(-1, -2);
        sl.setMargins(Ui.dp(this, 4), Ui.dp(this, 8), Ui.dp(this, 4), Ui.dp(this, 4));
        head.addView(search, sl);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) { filter = s.toString().trim().toLowerCase(Locale.getDefault()); applyFilter(); }
        });
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        storyRow = new LinearLayout(this);
        storyRow.setOrientation(LinearLayout.HORIZONTAL);
        storyRow.setPadding(Ui.dp(this, 2), Ui.dp(this, 6), Ui.dp(this, 2), Ui.dp(this, 6));
        hs.addView(storyRow);
        head.addView(hs, new LinearLayout.LayoutParams(-1, -2));
        list.addHeaderView(head, null, false);

        adapter = new RowAdapter();
        list.setAdapter(adapter);
        list.setOnItemClickListener((p, v, pos, id) -> {
            Object o = p.getItemAtPosition(pos);
            if (o instanceof Row) openRow((Row) o);
        });
        chatsView.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));
    }

    private void restyleList() { if (adapter != null) adapter.notifyDataSetChanged(); }

    private void openRow(Row r) {
        Intent i = new Intent(this, ChatActivity.class);
        i.putExtra("type", r.type).putExtra("id", r.id).putExtra("title", r.title).putExtra("avatar", r.avatar == null ? "" : r.avatar);
        startActivity(i);
    }

    // ------------------------------------------------------------ data
    private void refresh() {
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            JSONObject pr = Api.chat(app, Api.o("action", "people"));
            if (pr.optBoolean("success")) {
                Store.sp(app).edit().putLong("meId", pr.optLong("meId")).putString("people", pr.optJSONArray("people") == null ? "[]" : pr.optJSONArray("people").toString()).apply();
                people = pr.optJSONArray("people") == null ? new JSONArray() : pr.optJSONArray("people");
            } else if (pr.optBoolean("net")) {
                Ui.MAIN.post(() -> { /* offline: keep what we have */ });
            }
            JSONObject gr = Api.chat(app, Api.o("action", "groups"));
            if (gr.optBoolean("success") && gr.optJSONArray("groups") != null) groups = gr.optJSONArray("groups");
            JSONObject seen = Store.seenAll(app);
            JSONObject seenDm = new JSONObject(), seenGrp = new JSONObject();
            java.util.Iterator<String> it = seen.keys();
            long seenT = seen.optLong("t", 0);
            try {
                while (it.hasNext()) {
                    String k = it.next();
                    if (k.startsWith("d")) seenDm.put(k.substring(1), seen.optLong(k));
                    else if (k.startsWith("g")) seenGrp.put(k.substring(1), seen.optLong(k));
                }
            } catch (Exception ignored) { }
            JSONObject ur = Api.chat(app, Api.o("action", "unread", "seenGroup", seenT, "seenDm", seenDm, "seenGrp", seenGrp));
            if (ur.optBoolean("success")) unread = ur;
            JSONObject sr = Api.prof(app, "statusList");
            final boolean okS = sr.optBoolean("success");
            final JSONArray st = sr.optJSONArray("statuses");
            final JSONObject meO = sr.optJSONObject("me");
            Ui.MAIN.post(() -> {
                if (isFinishing()) return;
                if (okS && st != null) buildStories(st, meO);
                buildRows();
                if (tab == 1) renderMe();
            });
        }).start();
    }

    private void buildStories(JSONArray st, JSONObject me) {
        storyGroups.clear(); storyNames.clear(); myStories.clear();
        LinkedHashMap<Long, List<JSONObject>> m = new LinkedHashMap<>();
        long meId = Store.meId(this);
        for (int i = 0; i < st.length(); i++) {
            JSONObject s = st.optJSONObject(i);
            if (s == null) continue;
            long uid = s.optLong("userId");
            if (s.optBoolean("mine") || uid == meId) { myStories.add(s); continue; }
            List<JSONObject> l = m.get(uid);
            if (l == null) { l = new ArrayList<>(); m.put(uid, l); }
            l.add(s);
        }
        if (!myStories.isEmpty()) { storyGroups.add(new ArrayList<>(myStories)); }
        for (Map.Entry<Long, List<JSONObject>> e : m.entrySet()) storyGroups.add(e.getValue());
        renderStories();
    }

    private boolean allSeen(List<JSONObject> l) {
        Set<String> seen = seenStories();
        for (JSONObject s : l) if (!seen.contains(String.valueOf(s.optLong("id")))) return false;
        return true;
    }
    private Set<String> seenStories() {
        Set<String> out = new HashSet<>();
        try { JSONArray a = new JSONArray(Store.s(this, "storySeen")); for (int i = 0; i < a.length(); i++) out.add(a.optString(i)); } catch (Exception ignored) { }
        return out;
    }

    private void renderStories() {
        storyRow.removeAllViews();
        // "Your story" bubble
        String myPhoto = photoOf.get(Store.meId(this));
        storyRow.addView(storyItem("Your story", Store.meName(this), Store.meId(this), myPhoto, !myStories.isEmpty(), !myStories.isEmpty() && allSeen(myStories), myStories.isEmpty(), v -> {
            if (myStories.isEmpty()) composeStatus(); else openStories(0);
        }));
        int base = myStories.isEmpty() ? 0 : 1;
        for (int g = base; g < storyGroups.size(); g++) {
            final int gi = g;
            List<JSONObject> l = storyGroups.get(g);
            JSONObject f = l.get(0);
            String nm = f.optString("name", "Staff");
            long uid = f.optLong("userId");
            storyRow.addView(storyItem(firstName(nm), nm, uid, photoFor(uid), true, allSeen(l), false, v -> openStories(gi)));
        }
    }

    private String photoFor(long uid) {
        for (int i = 0; i < people.length(); i++) {
            JSONObject p = people.optJSONObject(i);
            if (p != null && p.optLong("id") == uid) return p.optString("avatar", "");
        }
        return "";
    }
    private static String firstName(String n) { String[] w = n.trim().split("\\s+"); return w.length > 0 ? w[0] : n; }

    private View storyItem(String label, String name, long id, String photo, boolean ring, boolean seen, boolean add, View.OnClickListener click) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER_HORIZONTAL);
        l.setPadding(Ui.dp(this, 6), 0, Ui.dp(this, 6), 0);
        AvatarView a = new AvatarView(this);
        if (photo == null || photo.length() == 0) photo = photoFor(id);
        a.set(name, id, photo);
        a.setRing(ring, seen);
        a.setAdd(add);
        l.addView(a, new LinearLayout.LayoutParams(Ui.dp(this, 62), Ui.dp(this, 62)));
        TextView t = Ui.tv(this, label, 11, Ui.INK, false);
        t.setSingleLine(true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(Ui.round(this, 0x99FFFFFF, 8));
        t.setPadding(Ui.dp(this, 5), Ui.dp(this, 1), Ui.dp(this, 5), Ui.dp(this, 1));
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(Ui.dp(this, 68), -2);
        tl.topMargin = Ui.dp(this, 3);
        l.addView(t, tl);
        l.setOnClickListener(click);
        return l;
    }

    private void openStories(int group) {
        StoryActivity.groups = new ArrayList<>(storyGroups);
        StoryActivity.start = group;
        startActivity(new Intent(this, StoryActivity.class));
    }

    private void buildRows() {
        all.clear();
        JSONObject dm = unread.optJSONObject("dm"), grp = unread.optJSONObject("grp");
        Row t = new Row();
        t.key = "t"; t.type = "t"; t.id = 0; t.title = "Lalabella Team"; t.sub = "Everyone in the team"; t.unread = unread.optInt("group", 0);
        all.add(t);
        for (int i = 0; i < groups.length(); i++) {
            JSONObject g = groups.optJSONObject(i);
            if (g == null) continue;
            Row r = new Row();
            r.type = "g"; r.id = g.optLong("id"); r.key = "g" + r.id; r.title = g.optString("name", "Group");
            JSONArray mem = g.optJSONArray("memberIds");
            r.sub = (mem == null ? 0 : mem.length()) + " members";
            r.unread = grp == null ? 0 : grp.optInt(String.valueOf(r.id), 0);
            all.add(r);
        }
        ArrayList<Row> ppl = new ArrayList<>();
        for (int i = 0; i < people.length(); i++) {
            JSONObject p = people.optJSONObject(i);
            if (p == null || p.optBoolean("me")) continue;
            Row r = new Row();
            r.type = "d"; r.id = p.optLong("id"); r.userId = r.id; r.key = "d" + r.id;
            r.title = p.optString("name", p.optString("username"));
            r.avatar = p.optString("avatar", "");
            r.online = p.optBoolean("online");
            String pos = p.optString("position", "");
            r.sub = r.online ? "Active now" : (p.optString("lastSeen").length() > 0 ? "Active " + Ui.ago(p.optString("lastSeen")) + " ago" : pos);
            r.unread = dm == null ? 0 : dm.optInt(String.valueOf(r.id), 0);
            ppl.add(r);
        }
        java.util.Collections.sort(ppl, (a, b) -> {
            if ((a.unread > 0) != (b.unread > 0)) return a.unread > 0 ? -1 : 1;
            if (a.online != b.online) return a.online ? -1 : 1;
            return a.title.compareToIgnoreCase(b.title);
        });
        all.addAll(ppl);
        applyFilter();
        renderStories();
    }

    private void applyFilter() {
        shown.clear();
        for (Row r : all) if (filter.length() == 0 || r.title.toLowerCase(Locale.getDefault()).contains(filter)) shown.add(r);
        adapter.notifyDataSetChanged();
    }

    private final class RowAdapter extends BaseAdapter {
        @Override public int getCount() { return shown.size(); }
        @Override public Object getItem(int i) { return shown.get(i); }
        @Override public long getItemId(int i) { return i; }
        @Override public View getView(int i, View cv, ViewGroup parent) {
            Row r = shown.get(i);
            LinearLayout l = new LinearLayout(MainActivity.this);
            l.setOrientation(LinearLayout.HORIZONTAL);
            l.setGravity(Gravity.CENTER_VERTICAL);
            int op = Store.bubbleOpacity(MainActivity.this);
            l.setBackground(Ui.round(MainActivity.this, Ui.alpha(0xFFFFFFFF, Math.min(op, 96)), 18));
            int pd = Ui.dp(MainActivity.this, 10);
            l.setPadding(pd, pd, pd + Ui.dp(MainActivity.this, 4), pd);
            AvatarView a = new AvatarView(MainActivity.this);
            if (r.type.equals("t")) a.set("LT", 3, ""); else a.set(r.title, r.id, r.avatar);
            a.setOnline(r.online);
            if (r.type.equals("d")) {
                boolean has = false;
                for (List<JSONObject> g : storyGroups) if (!g.isEmpty() && g.get(0).optLong("userId") == r.userId && !g.get(0).optBoolean("mine")) { has = true; a.setRing(true, allSeen(g)); }
                if (!has) a.setRing(false, false);
            }
            l.addView(a, new LinearLayout.LayoutParams(Ui.dp(MainActivity.this, 54), Ui.dp(MainActivity.this, 54)));
            LinearLayout mid = new LinearLayout(MainActivity.this);
            mid.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams ml = new LinearLayout.LayoutParams(0, -2, 1f);
            ml.leftMargin = Ui.dp(MainActivity.this, 12);
            TextView t = Ui.tv(MainActivity.this, r.title, 16, Ui.INK, r.unread > 0);
            t.setSingleLine(true);
            TextView s = Ui.tv(MainActivity.this, r.unread > 0 ? r.unread + " new message" + (r.unread > 1 ? "s" : "") : r.sub, 13, r.unread > 0 ? Ui.ACC : Ui.MUTED, r.unread > 0);
            s.setSingleLine(true);
            mid.addView(t); mid.addView(s);
            l.addView(mid, ml);
            if (r.unread > 0) l.addView(Ui.badge(MainActivity.this, r.unread));
            FrameLayout wrap = new FrameLayout(MainActivity.this);
            wrap.setPadding(0, Ui.dp(MainActivity.this, 3), 0, Ui.dp(MainActivity.this, 3));
            wrap.addView(l, new FrameLayout.LayoutParams(-1, -2));
            wrap.setLayoutParams(new android.widget.AbsListView.LayoutParams(-1, -2));
            return wrap;
        }
    }

    // ------------------------------------------------------------ Me tab
    private void buildMeTab() {
        meScroll = new ScrollView(this);
        meScroll.setFillViewport(true);
        meBox = new LinearLayout(this);
        meBox.setOrientation(LinearLayout.VERTICAL);
        meScroll.addView(meBox, new ViewGroup.LayoutParams(-1, -2));
    }

    private void loadProfile() {
        final android.content.Context app = getApplicationContext();
        final long me = Store.meId(this);
        if (me == 0) return;
        new Thread(() -> {
            JSONObject r = Api.prof(app, "profileView", "id", String.valueOf(me));
            if (r.optBoolean("success")) {
                myProfile = r.optJSONObject("profile");
                Ui.MAIN.post(() -> { if (tab == 1) renderMe(); });
            }
        }).start();
    }

    private void renderMe() {
        meBox.removeAllViews();
        int p = Ui.dp(this, 16);
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setBackground(Ui.round(this, 0xEEFFFFFF, 22));
        card.setPadding(p, p * 2, p, p);
        String name = myProfile != null ? myProfile.optString("name", Store.meName(this)) : Store.meName(this);
        String photo = myProfile != null ? myProfile.optString("photo", "") : "";
        if (photo.length() > 0) photoOf.put(Store.meId(this), photo);
        AvatarView av = new AvatarView(this);
        av.set(name, Store.meId(this), photo);
        av.setRing(!myStories.isEmpty(), !myStories.isEmpty() && allSeen(myStories));
        av.setOnClickListener(v -> { if (!myStories.isEmpty()) openStories(0); });
        card.addView(av, new LinearLayout.LayoutParams(Ui.dp(this, 104), Ui.dp(this, 104)));
        TextView nm = Ui.tv(this, name, 22, Ui.INK, true);
        nm.setPadding(0, Ui.dp(this, 12), 0, 0);
        card.addView(nm);
        String sub = "";
        if (myProfile != null) {
            sub = myProfile.optString("position", "");
            String br = myProfile.optString("branch", "");
            if (br.length() > 0) sub = sub.length() > 0 ? sub + " · " + br : br;
        }
        if (sub.length() > 0) card.addView(Ui.tv(this, sub, 14, Ui.MUTED, false));

        TextView add = pill("＋  Add status", Ui.ACC, Color.WHITE);
        add.setOnClickListener(v -> composeStatus());
        LinearLayout.LayoutParams al = new LinearLayout.LayoutParams(-1, -2);
        al.topMargin = Ui.dp(this, 16);
        card.addView(add, al);
        LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(-1, -2);
        cl.setMargins(p, p, p, 0);
        meBox.addView(card, cl);

        // my active statuses
        if (!myStories.isEmpty()) {
            meBox.addView(section("My status (24 hours)"));
            for (final JSONObject s : myStories) {
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(Gravity.CENTER_VERTICAL);
                row.setBackground(Ui.round(this, 0xEEFFFFFF, 16));
                row.setPadding(p, Ui.dp(this, 10), p, Ui.dp(this, 10));
                String txt = s.optString("text", "");
                if (txt.length() == 0) txt = s.optBoolean("hasImage") ? (s.optString("kind").equals("video") ? "🎬 Video" : "📷 Photo") : "Status";
                TextView t = Ui.tv(this, txt + "  ·  " + Ui.ago(s.optString("createdAt")), 14, Ui.INK, false);
                t.setMaxLines(2);
                row.addView(t, new LinearLayout.LayoutParams(0, -2, 1f));
                TextView del = Ui.tv(this, "Delete", 13, 0xFFE5484D, true);
                del.setPadding(Ui.dp(this, 10), Ui.dp(this, 4), 0, Ui.dp(this, 4));
                del.setOnClickListener(v -> new AlertDialog.Builder(this).setMessage("Delete this status?").setNegativeButton("Cancel", null)
                        .setPositiveButton("Delete", (d, w) -> deleteStatus(s.optLong("id"))).show());
                row.addView(del);
                LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-1, -2);
                rl.setMargins(p, Ui.dp(this, 6), p, 0);
                meBox.addView(row, rl);
            }
        }

        meBox.addView(section("Settings"));
        meBox.addView(menuRow("🎨", "Wallpaper & transparency", v -> startActivity(new Intent(this, SettingsActivity.class))));
        meBox.addView(menuRow("🔔", "Notifications & chat head", v -> startActivity(new Intent(this, SettingsActivity.class))));
        meBox.addView(menuRow("⎋", "Log out", v -> new AlertDialog.Builder(this).setMessage("Log out of Lalabella Messenger?")
                .setNegativeButton("Cancel", null).setPositiveButton("Log out", (d, w) -> logout()).show()));
        TextView ver = Ui.tv(this, "Lalabella Messenger " + versionName(), 12, Ui.MUTED, false);
        ver.setGravity(Gravity.CENTER);
        ver.setPadding(0, Ui.dp(this, 18), 0, Ui.dp(this, 24));
        meBox.addView(ver, new LinearLayout.LayoutParams(-1, -2));
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    private TextView section(String s) {
        TextView t = Ui.tv(this, s, 13, Ui.INK, true);
        t.setBackground(Ui.round(this, 0x99FFFFFF, 10));
        t.setPadding(Ui.dp(this, 10), Ui.dp(this, 3), Ui.dp(this, 10), Ui.dp(this, 3));
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(-2, -2);
        l.setMargins(Ui.dp(this, 20), Ui.dp(this, 18), 0, 0);
        t.setLayoutParams(l);
        return t;
    }

    private TextView pill(String text, int bg, int fg) {
        TextView t = Ui.tv(this, text, 16, fg, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(Ui.round(this, bg, 24));
        t.setPadding(0, Ui.dp(this, 12), 0, Ui.dp(this, 12));
        return t;
    }

    private View menuRow(String emoji, String label, View.OnClickListener click) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackground(Ui.round(this, 0xEEFFFFFF, 16));
        int p = Ui.dp(this, 16);
        row.setPadding(p, Ui.dp(this, 14), p, Ui.dp(this, 14));
        row.addView(Ui.tv(this, emoji, 20, Color.BLACK, false));
        TextView t = Ui.tv(this, label, 16, Ui.INK, false);
        t.setPadding(Ui.dp(this, 14), 0, 0, 0);
        row.addView(t);
        row.setOnClickListener(click);
        LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-1, -2);
        rl.setMargins(p, Ui.dp(this, 6), p, 0);
        row.setLayoutParams(rl);
        return row;
    }

    private void logout() {
        WatchService.stop(this);
        Bubble.hide(this);
        Api.logout(this);
        MsgWidget.refresh(this);
        startActivity(new Intent(this, LoginActivity.class));
        finish();
    }

    // ------------------------------------------------------------ status
    private void composeStatus() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 18);
        box.setPadding(p, p, p, 0);
        final EditText et = new EditText(this);
        et.setHint("What's on your mind?");
        et.setMinLines(3);
        et.setGravity(Gravity.TOP);
        et.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        et.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(300) });
        box.addView(et);
        final String[] pick = { BG[0] };
        final LinearLayout colors = new LinearLayout(this);
        colors.setOrientation(LinearLayout.HORIZONTAL);
        colors.setPadding(0, Ui.dp(this, 12), 0, 0);
        final View[] dots = new View[BG.length];
        for (int i = 0; i < BG.length; i++) {
            final int idx = i;
            View d = new View(this);
            d.setBackground(Ui.round(this, Color.parseColor(BG[i]), 20));
            LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(Ui.dp(this, 30), Ui.dp(this, 30));
            dl.rightMargin = Ui.dp(this, 10);
            d.setOnClickListener(v -> { pick[0] = BG[idx]; for (int k = 0; k < dots.length; k++) dots[k].setAlpha(k == idx ? 1f : 0.45f); });
            d.setAlpha(i == 0 ? 1f : 0.45f);
            dots[i] = d;
            colors.addView(d, dl);
        }
        box.addView(colors);
        new AlertDialog.Builder(this).setTitle("New status (24 hours)").setView(box)
                .setPositiveButton("Post", (d, w) -> postStatus(et.getText().toString().trim(), pick[0], null))
                .setNeutralButton("Photo…", (d, w) -> {
                    pendingText = et.getText().toString().trim(); pendingBg = pick[0];
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.setType("image/*");
                    startActivityForResult(Intent.createChooser(i, "Choose a photo"), REQ_PHOTO);
                })
                .setNegativeButton("Cancel", null).show();
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_PHOTO && res == RESULT_OK && data != null && data.getData() != null) {
            final Uri u = data.getData();
            Ui.toast(this, "Posting…");
            new Thread(() -> {
                Bitmap bm = readBitmap(u, 1000);
                if (bm == null) { Ui.MAIN.post(() -> Ui.toast(this, "Could not read that picture.")); return; }
                postStatus(pendingText, pendingBg, bm);
            }).start();
        }
    }

    private Bitmap readBitmap(Uri u, int max) {
        try {
            InputStream is = getContentResolver().openInputStream(u);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = is.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 25 * 1024 * 1024) break; }
            is.close();
            return Ui.decode(bo.toByteArray(), max);
        } catch (Throwable t) { return null; }
    }

    static String jpegData(Bitmap src, int maxDim, int maxChars) {
        int dim = maxDim;
        for (int round = 0; round < 6; round++) {
            Bitmap b = Ui.scaleDown(src, dim);
            for (int q = 80; q >= 35; q -= 15) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.JPEG, q, bo);
                String s = "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                if (s.length() <= maxChars) return s;
            }
            dim = Math.round(dim * 0.75f);
        }
        return null;
    }

    private void postStatus(final String text, final String bg, final Bitmap pic) {
        if (text.length() == 0 && pic == null) { Ui.toast(this, "Write something or add a photo."); return; }
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            JSONObject body = Api.o("action", "statusAdd", "text", text, "bg", bg);
            if (pic != null) {
                String img = jpegData(pic, 900, 210000), th = jpegData(pic, 120, 22000);
                if (img == null) { Ui.MAIN.post(() -> Ui.toast(this, "That picture is too big.")); return; }
                try { body.put("image", img); if (th != null) body.put("thumb", th); } catch (Exception ignored) { }
            }
            final JSONObject r = Api.profPost(app, body);
            Ui.MAIN.post(() -> {
                if (r.optBoolean("success")) { Ui.toast(this, "Status posted"); refresh(); }
                else Ui.toast(this, r.optString("error", "Could not post."));
            });
        }).start();
    }

    private void deleteStatus(final long id) {
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            Api.profPost(app, Api.o("action", "statusDelete", "id", id));
            Ui.MAIN.post(this::refresh);
        }).start();
    }
}
