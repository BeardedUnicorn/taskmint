# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# TaskMint: the status bar bridge MainActivity adds to the webview, which
# the page calls by name (window.TaskMintSystemBars.setTheme)
-keepclassmembers class com.taskmint.android.MainActivity$SystemBars {
   @android.webkit.JavascriptInterface public <methods>;
}
# and the Google sign-in and Analytics bridges (window.TaskMintGoogleSignIn,
# window.TaskMintAnalytics)
-keepclassmembers class com.taskmint.android.MainActivity$GoogleSignIn {
   @android.webkit.JavascriptInterface public <methods>;
}
-keepclassmembers class com.taskmint.android.MainActivity$Analytics {
   @android.webkit.JavascriptInterface public <methods>;
}
# Credential Manager finds its Play services provider by reflection
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile