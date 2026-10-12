package com.mysystemlla.twa;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import java.util.regex.Pattern;

/** Opened by lalabella://widget?key=... from the website. Saves the widget key and refreshes the widget. */
public class LinkActivity extends Activity {
    private static final Pattern KEY = Pattern.compile("^[a-f0-9]{40}$");

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Uri u = getIntent() == null ? null : getIntent().getData();
        String key = u == null ? null : u.getQueryParameter("key");
        if (key != null && KEY.matcher(key).matches()) {
            getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("key", key).remove("data").apply();
            LbWidgetProvider.refreshAll(this);
            Toast.makeText(this, "Widget linked ✅  Long-press your home screen → Widgets → Lalabella", Toast.LENGTH_LONG).show();
        } else {
            Toast.makeText(this, "Invalid widget link.", Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}
