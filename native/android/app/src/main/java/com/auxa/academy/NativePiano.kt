package com.auxa.academy

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTimestamp
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Process
import android.os.SystemClock
import org.json.JSONObject
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * The piano sound for a MIDI keyboard, played by the phone itself with the lowest delay Android offers.
 *
 * A key press goes MIDI driver -> this class -> the audio output, on the MIDI thread and a real-time
 * audio thread, without passing through the web page at all (the page still receives the note to
 * assess it, but no longer has to make the sound). Samples are the same recordings the web app uses,
 * decoded once from the app's own files. Output: AudioTrack in low-latency mode at the device's native
 * rate with a buffer of two bursts, which uses Android's fast mixer path on most phones.
 */
class NativePiano(private val ctx: Context) {
    private class Sample(val data: ShortArray, val rate: Int)
    private class Voice(val midi: Int, val s: Sample, val step: Double, var gain: Float) {
        var pos = 0.0
        var releasing = false
        var rel = 1f
        var relMul = 1f
        var held = true
        var sustained = false
    }
    private sealed class Ev { class On(val midi: Int, val vel: Float, val at: Long) : Ev(); class Off(val midi: Int) : Ev(); class Pedal(val down: Boolean) : Ev(); object AllOff : Ev() }

    private val events = ConcurrentLinkedQueue<Ev>()
    @Volatile private var layers: List<Map<Int, Sample>> = emptyList()
    @Volatile private var roots: IntArray = IntArray(0)
    @Volatile private var bankGain = 0.1f
    @Volatile private var releaseSec = 0.3f
    @Volatile var volume = 0.8f
    @Volatile var enabled = false
        private set
    @Volatile private var soundId = ""
    private var track: AudioTrack? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    private var outRate = 48000
    private var burst = 192
    private var bufferFrames = 384
    private var framesWritten = 0L
    @Volatile private var underruns = 0
    @Volatile private var lastPressToRenderMs = -1.0
    private val voices = ArrayList<Voice>()
    private var pedal = false

    /** Load a sound's recordings (in the background) and start the output. */
    fun setup(json: String, onReady: (Boolean) -> Unit) {
        val j = JSONObject(json)
        val id = j.getString("id")
        if (id == soundId && enabled) { applyLevels(j); onReady(true); return }
        Thread {
            try {
                val folders = j.getJSONArray("layers")
                val rs = j.getJSONArray("roots")
                val rootList = IntArray(rs.length()) { rs.getInt(it) }
                val caps = doubleArrayOf(3.0, 5.0, 3.0)
                val loaded = ArrayList<Map<Int, Sample>>()
                for (li in 0 until folders.length()) {
                    val m = HashMap<Int, Sample>()
                    // the longest recording for the layer most notes use; shorter ones for the others (memory)
                    val cap = if (folders.length() == 3) caps[li] else 5.0
                    for (r in rootList) decode("www/sounds/${folders.getString(li)}/$r.mp3", cap)?.let { m[r] = it }
                    loaded.add(m)
                }
                layers = loaded
                roots = rootList
                soundId = id
                applyLevels(j)
                start()
                enabled = layers.isNotEmpty() && layers[0].isNotEmpty()
                onReady(enabled)
            } catch (e: Throwable) {
                enabled = false
                onReady(false)
            }
        }.apply { priority = Thread.MIN_PRIORITY }.start()
    }

    private fun applyLevels(j: JSONObject) {
        bankGain = j.optDouble("gain", 0.1).toFloat()
        releaseSec = j.optDouble("release", 0.3).toFloat()
        volume = j.optDouble("volume", volume.toDouble()).toFloat()
    }

    fun disable() { enabled = false; events.add(Ev.AllOff) }

    // ---- called on the MIDI thread: queue only, the audio thread does the rest within one burst ----
    fun noteOn(midi: Int, vel: Float) { if (enabled) events.add(Ev.On(midi, vel, SystemClock.elapsedRealtimeNanos())) }
    fun noteOff(midi: Int) { if (enabled) events.add(Ev.Off(midi)) }
    fun sustain(down: Boolean) { if (enabled) events.add(Ev.Pedal(down)) }

