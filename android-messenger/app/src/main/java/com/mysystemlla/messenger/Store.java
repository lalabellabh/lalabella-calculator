package com.mysystemlla.messenger;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/** Small helper around SharedPreferences (everything the app remembers lives here). */
final class Store {
    private Store() { }

    static SharedPreferences sp(Context c) { return c.getApplicationContext().getSharedPreferences("lbm", Context.MODE_PRIVATE); }

    static String s(Context c, String k) { return sp(c).getString(k, ""); }
    static void put(Context c, String k, String v) { sp(c).edit().putString(k, v).apply(); }
    static int i(Context c, String k, int d) { return sp(c).getInt(k, d); }
    static void put(Context c, String k, int v) { sp(c).edit().putInt(k, v).apply(); }
    static boolean b(Context c, String k, boolean d) { return sp(c).getBoolean(k, d); }
    /** Visitor accounts can only chat with the admin and look at the admin's posts. */
    static boolean visitor(Context c) { return sp(c).getBoolean("visitor", false); }
    static void put(Context c, String k, boolean v) { sp(c).edit().putBoolean(k, v).apply(); }

    static String token(Context c) { return s(c, "token"); }
    static boolean loggedIn(Context c) { return token(c).length() > 0; }
    static long meId(Context c) { return sp(c).getLong("meId", 0); }
    static String meName(Context c) { return s(c, "meName"); }

    // ---- per-conversation "seen" ids (key: t = team, d<id> = person, g<id> = group) ----
    static long seen(Context c, String key) {
        try { return new JSONObject(s(c, "seen")).optLong(key, 0); } catch (Exception e) { return 0; }
    }
    static void setSeen(Context c, String key, long id) {
        try {
            JSONObject o = s(c, "seen").length() > 0 ? new JSONObject(s(c, "seen")) : new JSONObject();
            if (id > o.optLong(key, 0)) { o.put(key, id); put(c, "seen", o.toString()); }
        } catch (Exception ignored) { }
    }
    static JSONObject seenAll(Context c) {
        try { return new JSONObject(s(c, "seen")); } catch (Exception e) { return new JSONObject(); }
    }

    // ---- appearance ----
    static int wpMode(Context c) { return i(c, "wpMode", 1); }          // 0 none, 1 gradient, 2 photo
    static int wpGrad(Context c) { return i(c, "wpGrad", 0); }
    static int wpDim(Context c) { return i(c, "wpDim", 0); }            // 0..70 (%)
    static int bubbleOpacity(Context c) { return i(c, "bubbleOp", 100); }   // 30..100 (%)
    static int widgetOpacity(Context c) { return i(c, "widgetOp", 85); }    // 30..100 (%)
    static int textSize(Context c) { int t = i(c, "textSize", 1); return t == 0 ? 14 : t == 2 ? 19 : 16; }
    static int headOpacity(Context c) { return i(c, "headOp", 100); }       // 30..100 (%)
}
