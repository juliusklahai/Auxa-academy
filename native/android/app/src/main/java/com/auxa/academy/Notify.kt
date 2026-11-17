package com.auxa.academy

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar

/**
 * Notifications without any third-party service:
 *  - a daily practice reminder at the learner's chosen time (skipped on days they already practised),
 *  - news from Auxa (announcements the admin posts), checked a few times a day in the background
 *    straight from the public announcements table, and shown as a notification once each.
 * Everything is scheduled with AlarmManager (inexact, battery friendly) and survives a restart.
 */
object Notify {
    private const val PREFS = "auxa.notify"
    const val CH_REMIND = "practice"
    const val CH_NEWS = "news"
    private const val ACT_REMIND = "com.auxa.academy.REMIND"
    private const val ACT_NEWS = "com.auxa.academy.NEWS"

    fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun channels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_REMIND, "Practice reminders", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "A daily nudge to practise" })
        nm.createNotificationChannel(NotificationChannel(CH_NEWS, "News from Auxa", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "New lessons, features and announcements" })
    }

    /** Save the settings from the app and (re)schedule. json: {on, hour, minute, title, body, news, url, key} */
    fun configure(c: Context, json: String) {
        val j = JSONObject(json)
        prefs(c).edit()
            .putBoolean("on", j.optBoolean("on", false))
            .putInt("hour", j.optInt("hour", 18)).putInt("minute", j.optInt("minute", 0))
            .putString("title", j.optString("title", "Time to practise"))
            .putString("body", j.optString("body", "A few minutes at the piano today keeps your streak going."))
            .putBoolean("news", j.optBoolean("news", true))
            .putString("url", j.optString("url", "")).putString("key", j.optString("key", ""))
            .apply()
        schedule(c)
    }

    fun practisedToday(c: Context, day: String) { prefs(c).edit().putString("practised", day).apply() }

    fun schedule(c: Context) {
        channels(c)
        val p = prefs(c)
        val am = c.getSystemService(AlarmManager::class.java)
        val remind = pending(c, ACT_REMIND)
        am.cancel(remind)
        if (p.getBoolean("on", false)) {
            val cal = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, p.getInt("hour", 18)); set(Calendar.MINUTE, p.getInt("minute", 0)); set(Calendar.SECOND, 0)
                if (timeInMillis <= System.currentTimeMillis() + 30_000) add(Calendar.DAY_OF_YEAR, 1)
            }
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.timeInMillis, AlarmManager.INTERVAL_DAY, remind)
        }
        val news = pending(c, ACT_NEWS)
        am.cancel(news)
        if (p.getBoolean("news", true) && !p.getString("url", "").isNullOrEmpty()) {
            am.setInexactRepeating(AlarmManager.RTC, System.currentTimeMillis() + AlarmManager.INTERVAL_HOUR, AlarmManager.INTERVAL_HOUR * 6, news)
        }
    }

    private fun pending(c: Context, action: String) = PendingIntent.getBroadcast(
        c, action.hashCode(), Intent(c, NotifyReceiver::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun openApp(c: Context, req: Int) = PendingIntent.getActivity(
        c, req, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun allowed(c: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED

    fun post(c: Context, channel: String, id: Int, title: String, body: String) {
        if (!allowed(c)) return
        channels(c)
        val n = Notification.Builder(c, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title).setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(openApp(c, id)).setAutoCancel(true)
            .build()
        c.getSystemService(NotificationManager::class.java).notify(id, n)
    }

    fun remind(c: Context) {
        val p = prefs(c)
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        if (p.getString("practised", "") == today) return // already practised: no nudge
        post(c, CH_REMIND, 1001, p.getString("title", "Time to practise")!!, p.getString("body", "")!!)
    }

    /** Fetch announcements newer than the last one shown, and show each once. */
    fun checkNews(c: Context) {
        val p = prefs(c)
        val base = p.getString("url", "") ?: return
        val key = p.getString("key", "") ?: return
        if (base.isEmpty() || key.isEmpty()) return
        val last = p.getLong("lastNews", -1)
        val q = if (last < 0) "order=id.desc&limit=1" else "id=gt.$last&order=id.asc&limit=5"
        val conn = URL("$base/rest/v1/announcements?select=id,title,body&published=eq.true&$q").openConnection() as HttpURLConnection
        conn.setRequestProperty("apikey", key)
        conn.setRequestProperty("Authorization", "Bearer $key")
        conn.connectTimeout = 10_000; conn.readTimeout = 10_000
        try {
            if (conn.responseCode != 200) return
            val arr = JSONArray(conn.inputStream.bufferedReader().readText())
            var maxId = last
            for (i in 0 until arr.length()) {
                val a = arr.getJSONObject(i)
                val id = a.getLong("id")
                // the first check only remembers where we are, so a new install is not flooded
                if (last >= 0) post(c, CH_NEWS, 2000 + (id % 1000).toInt(), a.optString("title", "Auxa"), a.optString("body", ""))
                if (id > maxId) maxId = id
            }
            p.edit().putLong("lastNews", maxId).apply()
        } finally { conn.disconnect() }
    }

    /** The app saw these announcements already (in its news panel): do not notify them again. */
    fun seen(c: Context, id: Long) { if (id > prefs(c).getLong("lastNews", -1)) prefs(c).edit().putLong("lastNews", id).apply() }
}

class NotifyReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        when (i.action) {
            Intent.ACTION_BOOT_COMPLETED, "android.intent.action.MY_PACKAGE_REPLACED" -> Notify.schedule(c)
            "com.auxa.academy.REMIND" -> { Notify.remind(c); news(c) }
            "com.auxa.academy.NEWS" -> news(c)
        }
    }
    private fun news(c: Context) {
        val done = goAsync()
        Thread { try { Notify.checkNews(c) } catch (_: Throwable) {} finally { done.finish() } }.start()
    }
}
