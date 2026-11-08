package io.github.juliusklahai.maestro

import android.content.pm.PackageManager
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONArray

/**
 * MIDI keyboards over USB or Bluetooth, through Android's own MIDI system. Every keyboard that is
 * plugged in (now or later) is opened, and its bytes are passed to the web app, which reads the notes.
 */
class MidiBridge(private val a: MainActivity) {
    private val main = Handler(Looper.getMainLooper())
    private val manager: MidiManager? =
        if (a.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)) a.getSystemService(MidiManager::class.java) else null
    private val open = mutableMapOf<Int, Pair<MidiDevice, List<MidiOutputPort>>>()
    private var started = false

    private val callback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) { openDevice(info) }
        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            open.remove(info.id)?.let { (d, ports) -> ports.forEach { runCatching { it.close() } }; runCatching { d.close() } }
            sendDevices()
        }
    }

    fun start() = main.post {
        val m = manager ?: run { sendDevices(); return@post }
        if (!started) {
            started = true
            m.registerDeviceCallback(callback, main)
        }
        devices(m).forEach { openDevice(it) }
        sendDevices()
    }

    @Suppress("DEPRECATION")
    private fun devices(m: MidiManager): Collection<MidiDeviceInfo> =
        if (Build.VERSION.SDK_INT >= 33) m.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM) else m.devices.toList()

    private fun openDevice(info: MidiDeviceInfo) {
        val m = manager ?: return
        if (open.containsKey(info.id) || info.outputPortCount == 0) return
        m.openDevice(info, { device ->
            if (device == null) return@openDevice
            val ports = (0 until info.outputPortCount).mapNotNull { i -> device.openOutputPort(i) }
            ports.forEach { it.connect(Receiver()) }
            open[info.id] = device to ports
            sendDevices()
        }, main)
    }

    private fun name(info: MidiDeviceInfo): String {
        val p = info.properties
        return p.getString(MidiDeviceInfo.PROPERTY_NAME)
            ?: listOfNotNull(p.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER), p.getString(MidiDeviceInfo.PROPERTY_PRODUCT)).joinToString(" ").ifEmpty { "MIDI keyboard" }
    }

    private fun sendDevices() {
        val names = JSONArray()
        open.values.forEach { (d, _) -> names.put(name(d.info)) }
        js("window.__maestroNative&&window.__maestroNative.onMidiDevices&&window.__maestroNative.onMidiDevices($names)")
    }

    private inner class Receiver : MidiReceiver() {
        override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            val sb = StringBuilder("[")
            for (i in 0 until count) { if (i > 0) sb.append(','); sb.append(msg[offset + i].toInt() and 0xff) }
            sb.append(']')
            js("window.__maestroNative&&window.__maestroNative.onMidi&&window.__maestroNative.onMidi($sb)")
        }
    }

    private fun js(code: String) = main.post { a.web.evaluateJavascript(code, null) }

    fun close() {
        runCatching { manager?.unregisterDeviceCallback(callback) }
        open.values.forEach { (d, ports) -> ports.forEach { runCatching { it.close() } }; runCatching { d.close() } }
        open.clear()
    }
}
