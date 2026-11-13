package com.auxa.academy

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher

/**
 * The whole app is one screen: the Maestro web app in the system WebView, plus the native pieces the
 * web cannot do well on a phone: turning the screen sideways without a browser notice, MIDI keyboards,
 * the microphone permission, keeping the screen on, opening the file picker, and sign-in links.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    lateinit var web: WebView
        private set
    val speaker by lazy { Speaker(this) }
    private var offlineView: View? = null
    private var practice = false

    private var pendingMic: PermissionRequest? = null
    private var pendingFiles: ValueCallback<Array<Uri>>? = null
    lateinit var midi: MidiBridge
        private set

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        web = WebView(this).apply { setBackgroundColor(BG) }
        root.addView(web, FrameLayout.LayoutParams(MATCH, MATCH))
        setContentView(root)
        applyInsets()

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            userAgentString = "$userAgentString MaestroApp/${BuildConfig.VERSION_NAME} (Android)"
        }
        midi = MidiBridge(this)
        web.addJavascriptInterface(NativeBridge(this), "MaestroNative")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()

        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { handleBack() }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(startUrlFor(intent))
    }

    // ---------- sign-in links: com.auxa.academy://auth?code=... ----------

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (isAuthLink(intent)) web.loadUrl(startUrlFor(intent))
    }

    private fun isAuthLink(i: Intent?) = i?.data?.scheme == SCHEME

    /** The start page, carrying the sign-in result (code, or error) when we were opened by a sign-in link. */
    private fun startUrlFor(i: Intent?): String {
        val data = i?.data
        if (data == null || data.scheme != SCHEME) return BuildConfig.START_URL
        val b = Uri.parse(BuildConfig.START_URL).buildUpon()
        data.queryParameterNames.forEach { k -> data.getQueryParameter(k)?.let { b.appendQueryParameter(k, it) } }
        // some providers return the result after "#" instead of "?"
        val frag = data.fragment
        return b.build().toString() + (if (!frag.isNullOrEmpty()) "#$frag" else "")
    }

    // ---------- practice mode: sideways, no system bars, screen on ----------

    fun setPractice(on: Boolean) = runOnUiThread {
        practice = on
        requestedOrientation = if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        keepAwake(on)
        immersive(on)
    }

    fun keepAwake(on: Boolean) = runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun immersive(on: Boolean) {
        if (Build.VERSION.SDK_INT >= 30) {
            val c = window.insetsController ?: return
            if (on) {
                c.hide(WindowInsets.Type.systemBars())
                c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else c.show(WindowInsets.Type.systemBars())
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = if (on)
                (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
            else (View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
        root.requestApplyInsets()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && practice) immersive(true) // the bars come back after dialogs / notifications
    }

    /**
     * Edge to edge: the page draws under the status bar and the navigation bar. Their sizes go to the page
     * as CSS variables (--sat/--sab/--sal/--sar) so buttons and text stay clear of them. Only the
     * on-screen keyboard pushes the page up.
     */
    private var insetsJs = ""
    private fun applyInsets() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(false)
        else @Suppress("DEPRECATION") {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
        root.setOnApplyWindowInsetsListener { v, insets ->
            val d = resources.displayMetrics.density
            var l = 0; var t = 0; var r = 0; var b = 0; var ime = 0
            if (Build.VERSION.SDK_INT >= 30) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                l = bars.left; t = bars.top; r = bars.right; b = bars.bottom
                ime = insets.getInsets(WindowInsets.Type.ime()).bottom
            } else @Suppress("DEPRECATION") {
                l = insets.systemWindowInsetLeft; t = insets.systemWindowInsetTop; r = insets.systemWindowInsetRight; b = insets.systemWindowInsetBottom
                if (b > 200 * d) { ime = b; b = 0 } // old Androids report the keyboard as the bottom inset
            }
            v.setPadding(0, 0, 0, if (ime > b) ime else 0)
            fun px(x: Int) = "${(x / d).toInt()}px"
            insetsJs = "(function(s){s.setProperty('--sat','${px(t)}');s.setProperty('--sab','${px(if (ime > b) 0 else b)}');s.setProperty('--sal','${px(l)}');s.setProperty('--sar','${px(r)}')})(document.documentElement.style)"
            sendInsets()
            insets
        }
    }
    private fun sendInsets() { if (insetsJs.isNotEmpty()) web.evaluateJavascript(insetsJs, null) }

    /** Dark icons on light pages (the light home page), light icons on dark ones. */
    fun setBars(lightBackground: Boolean) = runOnUiThread {
        if (Build.VERSION.SDK_INT >= 30) {
            val flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (lightBackground) flags else 0, flags)
        } else @Suppress("DEPRECATION") {
            val v = window.decorView
            v.systemUiVisibility = if (lightBackground) v.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                else v.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
        }
    }

    // ---------- links that must leave the app ----------

    fun openExternal(url: String) = runOnUiThread {
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)) }
        catch (_: ActivityNotFoundException) { Toast.makeText(this, url, Toast.LENGTH_LONG).show() }
    }

    private fun isOurPage(u: Uri) = u.host == Uri.parse(BuildConfig.START_URL).host

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
            val u = req.url
            if (u.scheme == SCHEME) { web.loadUrl(startUrlFor(Intent(Intent.ACTION_VIEW, u))); return true }
            // our own pages and Supabase stay inside; Google sign-in, payments, mail etc. open outside
            if (u.scheme == "https" && (isOurPage(u) || u.host?.endsWith(".supabase.co") == true)) return false
            openExternal(u.toString())
            return true
        }

        // the bundled web app: https://appassets.androidplatform.net/www/... is read from assets/www
        override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
            val u = req.url
            if (u.host != ASSET_HOST) return null
            var path = (u.path ?: "/").removePrefix("/")
            if (path.isEmpty() || path.endsWith("/")) path += "index.html"
            return try {
                val ext = path.substringAfterLast('.', "").lowercase()
                val mime = MIME[ext] ?: "application/octet-stream"
                val res = WebResourceResponse(mime, if (mime.startsWith("text/") || ext == "js" || ext == "json" || ext == "svg") "utf-8" else null, assets.open(path))
                res.responseHeaders = mapOf("Cache-Control" to "no-cache", "Access-Control-Allow-Origin" to "*")
                res
            } catch (_: java.io.IOException) {
                WebResourceResponse("text/plain", "utf-8", 404, "Not found", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
            }
        }

        override fun onPageFinished(view: WebView, url: String) { hideOffline(); sendInsets() }

        override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
            if (req.isForMainFrame) showOffline()
        }
    }

    // ---------- microphone, file picker ----------

    private inner class Chrome : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                val wantsMic = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                if (!wantsMic) { request.deny(); return@runOnUiThread }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    pendingMic = request
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
                }
            }
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            pendingFiles?.onReceiveValue(null)
            pendingFiles = callback
            val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*" // MusicXML files have no reliable type on phones
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
            }
            return try { startActivityForResult(Intent.createChooser(pick, null), REQ_FILES); true }
            catch (_: ActivityNotFoundException) { pendingFiles = null; false }
        }
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, perms, results)
        if (code != REQ_MIC) return
        val req = pendingMic ?: return
        pendingMic = null
        if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        else { req.deny(); Toast.makeText(this, R.string.mic_denied, Toast.LENGTH_LONG).show() }
    }

    @Deprecated("Activity result API needs AndroidX; the platform callback is all we need")
    override fun onActivityResult(code: Int, result: Int, data: Intent?) {
        super.onActivityResult(code, result, data)
        if (code != REQ_FILES) return
        val cb = pendingFiles ?: return
        pendingFiles = null
        if (result != RESULT_OK || data == null) { cb.onReceiveValue(null); return }
        val uris = data.clipData?.let { c -> Array(c.itemCount) { c.getItemAt(it).uri } } ?: data.data?.let { arrayOf(it) }
        cb.onReceiveValue(uris)
    }

    // ---------- back button: the web app first (leave full screen, close a lesson), then the page history ----------

    private fun handleBack() {
        web.evaluateJavascript("(function(){try{return !!(window.__maestroNative&&window.__maestroNative.back&&window.__maestroNative.back())}catch(e){return false}})()") { handled ->
            if (handled == "true") return@evaluateJavascript
            if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
        }
    }

    @Deprecated("Used below Android 13; newer versions use OnBackInvokedCallback")
    override fun onBackPressed() { handleBack() }

    // ---------- offline ----------

    private fun connected(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return true
        return cm.activeNetwork != null
    }

    private fun showOffline() {
        if (offlineView != null) return
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(BG)
            setPadding(64, 64, 64, 64)
            addView(TextView(context).apply {
                setText(R.string.offline); setTextColor(Color.WHITE); textSize = 17f; gravity = Gravity.CENTER
            })
            addView(Button(context).apply {
                setText(R.string.retry)
                setOnClickListener { if (connected()) { hideOffline(); web.reload() } }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = 40 })
        }
        offlineView = box
        root.addView(box, FrameLayout.LayoutParams(MATCH, MATCH))
    }

    private fun hideOffline() { offlineView?.let { root.removeView(it) }; offlineView = null }

    // ---------- lifecycle ----------

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() { super.onPause(); web.onPause() }
    override fun onResume() { super.onResume(); web.onResume(); if (practice) immersive(true) }

    override fun onDestroy() {
        midi.close()
        speaker.close()
        root.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        val MIME = mapOf("html" to "text/html", "js" to "text/javascript", "mjs" to "text/javascript", "css" to "text/css", "json" to "application/json",
            "svg" to "image/svg+xml", "png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "webp" to "image/webp", "ico" to "image/x-icon",
            "mp3" to "audio/mpeg", "wav" to "audio/wav", "ogg" to "audio/ogg", "woff" to "font/woff", "woff2" to "font/woff2", "ttf" to "font/ttf",
            "xml" to "application/xml", "musicxml" to "application/xml", "mxl" to "application/vnd.recordare.musicxml", "webmanifest" to "application/manifest+json", "wasm" to "application/wasm", "txt" to "text/plain")
        const val SCHEME = "com.auxa.academy"
        private const val REQ_MIC = 1
        private const val REQ_FILES = 2
        private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        private val BG = Color.rgb(0x14, 0x16, 0x1c)
    }
}
