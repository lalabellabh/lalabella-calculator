package com.mysystemlla.messenger;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Talks to the same Supabase Edge Functions the website uses (auth-fast, chat, profile-fast). Call from background threads only. */
final class Api {
    static final String BASE = "https://zoratiahjeldgsognfsj.supabase.co/functions/v1/";
    static final String KEY = "sb_publishable_nGSHoJFQvFB1_DarkVr4rQ_3E-d_R42";

    private Api() { }

    static JSONObject o(Object... kv) {
        JSONObject j = new JSONObject();
        try { for (int n = 0; n + 1 < kv.length; n += 2) j.put(String.valueOf(kv[n]), kv[n + 1]); } catch (Exception ignored) { }
        return j;
    }

    private static JSONObject fail(String msg, boolean net) {
        JSONObject j = new JSONObject();
        try { j.put("success", false); j.put("error", msg); if (net) j.put("net", true); } catch (Exception ignored) { }
        return j;
    }

    static JSONObject http(String method, String url, String body) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(url).openConnection();
            h.setRequestMethod(method);
            h.setConnectTimeout(12000);
            h.setReadTimeout(30000);
            h.setUseCaches(false);
            h.setRequestProperty("apikey", KEY);
            if (body != null) {
                h.setDoOutput(true);
                h.setRequestProperty("Content-Type", "application/json");
                byte[] b = body.getBytes(StandardCharsets.UTF_8);
                h.setFixedLengthStreamingMode(b.length);
                try (OutputStream os = h.getOutputStream()) { os.write(b); }
            }
            int code = h.getResponseCode();
            InputStream is = code >= 400 ? h.getErrorStream() : h.getInputStream();
            String text = "";
            if (is != null) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                is.close();
                text = new String(bo.toByteArray(), StandardCharsets.UTF_8);
            }
            JSONObject j;
            try { j = new JSONObject(text); } catch (Exception e) { j = fail("Server error. Try again.", false); }
            if (code == 401) { try { j.put("auth", true); } catch (Exception ignored) { } }
            return j;
        } catch (Exception e) {
            return fail("No internet. Try again.", true);
        } finally {
            if (h != null) h.disconnect();
        }
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return ""; }
    }

    /** Visitor sign-up (inside the app). The admin must approve the account in User Management before it can log in. */
    static JSONObject signup(String fullName, String user, String pass) {
        return http("POST", BASE + "visitor-fast", o("action", "signup", "fullName", fullName, "username", user, "password", pass).toString());
    }

    /** Logs in with the same staff account as the website, or with an approved Visitor account. Saves the session on success. */
    static synchronized JSONObject login(Context c, String user, String pass) {
        JSONObject v = http("GET", BASE + "visitor-fast?action=login&username=" + enc(user) + "&password=" + enc(pass), null);
        boolean visitor = false;
        JSONObject r;
        if (v.optBoolean("success") && v.optString("token").length() > 0) { r = v; visitor = true; }
        else if (v.optBoolean("net") || !v.optBoolean("notVisitor")) return v;   // no internet, pending approval, wrong visitor password...
        else r = http("GET", BASE + "auth-fast?action=login&username=" + enc(user) + "&password=" + enc(pass), null);
        if (r.optBoolean("success") && r.optString("token").length() > 0) {
            JSONObject u = r.optJSONObject("user");
            String name = user;
            if (u != null) {
                String[] keys = { "fullName", "full_name", "name" };
                for (String k : keys) { if (u.optString(k).length() > 0) { name = u.optString(k); break; } }
            }
            // "Remember me" decides whether the password is kept so the 24-hour session can renew itself quietly
            Store.sp(c).edit().putString("token", r.optString("token")).putString("user", user).putString("pass", Store.b(c, "remember", true) ? pass : "").putString("meName", name).putBoolean("needLogin", false).putBoolean("visitor", visitor).apply();
        }
        return r;
    }

    private static boolean expired(JSONObject r) {
        if (r.optBoolean("auth")) return true;
        if (r.optBoolean("success")) return false;
        String e = r.optString("error").toLowerCase();
        return e.contains("log in again") || e.contains("session expired");
    }

    /** The 24-hour staff session ran out: sign in again quietly with the saved login. */
    private static boolean relogin(Context c, String oldToken) {
        synchronized (Api.class) {
            if (!Store.token(c).equals(oldToken)) return Store.token(c).length() > 0;   // someone else already refreshed it
            String u = Store.s(c, "user"), p = Store.s(c, "pass");
            if (u.length() == 0 || p.length() == 0) { Store.put(c, "needLogin", true); return false; }
            JSONObject r = login(c, u, p);
            return r.optBoolean("success");
        }
    }

    /** chat function: POST {action, token, ...}. */
    static JSONObject chat(Context c, JSONObject body) {
        for (int tries = 0; tries < 2; tries++) {
            String tk = Store.token(c);
            try { body.put("token", tk); } catch (Exception ignored) { }
            JSONObject r = http("POST", BASE + "chat", body.toString());
            if (tries == 0 && expired(r) && relogin(c, tk)) continue;
            return r;
        }
        return fail("Please log in again.", false);
    }

    /** profile-fast with simple string parameters (GET). */
    static JSONObject prof(Context c, String action, String... kv) {
        for (int tries = 0; tries < 2; tries++) {
            String tk = Store.token(c);
            StringBuilder q = new StringBuilder(BASE + "profile-fast?action=" + enc(action) + "&token=" + enc(tk) + "&_ts=" + System.currentTimeMillis());
            for (int n = 0; n + 1 < kv.length; n += 2) q.append('&').append(enc(kv[n])).append('=').append(enc(kv[n + 1]));
            JSONObject r = http("GET", q.toString(), null);
            if (tries == 0 && expired(r) && relogin(c, tk)) continue;
            return r;
        }
        return fail("Please log in again.", false);
    }

    /** Sends a raw file (status sound) to profile-fast. Call from a background thread. */
    static JSONObject profUpload(Context c, String action, String mime, byte[] data) {
        for (int tries = 0; tries < 2; tries++) {
            String tk = Store.token(c);
            HttpURLConnection h = null;
            JSONObject r;
            try {
                h = (HttpURLConnection) new URL(BASE + "profile-fast?action=" + enc(action) + "&token=" + enc(tk)).openConnection();
                h.setRequestMethod("POST");
                h.setConnectTimeout(12000);
                h.setReadTimeout(60000);
                h.setRequestProperty("apikey", KEY);
                h.setRequestProperty("Content-Type", mime);
                h.setDoOutput(true);
                h.setFixedLengthStreamingMode(data.length);
                try (OutputStream os = h.getOutputStream()) { os.write(data); }
                int code = h.getResponseCode();
                InputStream is = code >= 400 ? h.getErrorStream() : h.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (is != null) { byte[] buf = new byte[8192]; int n; while ((n = is.read(buf)) > 0) bo.write(buf, 0, n); is.close(); }
                try { r = new JSONObject(new String(bo.toByteArray(), StandardCharsets.UTF_8)); } catch (Exception e) { r = fail("Server error. Try again.", false); }
            } catch (Exception e) {
                r = fail("No internet. Try again.", true);
            } finally {
                if (h != null) h.disconnect();
            }
            if (tries == 0 && expired(r) && relogin(c, tk)) continue;
            return r;
        }
        return fail("Please log in again.", false);
    }

    /** profile-fast with a JSON body (statusAdd carries pictures). */
    static JSONObject profPost(Context c, JSONObject body) {
        for (int tries = 0; tries < 2; tries++) {
            String tk = Store.token(c);
            try { body.put("token", tk); } catch (Exception ignored) { }
            JSONObject r = http("POST", BASE + "profile-fast", body.toString());
            if (tries == 0 && expired(r) && relogin(c, tk)) continue;
            return r;
        }
        return fail("Please log in again.", false);
    }

    static void logout(Context c) {
        String tk = Store.token(c);
        Store.sp(c).edit().remove("token").remove("pass").remove("seen").remove("baselined").remove("lastCnt").remove("notified").remove("recent").remove("unreadTotal").remove("people").remove("visitor").apply();
        final String t = tk;
        new Thread(() -> { http("GET", BASE + "auth-fast?action=logout&token=" + enc(t), null); http("GET", BASE + "visitor-fast?action=logout&token=" + enc(t), null); }).start();
    }
}
