package com.mysystemlla.messenger;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

public class LoginActivity extends Activity {
    private EditText user, pass, full;
    private Button go;
    private TextView msg, eye, st, switchLink;
    private boolean signupMode;
    private CheckBox remember;
    private boolean showPw;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Store.loggedIn(this)) { openMain(); return; }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(Ui.dp(this, 28), Ui.dp(this, 24), Ui.dp(this, 28), Ui.dp(this, 24));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[] { 0xFF2F6570, 0xFF6BB5C4 });
        root.setBackground(bg);

        AvatarView logo = new AvatarView(this);
        logo.set("LM", 0, "");
        root.addView(logo, Ui.lp(Ui.dp(this, 84), Ui.dp(this, 84)));
        TextView t = Ui.tv(this, "Lalabella Messenger", 24, Color.WHITE, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 4));
        root.addView(t);
        st = Ui.tv(this, "Log in with your staff or visitor account", 14, 0xFFE3F1F4, false);
        st.setGravity(Gravity.CENTER);
        root.addView(st);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.round(this, Color.WHITE, 22));
        int p = Ui.dp(this, 18);
        card.setPadding(p, p, p, p);
        LinearLayout.LayoutParams cl = Ui.lp(Ui.dp(this, 320), -2);
        cl.topMargin = Ui.dp(this, 22);
        root.addView(card, cl);

        full = field("Your name", false);
        full.setVisibility(View.GONE);
        full.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        card.addView(full);
        user = field("Username", false);
        pass = field("Password", true);
        card.addView(user);
        FrameLayout pw = new FrameLayout(this);
        LinearLayout.LayoutParams pwl = Ui.lp(-1, -2);
        pwl.topMargin = Ui.dp(this, 8);
        pass.setLayoutParams(new FrameLayout.LayoutParams(-1, -2));
        pass.setPadding(pass.getPaddingLeft(), pass.getPaddingTop(), Ui.dp(this, 52), pass.getPaddingBottom());
        pw.addView(pass);
        eye = Ui.tv(this, "👁", 20, Ui.MUTED, false);
        eye.setPadding(Ui.dp(this, 12), Ui.dp(this, 10), Ui.dp(this, 14), Ui.dp(this, 10));
        FrameLayout.LayoutParams el = new FrameLayout.LayoutParams(-2, -2, Gravity.END | Gravity.CENTER_VERTICAL);
        el.topMargin = Ui.dp(this, 8);
        eye.setOnClickListener(v -> {
            showPw = !showPw;
            int sel = pass.getSelectionEnd();
            pass.setInputType(InputType.TYPE_CLASS_TEXT | (showPw ? InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD : InputType.TYPE_TEXT_VARIATION_PASSWORD));
            if (sel >= 0) pass.setSelection(sel);
            eye.setText(showPw ? "🙈" : "👁");
        });
        pw.addView(eye, el);
        card.addView(pw, pwl);
        remember = new CheckBox(this);
        remember.setText("Remember me");
        remember.setTextColor(Ui.INK);
        remember.setChecked(Store.b(this, "remember", true));
        remember.setPadding(Ui.dp(this, 4), Ui.dp(this, 4), 0, Ui.dp(this, 4));
        LinearLayout.LayoutParams rl = Ui.lp(-2, -2);
        rl.topMargin = Ui.dp(this, 6);
        card.addView(remember, rl);
        msg = Ui.tv(this, "", 13, 0xFFC0392B, false);
        msg.setPadding(0, Ui.dp(this, 8), 0, 0);
        card.addView(msg);

        go = new Button(this);
        go.setText("Log in");
        go.setAllCaps(false);
        go.setTextColor(Color.WHITE);
        go.setTextSize(16);
        go.setBackground(Ui.round(this, Ui.ACC, 14));
        LinearLayout.LayoutParams gl = Ui.lp(-1, Ui.dp(this, 48));
        gl.topMargin = Ui.dp(this, 12);
        card.addView(go, gl);
        go.setOnClickListener(v -> doLogin());
        pass.setOnEditorActionListener((v, a, e) -> { doLogin(); return true; });
        switchLink = Ui.tv(this, "New here? Create a visitor account", 14, Ui.ACC, true);
        switchLink.setGravity(Gravity.CENTER);
        switchLink.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 4));
        switchLink.setOnClickListener(v -> setMode(!signupMode));
        card.addView(switchLink);
        String last = Store.s(this, "user");
        if (last.length() > 0) user.setText(last);
        setContentView(root);
    }

    private EditText field(String hint, boolean secret) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setSingleLine(true);
        e.setTextSize(16);
        e.setTextColor(Ui.INK);
        e.setBackground(Ui.round(this, 0xFFF1F5F6, 12));
        int p = Ui.dp(this, 14);
        e.setPadding(p, p, p, p);
        e.setInputType(secret ? (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD) : (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
        LinearLayout.LayoutParams l = Ui.lp(-1, -2);
        l.topMargin = Ui.dp(this, 8);
        e.setLayoutParams(l);
        return e;
    }

    private void setMode(boolean signup) {
        signupMode = signup;
        msg.setText("");
        msg.setTextColor(0xFFC0392B);
        full.setVisibility(signup ? View.VISIBLE : View.GONE);
        remember.setVisibility(signup ? View.GONE : View.VISIBLE);
        go.setText(signup ? "Sign up" : "Log in");
        st.setText(signup ? "Visitor account: chat with the admin. The admin approves it first." : "Log in with your staff or visitor account");
        switchLink.setText(signup ? "Already have an account? Log in" : "New here? Create a visitor account");
    }

    private void doSignup() {
        final String n = full.getText().toString().trim(), u = user.getText().toString().trim(), p = pass.getText().toString();
        if (n.length() < 2 || u.length() == 0 || p.length() == 0) { msg.setText("Write your name, a username and a password."); return; }
        msg.setText("");
        go.setEnabled(false);
        go.setText("Sending…");
        new Thread(() -> {
            final JSONObject r = Api.signup(n, u, p);
            Ui.MAIN.post(() -> {
                go.setEnabled(true);
                if (r.optBoolean("success")) {
                    pass.setText("");
                    setMode(false);
                    msg.setTextColor(0xFF2E7D32);
                    msg.setText(r.optString("message", "Sign-up sent! Please wait for the admin to approve your account."));
                } else {
                    go.setText("Sign up");
                    msg.setText(r.optString("error", "Could not sign up."));
                }
            });
        }).start();
    }

    private void doLogin() {
        if (signupMode) { doSignup(); return; }
        final String u = user.getText().toString().trim(), p = pass.getText().toString();
        if (u.length() == 0 || p.length() == 0) { msg.setText("Write your username and password."); return; }
        msg.setText("");
        Store.put(this, "remember", remember.isChecked());
        go.setEnabled(false);
        go.setText("Logging in…");
        new Thread(() -> {
            final JSONObject r = Api.login(getApplicationContext(), u, p);
            Ui.MAIN.post(() -> {
                go.setEnabled(true);
                go.setText("Log in");
                if (r.optBoolean("success")) openMain();
                else msg.setText(r.optString("error", "Could not log in."));
            });
        }).start();
    }

    private void openMain() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }
}
