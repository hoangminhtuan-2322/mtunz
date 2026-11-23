package com.mtunz.web;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

public class MainActivity extends LauncherActivity {
    private static final Uri SITE = Uri.parse("https://mtunz.onrender.com/");

    @Override
    protected Uri getLaunchingUrl() {
        return SITE;
    }
}
