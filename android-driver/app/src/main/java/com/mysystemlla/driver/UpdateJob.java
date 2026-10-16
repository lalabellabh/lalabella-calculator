package com.mysystemlla.driver;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** Checks for a new Driver app about every 6 hours, even when the app is closed. */
public class UpdateJob extends JobService {
    private static final int ID = 4401;

    static void schedule(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            for (JobInfo ji : js.getAllPendingJobs()) if (ji.getId() == ID) return;   // already scheduled
            JobInfo info = new JobInfo.Builder(ID, new ComponentName(c, UpdateJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(6 * 60 * 60 * 1000L)
                    .setPersisted(true)
                    .build();
            js.schedule(info);
        } catch (Exception ignored) { }
    }

    @Override
    public boolean onStartJob(final JobParameters p) {
        new Thread(() -> {
            UpdateChecker.check(getApplicationContext(), true);
            jobFinished(p, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters p) { return true; }
}
