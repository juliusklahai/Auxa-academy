package com.auxa.academy

import android.webkit.JavascriptInterface

/** What the web app can ask of the phone (window.MaestroNative in JavaScript). */
class NativeBridge(private val a: MainActivity) {
    @JavascriptInterface fun platform() = "android"
    @JavascriptInterface fun appVersion() = BuildConfig.VERSION_NAME
    @JavascriptInterface fun setPractice(on: Boolean) = a.setPractice(on)
    @JavascriptInterface fun keepAwake(on: Boolean) = a.keepAwake(on)
    @JavascriptInterface fun openExternal(url: String) {
        // only web links (sign-in, payments, help pages)
        if (url.startsWith("https://")) a.openExternal(url)
    }
    @JavascriptInterface fun midiStart() = a.midi.start()
    @JavascriptInterface fun setBars(lightBackground: Boolean) = a.setBars(lightBackground)
    /** voice coach: read a line aloud; onSpeechDone(id) is called when it ends */
    @JavascriptInterface fun speak(text: String, id: String, rate: Float) = a.speaker.speak(text.take(4000), id, rate)
    @JavascriptInterface fun stopSpeaking() = a.speaker.stop()
    /** native low-latency piano for MIDI keyboards: load a sound; onPiano(ok) is called when ready */
    @JavascriptInterface fun pianoSetup(json: String) = a.piano.setup(json) { ok ->
        a.runOnUiThread { a.web.evaluateJavascript("window.__maestroNative&&window.__maestroNative.onPiano&&window.__maestroNative.onPiano($ok)", null) }
    }
    @JavascriptInterface fun pianoVolume(v: Float) { a.piano.volume = v.coerceIn(0f, 1.5f) }
    @JavascriptInterface fun pianoDisable() = a.piano.disable()
    @JavascriptInterface fun pianoStatus(): String = a.piano.status()
    /** certificates and exports: save to Pictures/Auxa (images) or Downloads/Auxa; returns a content:// address,
     *  "" when it failed, or "picker" on Android 8–9 (the result then arrives on onSaved) */
    @JavascriptInterface fun saveFile(base64: String, name: String, mime: String): String = a.saveFile(base64, name, mime)
    @JavascriptInterface fun openFile(uri: String, mime: String) = a.openFile(uri, mime)
    /** the phone's share sheet (WhatsApp, Messages, Gmail, copy…) */
    @JavascriptInterface fun shareText(title: String, text: String) = a.shareText(title.take(200), text.take(4000))
    /** the clock MIDI arrival times are stamped with (to measure the bridge's own delay) */
    /** notifications: daily reminder + news (json: on, hour, minute, title, body, news, url, key) */
    @JavascriptInterface fun notifyConfigure(json: String) = Notify.configure(a, json)
    @JavascriptInterface fun notifyStatus(): String = if (Notify.allowed(a)) "granted" else "ask"
    @JavascriptInterface fun notifyRequest() = a.runOnUiThread { a.askNotifications() }
    @JavascriptInterface fun notifyPractised(day: String) = Notify.practisedToday(a, day)
    @JavascriptInterface fun notifySeen(id: Double) = Notify.seen(a, id.toLong())
    @JavascriptInterface fun notifyTest(title: String, body: String) = Notify.post(a, Notify.CH_NEWS, 1999, title, body)
    /** who installed the app ("com.android.vending" = Google Play): outside payment is hidden for Play installs */
    @JavascriptInterface fun installSource(): String = try {
        if (android.os.Build.VERSION.SDK_INT >= 30) a.packageManager.getInstallSourceInfo(a.packageName).installingPackageName ?: ""
        else @Suppress("DEPRECATION") (a.packageManager.getInstallerPackageName(a.packageName) ?: "")
    } catch (_: Exception) { "" }
    @JavascriptInterface fun uptimeMs(): Double = android.os.SystemClock.uptimeMillis().toDouble()
}
