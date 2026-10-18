package com.mysystemlla.messenger;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaRecorder;
import java.io.File;
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
    private static final int REQ_PHOTO = 11, REQ_NOTIF = 12, REQ_SOUND = 13, REQ_MIC = 14;
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
        UpdateChecker.check(this, false, this::showUpdate);
        showUpdate();
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
    private TextView updBar;
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

        updBar = Ui.tv(this, "", 14, Color.WHITE, true);
        updBar.setGravity(Gravity.CENTER);
        updBar.setBackground(Ui.round(this, 0xFFC9506B, 14));
        updBar.setPadding(Ui.dp(this, 12), Ui.dp(this, 10), Ui.dp(this, 12), Ui.dp(this, 10));
        updBar.setVisibility(View.GONE);
        updBar.setOnClickListener(v -> UpdateChecker.openDownload(this));
        LinearLayout.LayoutParams ul = new LinearLayout.LayoutParams(-1, -2);
        ul.setMargins(Ui.dp(this, 12), Ui.dp(this, 8), Ui.dp(this, 12), 0);
        chatsView.addView(updBar, ul);

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

    private void showUpdate() {
        if (updBar == null) return;
        if (UpdateChecker.newer(this)) {
            updBar.setText("⬇  New version " + Store.s(this, "latestName") + " is ready — tap to update");
            updBar.setVisibility(View.VISIBLE);
        } else updBar.setVisibility(View.GONE);
        if (tab == 1) renderMe();
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
                if (Store.b(app, "needLogin", false)) { sessionEnded(); return; }
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
        if (!Store.visitor(this)) {
            Row t = new Row();
            t.key = "t"; t.type = "t"; t.id = 0; t.title = "Lalabella Team"; t.sub = "Everyone in the team"; t.unread = unread.optInt("group", 0);
            all.add(t);
        }
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

        if (Store.visitor(this)) {
            TextView vn = Ui.tv(this, "Visitor account — you can chat with the admin and see what the admin shares.", 13, Ui.MUTED, false);
            vn.setGravity(Gravity.CENTER);
            vn.setPadding(0, Ui.dp(this, 12), 0, 0);
            card.addView(vn);
        } else {
            TextView add = pill("＋  Add status", Ui.ACC, Color.WHITE);
            add.setOnClickListener(v -> composeStatus());
            LinearLayout.LayoutParams al = new LinearLayout.LayoutParams(-1, -2);
            al.topMargin = Ui.dp(this, 16);
            card.addView(add, al);
        }
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
        meBox.addView(menuRow("⬇", "Check for updates", v -> {
            Ui.toast(this, "Checking…");
            UpdateChecker.check(this, true, () -> {
                if (UpdateChecker.newer(this)) UpdateChecker.openDownload(this); else Ui.toast(this, "You have the latest version.");
                showUpdate();
            });
        }));
        meBox.addView(menuRow("⎋", "Log out", v -> new AlertDialog.Builder(this).setMessage("Log out of Lalabella Messenger?")
                .setNegativeButton("Cancel", null).setPositiveButton("Log out", (d, w) -> logout()).show()));
        String vs = "Lalabella Messenger " + versionName();
        if (UpdateChecker.newer(this)) vs += "  ·  update " + Store.s(this, "latestName") + " available";
        else if (Store.i(this, "latestCode", 0) > 0) vs += "  ·  up to date";
        TextView ver = Ui.tv(this, vs, 12, Ui.MUTED, false);
        if (UpdateChecker.newer(this)) { ver.setTextColor(0xFFC9506B); ver.setOnClickListener(v -> UpdateChecker.openDownload(this)); }
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

    /** 24-hour session ended and "Remember me" was off: ask for the password again. */
    private void sessionEnded() {
        WatchService.stop(this);
        Bubble.hide(this);
        Api.logout(this);
        MsgWidget.refresh(this);
        Ui.toast(this, "Please log in again.");
        startActivity(new Intent(this, LoginActivity.class));
        finish();
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
    // sound attached to the status being written
    private File soundFile;
    private String soundMime = "audio/mp4";
    private int soundSec;
    private MediaRecorder soundRec;
    private long soundStart;
    private AlertDialog recDialog;
    private TextView recLabel;
    private final Runnable soundTick = new Runnable() {
        @Override public void run() {
            if (soundRec == null) return;
            long ms = System.currentTimeMillis() - soundStart;
            if (recLabel != null) recLabel.setText("●  Recording…  " + (ms / 1000) + "s  (max 30s)");
            if (ms >= 30000) { stopSound(true); return; }
            Ui.MAIN.postDelayed(this, 250);
        }
    };

    private void composeStatus() { composeStatus(pendingText, pendingBg); }

    private void composeStatus(String presetText, String presetBg) {
        if (Store.visitor(this)) { Ui.toast(this, "Visitor accounts can look around but cannot post."); return; }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 18);
        box.setPadding(p, p, p, 0);
        final EditText et = new EditText(this);
        et.setHint("What's on your mind?");
        et.setMinLines(3);
        et.setGravity(Gravity.TOP);
        et.setText(presetText == null ? "" : presetText);
        et.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        et.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(300) });
        box.addView(et);
        int startIdx = 0;
        for (int i = 0; i < BG.length; i++) if (BG[i].equalsIgnoreCase(presetBg)) startIdx = i;
        final String[] pick = { BG[startIdx] };
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
            d.setAlpha(i == startIdx ? 1f : 0.45f);
            dots[i] = d;
            colors.addView(d, dl);
        }
        box.addView(colors);

        // ---- sound
        TextView sh = Ui.tv(this, "Sound (optional, plays while the status is open)", 12, Ui.MUTED, true);
        sh.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 4));
        box.addView(sh);
        LinearLayout srow = new LinearLayout(this);
        srow.setGravity(Gravity.CENTER_VERTICAL);
        if (soundFile != null && soundFile.exists()) {
            TextView ok = Ui.tv(this, "🎵  Sound ready" + (soundSec > 0 ? " (" + soundSec + "s)" : ""), 14, Ui.ACC, true);
            srow.addView(ok);
            TextView rm = Ui.tv(this, "  ✕ Remove", 13, 0xFFE5484D, true);
            rm.setPadding(Ui.dp(this, 8), Ui.dp(this, 6), Ui.dp(this, 8), Ui.dp(this, 6));
            srow.addView(rm);
            final AlertDialog[] self = new AlertDialog[1];
            rm.setOnClickListener(v -> { soundFile.delete(); soundFile = null; soundSec = 0; if (self[0] != null) self[0].dismiss(); composeStatus(et.getText().toString(), pick[0]); });
            final AlertDialog dlg = buildCompose(box, et, pick);
            self[0] = dlg;
            box.addView(srow);
            dlg.show();
            return;
        }
        final TextView recB = soundChip("🎤  Record");
        final TextView fileB = soundChip("📁  Pick a file");
        srow.addView(recB); srow.addView(fileB);
        box.addView(srow);
        final AlertDialog dlg = buildCompose(box, et, pick);
        recB.setOnClickListener(v -> { pendingText = et.getText().toString(); pendingBg = pick[0]; dlg.dismiss(); startSoundRecord(); });
        fileB.setOnClickListener(v -> {
            pendingText = et.getText().toString(); pendingBg = pick[0]; dlg.dismiss();
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "audio/*", "video/mp4" });
            startActivityForResult(Intent.createChooser(i, "Choose a song or video"), REQ_SOUND);
        });
        dlg.show();
    }

    private TextView soundChip(String t) {
        TextView c = Ui.tv(this, t, 14, Ui.ACC, true);
        c.setBackground(Ui.round(this, 0xFFE3EFF1, 20));
        c.setPadding(Ui.dp(this, 14), Ui.dp(this, 8), Ui.dp(this, 14), Ui.dp(this, 8));
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(-2, -2);
        l.rightMargin = Ui.dp(this, 8);
        c.setLayoutParams(l);
        return c;
    }

    private AlertDialog buildCompose(LinearLayout box, final EditText et, final String[] pick) {
        return new AlertDialog.Builder(this).setTitle("New status (24 hours)").setView(box)
                .setPositiveButton("Post", (d, w) -> postStatus(et.getText().toString().trim(), pick[0], null))
                .setNeutralButton("Photo…", (d, w) -> {
                    pendingText = et.getText().toString().trim(); pendingBg = pick[0];
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.setType("image/*");
                    startActivityForResult(Intent.createChooser(i, "Choose a photo"), REQ_PHOTO);
                })
                .setNegativeButton("Cancel", (d, w) -> { if (soundFile != null) { soundFile.delete(); soundFile = null; } pendingText = ""; })
                .create();
    }

    private void startSoundRecord() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQ_MIC);
            return;
        }
        try {
            File f = new File(getCacheDir(), "status-sound.m4a");
            MediaRecorder r = new MediaRecorder();
            r.setAudioSource(MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            r.setAudioEncodingBitRate(48000);
            r.setAudioSamplingRate(44100);
            r.setOutputFile(f.getAbsolutePath());
            r.prepare();
            r.start();
            soundRec = r;
            soundFile = f;
            soundMime = "audio/mp4";
            soundStart = System.currentTimeMillis();
            recLabel = Ui.tv(this, "●  Recording…", 16, 0xFFE5484D, true);
            recLabel.setPadding(Ui.dp(this, 22), Ui.dp(this, 10), Ui.dp(this, 22), Ui.dp(this, 4));
            recDialog = new AlertDialog.Builder(this).setTitle("Record a sound").setView(recLabel).setCancelable(false)
                    .setPositiveButton("Done", (d, w) -> stopSound(true))
                    .setNegativeButton("Cancel", (d, w) -> stopSound(false)).create();
            recDialog.show();
            Ui.MAIN.post(soundTick);
        } catch (Throwable t) {
            try { if (soundRec != null) soundRec.release(); } catch (Throwable ignored) { }
            soundRec = null;
            Ui.toast(this, "Could not start the microphone.");
            composeStatus();
        }
    }

    private void stopSound(boolean keep) {
        Ui.MAIN.removeCallbacks(soundTick);
        MediaRecorder r = soundRec;
        soundRec = null;
        long ms = System.currentTimeMillis() - soundStart;
        boolean ok = true;
        if (r != null) {
            try { r.stop(); } catch (Throwable t) { ok = false; }
            try { r.release(); } catch (Throwable ignored) { }
        }
        try { if (recDialog != null) recDialog.dismiss(); } catch (Throwable ignored) { }
        recDialog = null;
        if (!keep || !ok || ms < 800) {
            if (soundFile != null) soundFile.delete();
            soundFile = null; soundSec = 0;
            if (keep) Ui.toast(this, "Too short — try again.");
        } else {
            soundSec = (int) Math.min(30, ms / 1000);
        }
        composeStatus();
    }

    /** The picked song/video is copied to our cache, then the person chooses which part (max 30 s) to keep. */
    private void takeSoundFile(final Uri u) {
        Ui.toast(this, "Loading…");
        new Thread(() -> {
            final File src = new File(getCacheDir(), "status-src.bin");
            final boolean okCopy = SoundTrim.copy(this, u, src, 40L * 1024 * 1024);
            final long dur = okCopy ? SoundTrim.durationMs(src) : 0;
            Ui.MAIN.post(() -> {
                if (!okCopy) { Ui.toast(this, "That file is too big (max 40 MB)."); composeStatus(); return; }
                if (dur < 1000) { Ui.toast(this, "Could not read that sound. Use an MP3, M4A or MP4."); src.delete(); composeStatus(); return; }
                showTrimmer(src, dur);
            });
        }).start();
    }

    private void showTrimmer(final File src, final long dur) {
        final long maxLen = 30000;
        final long[] start = { 0 }, len = { Math.min(maxLen, dur) };
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 20);
        box.setPadding(p, p, p, 0);
        final TextView range = Ui.tv(this, "", 16, Ui.INK, true);
        box.addView(range);
        TextView hint = Ui.tv(this, "Slide to choose where the sound starts. Up to 30 seconds.", 12, Ui.MUTED, false);
        hint.setPadding(0, Ui.dp(this, 2), 0, Ui.dp(this, 10));
        box.addView(hint);
        final android.widget.SeekBar sb = new android.widget.SeekBar(this);
        sb.setMax((int) Math.max(1, (dur - 1000) / 1000));
        box.addView(sb);
        LinearLayout lens = new LinearLayout(this);
        lens.setPadding(0, Ui.dp(this, 10), 0, 0);
        final TextView[] chips = new TextView[3];
        final long[] opts = { 10000, 20000, 30000 };
        final Runnable[] upd = new Runnable[1];
        for (int k = 0; k < 3; k++) {
            final int idx = k;
            TextView c = soundChip((opts[k] / 1000) + " s");
            c.setOnClickListener(v -> { len[0] = Math.min(opts[idx], dur); upd[0].run(); });
            chips[k] = c;
            lens.addView(c);
        }
        box.addView(lens);
        final TextView play = soundChip("▶  Preview");
        LinearLayout.LayoutParams pl = (LinearLayout.LayoutParams) play.getLayoutParams();
        pl.topMargin = Ui.dp(this, 10);
        box.addView(play);
        final android.media.MediaPlayer[] mp = { null };
        final Runnable stopPrev = () -> {
            Ui.MAIN.removeCallbacksAndMessages("prev");
            try { if (mp[0] != null) mp[0].release(); } catch (Throwable ignored) { }
            mp[0] = null;
            play.setText("▶  Preview");
        };
        upd[0] = () -> {
            long s = start[0], l = Math.min(len[0], dur - s);
            range.setText(fmt(s) + "  →  " + fmt(s + l) + "   (" + (l / 1000) + " s)");
            for (int k = 0; k < 3; k++) {
                boolean on = Math.min(opts[k], dur) == len[0];
                chips[k].setTextColor(on ? Color.WHITE : Ui.ACC);
                chips[k].setBackground(Ui.round(this, on ? Ui.ACC : 0xFFE3EFF1, 20));
            }
        };
        sb.setOnSeekBarChangeListener(new android.widget.SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(android.widget.SeekBar s, int pr, boolean user) { start[0] = pr * 1000L; upd[0].run(); }
            @Override public void onStartTrackingTouch(android.widget.SeekBar s) { stopPrev.run(); }
            @Override public void onStopTrackingTouch(android.widget.SeekBar s) { }
        });
        play.setOnClickListener(v -> {
            if (mp[0] != null) { stopPrev.run(); return; }
            try {
                final android.media.MediaPlayer m = new android.media.MediaPlayer();
                m.setDataSource(src.getAbsolutePath());
                m.prepare();
                m.seekTo((int) start[0]);
                m.start();
                mp[0] = m;
                play.setText("⏹  Stop");
                final long l = Math.min(len[0], dur - start[0]);
                Ui.MAIN.postAtTime(() -> { if (mp[0] == m) stopPrev.run(); }, "prev", android.os.SystemClock.uptimeMillis() + l);
            } catch (Throwable t) { stopPrev.run(); Ui.toast(this, "Cannot play this file."); }
        });
        upd[0].run();
        new AlertDialog.Builder(this).setTitle("Choose the part").setView(box).setCancelable(false)
                .setPositiveButton("Use this part", (d, w) -> {
                    stopPrev.run();
                    final long s = start[0], l = Math.min(len[0], dur - s);
                    Ui.toast(this, "Cutting…");
                    new Thread(() -> {
                        File out = new File(getCacheDir(), "status-sound.cut");
                        String mime = SoundTrim.trim(src, s, l, dur, out);
                        src.delete();
                        Ui.MAIN.post(() -> {
                            if (mime == null || out.length() > 1900 * 1024) {
                                Ui.toast(this, mime == null ? "Could not cut this file. Try an MP3 or M4A." : "That part is too big. Pick a shorter part.");
                                out.delete();
                            } else { soundFile = out; soundMime = mime; soundSec = (int) (l / 1000); }
                            composeStatus();
                        });
                    }).start();
                })
                .setNegativeButton("Cancel", (d, w) -> { stopPrev.run(); src.delete(); composeStatus(); }).show();
    }

    private static String fmt(long ms) { long s = ms / 1000; return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req == REQ_MIC) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startSoundRecord();
            else { Ui.toast(this, "Allow the microphone to record a sound."); composeStatus(); }
        }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_SOUND) {
            if (res == RESULT_OK && data != null && data.getData() != null) takeSoundFile(data.getData()); else composeStatus();
            return;
        }
        if (req == REQ_PHOTO && res != RESULT_OK) { composeStatus(); return; }
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
            byte[] raw = bo.toByteArray();
            return Ui.upright(raw, Ui.decode(raw, max));
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
        final File snd = (soundFile != null && soundFile.exists()) ? soundFile : null;
        if (text.length() == 0 && pic == null && snd == null) { Ui.toast(this, "Write something or add a photo."); return; }
        final String sMime = soundMime;
        final android.content.Context app = getApplicationContext();
        if (snd != null) Ui.toast(this, "Posting…");
        new Thread(() -> {
            JSONObject body = Api.o("action", "statusAdd", "text", text, "bg", bg);
            if (pic != null) {
                String img = jpegData(pic, 900, 210000), th = jpegData(pic, 120, 22000);
                if (img == null) { Ui.MAIN.post(() -> Ui.toast(this, "That picture is too big.")); return; }
                try { body.put("image", img); if (th != null) body.put("thumb", th); } catch (Exception ignored) { }
            }
            String soundUrl = "";
            if (snd != null) {
                try {
                    java.io.FileInputStream is = new java.io.FileInputStream(snd);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192]; int n;
                    while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                    is.close();
                    JSONObject up = Api.profUpload(app, "statusSoundUp", sMime, bo.toByteArray());
                    if (!up.optBoolean("success")) { final String er = up.optString("error", "Could not upload the sound."); Ui.MAIN.post(() -> Ui.toast(this, er)); return; }
                    soundUrl = up.optString("url");
                    body.put("audio", soundUrl);
                } catch (Throwable t) { Ui.MAIN.post(() -> Ui.toast(this, "Could not read the sound.")); return; }
            }
            final JSONObject r = Api.profPost(app, body);
            if (!r.optBoolean("success") && soundUrl.length() > 0) Api.profPost(app, Api.o("action", "statusSoundDiscard", "audio", soundUrl));
            Ui.MAIN.post(() -> {
                if (r.optBoolean("success")) {
                    Ui.toast(this, "Status posted");
                    if (soundFile != null) { soundFile.delete(); soundFile = null; soundSec = 0; }
                    pendingText = "";
                    refresh();
                } else Ui.toast(this, r.optString("error", "Could not post."));
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