    private fun start() {
        if (running) return
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        outRate = am.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 48000
        burst = am.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toIntOrNull() ?: 192
        val minBytes = AudioTrack.getMinBufferSize(outRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_FLOAT)
        val t = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(outRate).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
            .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(max(minBytes, burst * 2 * 2 * 4))
            .build()
        // as small as the device allows: two bursts (Oboe's default strategy)
        runCatching { t.setBufferSizeInFrames(burst * 2) }
        bufferFrames = runCatching { t.bufferSizeInFrames }.getOrDefault(burst * 2)
        track = t
        running = true
        t.play()
        thread = Thread({ loop(t) }, "auxa-piano").apply { start() }
    }

    private fun loop(t: AudioTrack) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val n = burst
        val out = FloatArray(n * 2)
        val ur0 = runCatching { t.underrunCount }.getOrDefault(0)
        while (running) {
            drainEvents()
            render(out, n)
            val w = t.write(out, 0, out.size, AudioTrack.WRITE_BLOCKING)
            if (w > 0) framesWritten += w / 2
            underruns = runCatching { t.underrunCount }.getOrDefault(ur0) - ur0
        }
    }

    private fun drainEvents() {
        while (true) {
            val e = events.poll() ?: break
            when (e) {
                is Ev.On -> start(e.midi, e.vel, e.at)
                is Ev.Off -> voices.filter { it.midi == e.midi && it.held }.forEach { it.held = false; if (pedal) it.sustained = true else release(it) }
                is Ev.Pedal -> { pedal = e.down; if (!pedal) voices.filter { it.sustained }.forEach { it.sustained = false; release(it) } }
                is Ev.AllOff -> voices.clear()
            }
        }
    }

    private fun release(v: Voice) {
        v.releasing = true
        // exponential fade to silence over the sound's release time
        v.relMul = exp(-6.9 / (max(0.05f, releaseSec) * outRate)).toFloat()
    }

    private fun start(midi: Int, vel: Float, at: Long) {
        val ls = layers
        if (ls.isEmpty() || roots.isEmpty()) return
        val li = if (ls.size == 3) (if (vel < 0.35f) 0 else if (vel < 0.85f) 1 else 2) else min(ls.size - 1, (vel * ls.size).toInt())
        var root = roots[0]
        for (r in roots) if (abs(r - midi) < abs(root - midi)) root = r
        val s = ls[li][root] ?: ls.firstNotNullOfOrNull { it[root] } ?: return
        // the same key again: quickly damp the old one (as the hammer does)
        voices.filter { it.midi == midi && !it.releasing }.forEach { it.releasing = true; it.relMul = exp(-6.9 / (0.03 * outRate)).toFloat() }
        if (voices.size >= 48) voices.removeAt(0)
        val step = 2.0.pow((midi - root) / 12.0) * s.rate / outRate
        val g = bankGain * (0.55f + 0.45f * vel)
        voices.add(Voice(midi, s, step, g))
        lastPressToRenderMs = (SystemClock.elapsedRealtimeNanos() - at) / 1e6
    }

    private fun render(out: FloatArray, n: Int) {
        java.util.Arrays.fill(out, 0f)
        val vol = volume
        val it = voices.iterator()
        while (it.hasNext()) {
            val v = it.next()
            val d = v.s.data
            var pos = v.pos
            var rel = v.rel
            var i = 0
            while (i < n) {
                val k = pos.toInt()
                if (k + 1 >= d.size) { rel = 0f; break }
                val f = (pos - k).toFloat()
                val x = (d[k] + (d[k + 1] - d[k]) * f) * (1f / 32768f) * v.gain * rel * vol
                out[2 * i] += x; out[2 * i + 1] += x
                pos += v.step
                if (v.releasing) { rel *= v.relMul; if (rel < 1e-4f) break }
                i++
            }
            v.pos = pos; v.rel = rel
            if (rel < 1e-4f) it.remove()
        }
        // gentle safety: no hard clipping when many notes ring together (no look-ahead, so no delay)
        for (j in out.indices) {
            val x = out[j]; val a = abs(x)
            if (a > 0.7f) out[j] = (if (x > 0) 1f else -1f) * (0.7f + 0.3f * kotlin.math.tanh((a - 0.7f) / 0.3f))
        }
    }

    /** Decode an mp3 from the app's files to 16-bit mono, skipping the encoder's silence at the front. */
    private fun decode(asset: String, capSec: Double): Sample? {
        val ex = MediaExtractor()
        try {
            ctx.assets.openFd(asset).use { fd -> ex.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length) }
        } catch (e: Exception) {
            // compressed assets cannot be opened as a file descriptor: copy to a temporary file
            return try {
                val tmp = java.io.File.createTempFile("s", ".mp3", ctx.cacheDir)
                ctx.assets.open(asset).use { inp -> tmp.outputStream().use { inp.copyTo(it) } }
                ex.setDataSource(tmp.absolutePath)
                val r = decodeFrom(ex, capSec)
                tmp.delete()
                r
            } catch (e2: Exception) { null } finally { ex.release() }
        }
        return try { decodeFrom(ex, capSec) } finally { ex.release() }
    }

    private fun decodeFrom(ex: MediaExtractor, capSec: Double): Sample? {
        if (ex.trackCount == 0) return null
        ex.selectTrack(0)
        val fmt = ex.getTrackFormat(0)
        val rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val chans = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        val codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME)!!)
        codec.configure(fmt, null, null, 0)
        codec.start()
        val cap = (capSec * rate).toInt()
        val pcm = ShortArray(cap + rate / 4)
        var got = 0
        val info = MediaCodec.BufferInfo()
        var inDone = false
        var outDone = false
        while (!outDone && got < pcm.size) {
            if (!inDone) {
                val ii = codec.dequeueInputBuffer(5000)
                if (ii >= 0) {
                    val buf = codec.getInputBuffer(ii)!!
                    val sz = ex.readSampleData(buf, 0)
                    if (sz < 0) { codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true }
                    else { codec.queueInputBuffer(ii, 0, sz, ex.sampleTime, 0); ex.advance() }
                }
            }
            val oi = codec.dequeueOutputBuffer(info, 5000)
            if (oi >= 0) {
                val ob = codec.getOutputBuffer(oi)!!.order(ByteOrder.nativeOrder()).asShortBuffer()
                val frames = ob.remaining() / chans
                for (f in 0 until frames) {
                    if (got >= pcm.size) break
                    var acc = 0
                    for (c in 0 until chans) acc += ob.get(f * chans + c)
                    pcm[got++] = (acc / chans).toShort()
                }
                codec.releaseOutputBuffer(oi, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outDone = true
            }
        }
        codec.stop(); codec.release()
        // where the sound really starts
        var s0 = 0
        while (s0 < got && abs(pcm[s0].toInt()) < 40) s0++
        val len = min(got - s0, cap)
        if (len <= 0) return null
        val data = ShortArray(len)
        val fade = min(len, rate / 5)
        for (i in 0 until len) {
            var v = pcm[s0 + i].toFloat()
            if (i > len - fade) v *= (len - i).toFloat() / fade // fade out a cut recording
            data[i] = v.toInt().toShort()
        }
        return Sample(data, rate)
    }

    /** What the latency check shows. */
    fun status(): String {
        val t = track
        var outMs = -1.0
        if (t != null) {
            val ts = AudioTimestamp()
            if (runCatching { t.getTimestamp(ts) }.getOrDefault(false)) {
                val now = System.nanoTime()
                val playedNow = ts.framePosition + (now - ts.nanoTime) * outRate / 1e9
                outMs = (framesWritten - playedNow) * 1000.0 / outRate
            } else outMs = bufferFrames * 1000.0 / outRate
        }
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val outs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val bt = outs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || (android.os.Build.VERSION.SDK_INT >= 31 && (it.type == AudioDeviceInfo.TYPE_BLE_HEADSET || it.type == AudioDeviceInfo.TYPE_BLE_SPEAKER)) }
        val wired = outs.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_DEVICE }
        val lowLat = ctx.packageManager.hasSystemFeature("android.hardware.audio.low_latency")
        return JSONObject()
            .put("enabled", enabled).put("sound", soundId)
            .put("rate", outRate).put("burst", burst).put("bufferFrames", bufferFrames)
            .put("bufferMs", bufferFrames * 1000.0 / outRate)
            .put("outputMs", outMs).put("pressToRenderMs", lastPressToRenderMs)
            .put("underruns", underruns).put("bluetooth", bt).put("wired", wired).put("lowLatencyFeature", lowLat)
            .toString()
    }

    fun close() {
        running = false
        thread?.join(300)
        track?.let { runCatching { it.stop() }; it.release() }
        track = null
    }
}
