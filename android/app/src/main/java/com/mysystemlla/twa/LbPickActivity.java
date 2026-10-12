package com.mysystemlla.twa;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Small search list opened from the schedule widget ("Others"): pick a person to show their calendar. */
public class LbPickActivity extends Activity {
    private final List<String> names = new ArrayList<String>();
    private final List<String> labels = new ArrayList<String>();
    private ArrayAdapter<String> adapter;
    private final List<Integer> shown = new ArrayList<Integer>(); // indexes into names for the filtered list

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setTitle("See someone's schedule");
        float d = getResources().getDisplayMetrics().density;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding((int) (14 * d), (int) (8 * d), (int) (14 * d), (int) (8 * d));

        final EditText search = new EditText(this);
        search.setHint("Search name…");
        search.setSingleLine(true);
        root.addView(search, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        final TextView status = new TextView(this);
        status.setText("Loading names…");
        status.setPadding(0, (int) (6 * d), 0, (int) (6 * d));
        root.addView(status);

        ListView list = new ListView(this);
        adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, new ArrayList<String>());
        list.setAdapter(adapter);
        root.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (320 * d)));
        setContentView(root);

        list.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> p, View v, int pos, long id) {
                if (pos < 0 || pos >= shown.size()) return;
                choose(names.get(shown.get(pos)));
            }
        });
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int c, int d2) { }
            @Override public void onTextChanged(CharSequence s, int a, int c, int d2) { filter(s.toString()); }
            @Override public void afterTextChanged(Editable s) { }
        });

        final String key = getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE).getString("key", "");
        if (key.isEmpty()) {
            status.setText("Link the widget first: open the app, Menu → Link home-screen widget.");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String res = LbWidgetProvider.httpPost(LbWidgetProvider.API, new JSONObject().put("action", "employees").put("key", key).toString());
                    int nl = res.indexOf('\n');
                    JSONObject j = new JSONObject(res.substring(nl + 1));
                    JSONArray arr = j.optJSONArray("employees");
                    final List<String> n = new ArrayList<String>(), l = new ArrayList<String>();
                    for (int i = 0; arr != null && i < arr.length(); i++) {
                        JSONObject e = arr.getJSONObject(i);
                        String nm = e.optString("name");
                        if (nm.isEmpty()) continue;
                        n.add(nm);
                        String br = e.optString("branch");
                        l.add(br.isEmpty() ? nm : nm + "  ·  " + br);
                    }
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            names.addAll(n);
                            labels.addAll(l);
                            status.setText(n.isEmpty() ? "No names found." : "Tap a name");
                            filter("");
                        }
                    });
                } catch (Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            status.setText("Could not load names. Check your connection.");
                        }
                    });
                }
            }
        }).start();
    }

    private void filter(String q) {
        String s = q == null ? "" : q.trim().toLowerCase();
        shown.clear();
        adapter.clear();
        for (int i = 0; i < names.size(); i++) {
            if (s.isEmpty() || labels.get(i).toLowerCase().contains(s)) {
                shown.add(i);
                adapter.add(labels.get(i));
            }
        }
        adapter.notifyDataSetChanged();
    }

    private void choose(String name) {
        SharedPreferences sp = getSharedPreferences(LbWidgetProvider.PREFS, Context.MODE_PRIVATE);
        sp.edit().putString("scWho", name).remove("scSel").remove("scMonth").apply();
        Toast.makeText(this, name + "'s schedule", Toast.LENGTH_SHORT).show();
        LbScheduleWidget.paint(this, android.appwidget.AppWidgetManager.getInstance(this),
                LbWidgetProvider.widgetIds(this, LbScheduleWidget.class));
        LbWidgetProvider.refreshAll(this);
        finish();
    }
}
