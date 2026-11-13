# The web page calls these methods by name.
-keepclassmembers class com.auxa.academy.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
