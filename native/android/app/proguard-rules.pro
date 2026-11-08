# The web page calls these methods by name.
-keepclassmembers class io.github.juliusklahai.maestro.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
