// Maestro Academy for Android: a small native app around the Maestro web app.
// No third-party libraries: only the Android SDK (WebView, MIDI, window and audio APIs) and Kotlin.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.auxa.academy"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.auxa.academy"
        minSdk = 26
        targetSdk = 36
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "0.1.0"
        // The app opens this address (the preview while we test; the live site at launch).
        buildConfigField("String", "START_URL", "\"${System.getenv("START_URL") ?: "https://juliusklahai.github.io/Auxa-academy/preview/"}\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        // Test builds: one shared TEST key kept in the repo, so each new test build installs over the last.
        // Never used for the Play Store (that uses a private key from GitHub secrets, below).
        getByName("debug") {
            storeFile = rootProject.file("test-signing.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        // Release key from GitHub secrets when present; otherwise builds are signed with the test key.
        create("release") {
            val ks = System.getenv("ANDROID_KEYSTORE_FILE")
            if (ks != null && file(ks).exists()) {
                storeFile = file(ks)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            val rel = signingConfigs.getByName("release")
            signingConfig = if (rel.storeFile != null) rel else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
