package io.github.juliusklahai.maestro

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/**
 * The voice coach: reads lesson instructions aloud with the phone's own text-to-speech
 * (Android WebView has no speech synthesis of its own). Tells the web app when a line has finished.
 */
class Speaker(private val a: MainActivity) : TextToSpeech.OnInitListener {
    private val main = Handler(Looper.getMainLooper())
    private var ready = false
    private var english = false
    private var pending: Pair<String, String>? = null
    private val tts = TextToSpeech(a, this)

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        val loc = if (tts.isLanguageAvailable(Locale.getDefault()) >= TextToSpeech.LANG_AVAILABLE && Locale.getDefault().language == "en") Locale.getDefault() else Locale.US
        english = tts.isLanguageAvailable(loc) >= TextToSpeech.LANG_AVAILABLE
        tts.language = loc
        // prefer a natural, offline-capable voice for the language
        tts.voices?.filter { it.locale.language == "en" && !it.isNetworkConnectionRequired }
            ?.maxByOrNull { it.quality }?.let { tts.voice = it }
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String) {}
            override fun onDone(id: String) { done(id) }
            @Deprecated("old API") override fun onError(id: String) { done(id) }
            override fun onError(id: String, code: Int) { done(id) }
        })
        ready = true
        pending?.let { (t, id) -> speak(t, id, 1f) }
        pending = null
    }

    fun speak(text: String, id: String, rate: Float) {
        if (!ready) { pending = text to id; return }
        // no English voice installed: stay quiet rather than read English in another language
        if (!english) { done(id); return }
        tts.setSpeechRate(rate.coerceIn(0.6f, 1.4f))
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id)
    }

    fun stop() { pending = null; if (ready) tts.stop() }

    private fun done(id: String) { main.post {
        val safe = id.replace(Regex("[^A-Za-z0-9_-]"), "")
        a.web.evaluateJavascript("window.__maestroNative&&window.__maestroNative.onSpeechDone&&window.__maestroNative.onSpeechDone('$safe')", null)
    } }

    fun close() { tts.stop(); tts.shutdown() }
}
