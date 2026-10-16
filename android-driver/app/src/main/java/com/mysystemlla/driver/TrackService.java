package com.mysystemlla.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Foreground service: keeps reading the GPS and sending it to delivery-fast while the screen is locked or Google Maps is open. */
public class TrackService extends Service implements LocationListener {
    private static final String CH = "lb_tracking";
    private static final long SEND_GAP_MS = 8000;

    // Latest state, read by the web page through MainActivity.Bridge.lastFix().
    private static volatile double sLat, sLng, sAcc;
    private static volatile long sT, sSent;
    private static volatile String sErr = "";
    private static volatile boolean sHave;

    static String snapshot() {
        try {
            JSONObject o = new JSONObject();
            if (sHave) { o.put("lat", sLat); o.put("lng", sLng); o.put("acc", sAcc); o.put("t", sT); }
            if (sSent > 0) o.put("sent", sSent);
            if (!sErr.isEmpty()) o.put("err", sErr);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    private LocationManager lm;
    private PowerManager.WakeLock wake;
    private String token = "", api = "", key = "";
    private final List<Long> ids = new ArrayList<>();
    private volatile Location latest;
    private long lastAttempt = 0;
    private boolean sending = false;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        if (i == null || i.getStringExtra("token") == null) { stopSelf(); return START_NOT_STICKY; }
        synchronized (ids) {
            token = i.getStringExtra("token");
            api = i.getStringExtra("api");
            key = i.getStringExtra("key");
            ids.clear();
            try {
                JSONArray a = new JSONArray(i.getStringExtra("ids"));
                for (int k = 0; k < a.length(); k++) ids.add(a.getLong(k));
            } catch (Exception ignored) { }
            if (ids.isEmpty()) { stopSelf(); return START_NOT_STICKY; }
        }
        startFg();
        if (wake == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lalabella:tracking");
            wake.setReferenceCounted(false);
            wake.acquire(12 * 60 * 60 * 1000L);
        }
        startGps();
        return START_NOT_STICKY;
    }

    private void startFg() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CH, "Delivery tracking", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        Notification n = nb.setContentTitle("Lalabella Driver")
                .setContentText("Tracking your delivery")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(1, n);
    }

    private boolean gpsOn = false;

    private void startGps() {
        if (gpsOn) return;
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000, 0, this);
                gpsOn = true;
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 8000, 0, this);
                gpsOn = true;
            }
            sErr = gpsOn ? "" : "Location is turned off on the phone. Turn on Location.";
        } catch (SecurityException e) {
            sErr = "Location permission is missing. Allow location for this app.";
        } catch (Exception e) {
            sErr = "Could not start GPS.";
        }
    }

    @Override
    public void onLocationChanged(Location l) {
        // Prefer a GPS fix; ignore a much worse network fix right after a good GPS fix.
        Location cur = latest;
        if (cur != null && "network".equals(l.getProvider()) && System.currentTimeMillis() - cur.getTime() < 15000 && cur.getAccuracy() < l.getAccuracy()) return;
        latest = l;
        sLat = l.getLatitude(); sLng = l.getLongitude(); sAcc = l.getAccuracy(); sT = System.currentTimeMillis(); sHave = true; sErr = "";
        maybeSend();
    }

    private void maybeSend() {
        long now = System.currentTimeMillis();
        final Location l = latest;
        final List<Long> copy;
        synchronized (ids) {
            if (sending || l == null || now - lastAttempt < SEND_GAP_MS || ids.isEmpty()) return;
            sending = true;
            lastAttempt = now;
            copy = new ArrayList<>(ids);
        }
        final String tk = token, url = api, ky = key;
        new Thread(() -> {
            boolean stopAll = false, ok = false;
            List<Long> stopped = new ArrayList<>();
            for (Long id : copy) {
                try {
                    JSONObject b = new JSONObject();
                    b.put("action", "ping"); b.put("token", tk); b.put("id", id);
                    b.put("lat", l.getLatitude()); b.put("lng", l.getLongitude()); b.put("accuracy", l.getAccuracy());
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(10000); c.setReadTimeout(10000);
                    c.setRequestMethod("POST"); c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setRequestProperty("apikey", ky);
                    try (OutputStream os = c.getOutputStream()) { os.write(b.toString().getBytes(StandardCharsets.UTF_8)); }
                    java.io.InputStream is = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream();
                    StringBuilder sb = new StringBuilder();
                    if (is != null) { byte[] buf = new byte[1024]; int n; while ((n = is.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8)); }
                    c.disconnect();
                    JSONObject r = new JSONObject(sb.toString());
                    if (r.optBoolean("success")) ok = true;
                    if (r.optBoolean("stop")) stopped.add(id);
                    if (r.optBoolean("reauth")) stopAll = true;
                } catch (Exception ignored) { /* no internet: try again with the next fix */ }
            }
            if (ok) sSent = System.currentTimeMillis();
            boolean empty;
            synchronized (ids) {
                ids.removeAll(stopped);
                empty = ids.isEmpty() || stopAll;
                sending = false;
            }
            if (empty) stopSelf();
        }).start();
    }

    @Override
    public void onDestroy() {
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception ignored) { }
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { }
        stopForeground(true);
        super.onDestroy();
    }

    // Needed on old Android versions.
    @Override public void onStatusChanged(String p, int s, Bundle e) { }
    @Override public void onProviderEnabled(String p) { startGpsLater(); }
    @Override public void onProviderDisabled(String p) { }
    private void startGpsLater() { gpsOn = false; startGps(); }
}
