package io.github.juliusklahai.maestro

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
}
