package io.ze.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.net.VpnService
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.URLUtil
import android.widget.Toast
import android.view.ActionMode
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * MainActivity host for VNJAVA APK.
 * Exposes window.AndroidInterface and window.ZeNative JS Bridges for:
 * 1. Native VNPanelService floating 60x60 bubble & overlay menu (TYPE_APPLICATION_OVERLAY)
 * 2. WebView Microphone & Camera permission handling with App Settings redirect if denied
 * 3. In-app WireGuard VPNService, Chat Foreground Service & Background Music Player
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_OPEN_CHAT_ID = "open_chat_id"
        private const val REQ_INITIAL_PERMISSIONS = 1001
        private const val REQ_MEDIA_PERMISSIONS = 1002
        private const val REQ_STORAGE_PERMISSIONS = 1003
        private const val REQ_DOWNLOAD_PERMISSIONS = 1004
        private const val PREF_PERMISSIONS = "vn_permission_prefs"
        private const val KEY_MIC_REQUESTED_ONCE = "mic_requested_once"
        private const val PREF_PERSISTENT = "ze_persistent_prefs"
        private const val KEY_AUTH_TOKEN = "ze_auth_token"
        private const val KEY_AUTH_USER_JSON = "ze_auth_user_json"
        private const val KEY_AI_SETTINGS_PREFIX = "ze_ai_settings_"

        @Volatile
        var isAppInForeground: Boolean = false
            private set
    }

    private data class PendingDownload(
        val downloadId: String,
        val url: String,
        val filename: String,
        val mimeType: String
    )

    private lateinit var webView: WebView
    private var pendingVpnServerCode: String = "SG"
    private var pendingVpnServerIp: String = "103.145.22.84"
    private var pendingVpnPort: Int = 51820
    private var pendingOpenChatId: String? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var micSettingsDialogShowing = false
    private var callAudioFocusRequest: AudioFocusRequest? = null
    private val downloadExecutor = Executors.newCachedThreadPool()
    private var pendingDownloadRequest: PendingDownload? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileChooserCallback
        fileChooserCallback = null
        if (callback == null) return@registerForActivityResult
        var results: Array<Uri>? = null
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val clip = data?.clipData
            if (clip != null && clip.itemCount > 0) {
                results = Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
            } else if (data?.data != null) {
                results = arrayOf(data.data!!)
            }
        }
        callback.onReceiveValue(results)
    }

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            startInAppVpnService(pendingVpnServerCode, pendingVpnServerIp, pendingVpnPort)
        } else {
            notifyWebVpnState(false, pendingVpnServerCode, "")
        }
    }

    private val vpnStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == VPNService.ACTION_STATE_CHANGED) {
                val connected = intent.getBooleanExtra("connected", false)
                val code = intent.getStringExtra("serverCode") ?: "SG"
                val vip = intent.getStringExtra("virtualIp") ?: ""
                notifyWebVpnState(connected, code, vip)
            }
        }
    }

    private val musicControlReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ZeMusicForegroundService.ACTION_CONTROL_BROADCAST) {
                val action = intent.getStringExtra("action") ?: return
                val js = "window.__zeMusicControl && window.__zeMusicControl('$action');"
                webView.post { webView.evaluateJavascript(js, null) }
            }
        }
    }

    private val overlayPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val applyOverlayResult = {
            val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
            val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(VNPanelService.KEY_MENU, granted).apply()
            if (granted) {
                startVnOverlayService(VNPanelService.ACTION_START_MENU)
            }
            notifyWebVnPanelState()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            window.decorView.postDelayed({ applyOverlayResult() }, 300)
        } else {
            applyOverlayResult()
        }
    }

    private val storagePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        notifyWebStoragePermission()
    }

    private val vnPanelSyncReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == VNPanelService.ACTION_VN_PANEL_SYNC) {
                notifyWebVnPanelState()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdgeFullscreen()

        pendingOpenChatId = intent?.getStringExtra(EXTRA_OPEN_CHAT_ID)

        // Minta izin RECORD_AUDIO + notifikasi sebelum WebView dimuat (tidak spam jika user sudah pernah Tolak)
        requestStartupPermissionsIfNeeded()

        webView = WebView(this)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        webView.setBackgroundColor(Color.parseColor("#080808"))
        setContentView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        webView.isLongClickable = false
        webView.isHapticFeedbackEnabled = false
        webView.setOnLongClickListener { true }
        disableTextSelectionRecursively(window.decorView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString VNJAVAAPK/3.0"
        }

        try {
            val cm = CookieManager.getInstance()
            cm.setAcceptCookie(true)
            cm.setAcceptThirdPartyCookies(webView, true)
            cm.flush()
        } catch (_: Throwable) {}

        webView.addJavascriptInterface(AndroidInterfaceBridge(), "AndroidInterface")
        webView.addJavascriptInterface(ZeNativeBridge(), "ZeNative")

        webView.setDownloadListener { url, _, contentDisposition, mimetype, _ ->
            if (!url.isNullOrBlank()) {
                if (url.startsWith("data:", ignoreCase = true)) {
                    val mime = mimetype ?: "application/octet-stream"
                    val ext = if (mime.contains("audio") || mime.contains("mpeg")) "mp3" else if (mime.contains("image")) "jpg" else "mp4"
                    saveBase64ToPublicDownloads(url, "VNJAVA_${System.currentTimeMillis()}.$ext", mime)
                } else {
                    val guessed = URLUtil.guessFileName(url, contentDisposition, mimetype)
                    startNativeStreamingDownload("wv_${System.currentTimeMillis()}", url, guessed, mimetype ?: "video/mp4")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                    fileChooserLauncher.launch(intent)
                    true
                } catch (_: Throwable) {
                    fileChooserCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread {
                    val requestedResources = request.resources ?: arrayOf()
                    val needsAudio = requestedResources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    val needsVideo = requestedResources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)

                    val hasAudio = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED
                    val hasVideo = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED

                    val toAsk = mutableListOf<String>()
                    if (needsAudio && !hasAudio) toAsk.add(Manifest.permission.RECORD_AUDIO)
                    if (needsVideo && !hasVideo) toAsk.add(Manifest.permission.CAMERA)

                    if (toAsk.isEmpty()) {
                        try {
                            request.grant(requestedResources)
                        } catch (_: Throwable) {}
                    } else {
                        pendingWebPermissionRequest = request
                        if (needsAudio && hasPreviouslyDeniedMic() &&
                            !ActivityCompat.shouldShowRequestPermissionRationale(this@MainActivity, Manifest.permission.RECORD_AUDIO)
                        ) {
                            try {
                                request.grant(requestedResources)
                            } catch (_: Throwable) {}
                            pendingWebPermissionRequest = null
                            showMicSettingsDialog()
                        } else {
                            if (needsAudio) markMicRequestedOnce()
                            ActivityCompat.requestPermissions(
                                this@MainActivity,
                                toAsk.toTypedArray(),
                                REQ_MEDIA_PERMISSIONS
                            )
                        }
                    }
                }
            }
        }

        val assetsHandler = WebViewAssetLoader.AssetsPathHandler(this)
        val hasBundledAssets = bundledAssetExists("www/index.html")
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/") { path ->
                val cleanPath = path.trimStart('/')
                val candidate = if (cleanPath.isEmpty()) "www/index.html" else "www/$cleanPath"
                val resolved = if (bundledAssetExists(candidate)) {
                    candidate
                } else if (!cleanPath.startsWith("assets/") && !cleanPath.startsWith("uploads/") && !cleanPath.contains('.')) {
                    "www/index.html"
                } else {
                    candidate
                }
                assetsHandler.handle(resolved)
            }
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val uri = request?.url ?: return null
                if (hasBundledAssets && uri.host == "appassets.androidplatform.net") {
                    return assetLoader.shouldInterceptRequest(uri)
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("intent://")) {
                    try {
                        val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(intent)
                    } catch (_: Throwable) {
                        val fallbackUrl = try {
                            Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                                .getStringExtra("browser_fallback_url")
                        } catch (_: Throwable) {
                            null
                        }
                        if (!fallbackUrl.isNullOrBlank()) {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl)))
                        }
                    }
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pendingOpenChatId?.let { chatId ->
                    dispatchOpenChatToWeb(chatId)
                    pendingOpenChatId = null
                }
            }
        }

        val entryBase = if (hasBundledAssets) {
            "https://appassets.androidplatform.net"
        } else {
            BuildConfig.ZEIO_APP_URL.trimEnd('/')
        }
        val initialUrl = if (!pendingOpenChatId.isNullOrBlank()) {
            "$entryBase/?openChatId=${Uri.encode(pendingOpenChatId)}"
        } else {
            "$entryBase/"
        }
        webView.loadUrl(initialUrl)

        val vpnFilter = IntentFilter(VPNService.ACTION_STATE_CHANGED)
        val musicFilter = IntentFilter(ZeMusicForegroundService.ACTION_CONTROL_BROADCAST)
        val vnFilter = IntentFilter(VNPanelService.ACTION_VN_PANEL_SYNC)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(vpnStateReceiver, vpnFilter, Context.RECEIVER_NOT_EXPORTED)
            registerReceiver(musicControlReceiver, musicFilter, Context.RECEIVER_NOT_EXPORTED)
            registerReceiver(vnPanelSyncReceiver, vnFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(vpnStateReceiver, vpnFilter)
            registerReceiver(musicControlReceiver, musicFilter)
            registerReceiver(vnPanelSyncReceiver, vnFilter)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val chatId = intent.getStringExtra(EXTRA_OPEN_CHAT_ID)
        if (!chatId.isNullOrBlank()) {
            dispatchOpenChatToWeb(chatId)
        }
    }

    override fun onActionModeStarted(mode: ActionMode?) {
        mode?.finish()
        super.onActionModeStarted(mode)
    }

    private fun disableTextSelectionRecursively(root: View?) {
        if (root == null) return
        if (root is TextView) {
            root.setTextIsSelectable(false)
            root.isLongClickable = false
            root.setOnLongClickListener(null)
        }
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                disableTextSelectionRecursively(root.getChildAt(i))
            }
        }
    }

    private fun bundledAssetExists(assetPath: String): Boolean {
        return try {
            assets.open(assetPath).use { true }
        } catch (_: Throwable) {
            false
        }
    }

    private fun enableEdgeToEdgeFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableEdgeToEdgeFullscreen()
        }
    }

    override fun onResume() {
        super.onResume()
        isAppInForeground = true
        enableEdgeToEdgeFullscreen()
        disableTextSelectionRecursively(window.decorView)
        if (::webView.isInitialized) {
            notifyWebStoragePermission()
            notifyWebVnPanelState()
        }
    }

    override fun onPause() {
        isAppInForeground = false
        try {
            CookieManager.getInstance().flush()
        } catch (_: Throwable) {}
        super.onPause()
    }

    override fun onStop() {
        try {
            CookieManager.getInstance().flush()
        } catch (_: Throwable) {}
        super.onStop()
    }

    override fun onDestroy() {
        setCallAudioModeInternal(false, false)
        downloadExecutor.shutdownNow()
        try {
            unregisterReceiver(vpnStateReceiver)
            unregisterReceiver(musicControlReceiver)
            unregisterReceiver(vnPanelSyncReceiver)
        } catch (_: Throwable) {}
        super.onDestroy()
    }

    private fun setCallAudioModeInternal(inCall: Boolean, speakerOn: Boolean) {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            if (inCall) {
                am.mode = AudioManager.MODE_IN_COMMUNICATION
                am.isMicrophoneMute = false
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = speakerOn
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    callAudioFocusRequest?.let { oldReq ->
                        try { am.abandonAudioFocusRequest(oldReq) } catch (_: Throwable) {}
                    }
                    val attrs = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                    val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(attrs)
                        .setWillPauseWhenDucked(false)
                        .build()
                    callAudioFocusRequest = req
                    am.requestAudioFocus(req)
                } else {
                    @Suppress("DEPRECATION")
                    am.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                }
            } else {
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = false
                am.isMicrophoneMute = false
                am.mode = AudioManager.MODE_NORMAL
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    callAudioFocusRequest?.let { req ->
                        try { am.abandonAudioFocusRequest(req) } catch (_: Throwable) {}
                    }
                    callAudioFocusRequest = null
                } else {
                    @Suppress("DEPRECATION")
                    am.abandonAudioFocus(null)
                }
            }
        } catch (_: Throwable) {}
    }

    private fun markMicRequestedOnce() {
        getSharedPreferences(PREF_PERMISSIONS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_MIC_REQUESTED_ONCE, true)
            .apply()
    }

    private fun hasPreviouslyDeniedMic(): Boolean {
        val micGranted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (micGranted) return false
        val askedBefore = getSharedPreferences(PREF_PERMISSIONS, Context.MODE_PRIVATE)
            .getBoolean(KEY_MIC_REQUESTED_ONCE, false)
        return askedBefore || ActivityCompat.shouldShowRequestPermissionRationale(
            this,
            Manifest.permission.RECORD_AUDIO
        )
    }

    private fun showMicSettingsDialog() {
        if (micSettingsDialogShowing || isFinishing) return
        micSettingsDialogShowing = true
        AlertDialog.Builder(this)
            .setTitle("Izin Mikrofon Diperlukan")
            .setMessage("Izin mikrofon ditolak, buka Pengaturan > Aplikasi > VNJAVA > Izin > Mikrofon > Izinkan")
            .setPositiveButton("Buka Pengaturan") { _, _ ->
                micSettingsDialogShowing = false
                try {
                    val intent = Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:$packageName")
                    )
                    startActivity(intent)
                } catch (_: Throwable) {}
            }
            .setNegativeButton("Tutup") { _, _ ->
                micSettingsDialogShowing = false
            }
            .setOnDismissListener {
                micSettingsDialogShowing = false
            }
            .show()
    }

    private fun requestStartupPermissionsIfNeeded() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_IMAGES)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_VIDEO)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_AUDIO)
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
            ) {
                perms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
        val micMissing = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) != PackageManager.PERMISSION_GRANTED
        if (micMissing && !hasPreviouslyDeniedMic()) {
            markMicRequestedOnce()
            perms.add(Manifest.permission.RECORD_AUDIO)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.CAMERA)
        }
        if (perms.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, perms.toTypedArray(), REQ_INITIAL_PERMISSIONS)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_MEDIA_PERMISSIONS) {
            val req = pendingWebPermissionRequest
            pendingWebPermissionRequest = null
            val micGranted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
            if (req != null) {
                try {
                    req.grant(req.resources)
                } catch (_: Throwable) {}
            }
            if (!micGranted && permissions.contains(Manifest.permission.RECORD_AUDIO)) {
                showMicSettingsDialog()
            }
        } else if (requestCode == REQ_STORAGE_PERMISSIONS) {
            notifyWebStoragePermission()
        } else if (requestCode == REQ_DOWNLOAD_PERMISSIONS) {
            val req = pendingDownloadRequest
            pendingDownloadRequest = null
            if (req != null) {
                val writeNeeded = Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                val writeGranted = !writeNeeded || ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
                if (!writeGranted) {
                    dispatchDownloadProgressToWeb(
                        req.downloadId,
                        0,
                        "error",
                        "Izin penyimpanan ditolak. Aktifkan izin Penyimpanan di Pengaturan > Aplikasi > VNJAVA.",
                        ""
                    )
                } else {
                    executeNativeStreamingDownload(req)
                }
            }
        }
    }

    private fun startInAppVpnService(serverCode: String, serverIp: String, port: Int) {
        val intent = Intent(this, VPNService::class.java).apply {
            action = VPNService.ACTION_CONNECT
            putExtra(VPNService.EXTRA_SERVER_CODE, serverCode)
            putExtra(VPNService.EXTRA_SERVER_IP, serverIp)
            putExtra(VPNService.EXTRA_SERVER_PORT, port)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun notifyWebVpnState(connected: Boolean, serverCode: String, virtualIp: String) {
        val safeCode = serverCode.replace("'", "")
        val safeIp = virtualIp.replace("'", "")
        val js = "window.dispatchEvent(new CustomEvent('ze-native-vpn-state',{detail:{connected:$connected,serverCode:'$safeCode',virtualIp:'$safeIp'}}));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun dispatchOpenChatToWeb(chatId: String) {
        val safeId = chatId.replace("'", "\\'")
        val js = "window.__zeOpenChatById && window.__zeOpenChatById('$safeId');"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun startVnOverlayService(actionStr: String) {
        val svcIntent = Intent(this, VNPanelService::class.java).apply {
            action = actionStr
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svcIntent)
        } else {
            startService(svcIntent)
        }
    }

    private fun handleFloatingMenuToggle(enabled: Boolean) {
        runOnUiThread {
            val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
            if (enabled) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this@MainActivity)) {
                    prefs.edit().putBoolean(VNPanelService.KEY_MENU, false).apply()
                    val permIntent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                    overlayPermissionLauncher.launch(permIntent)
                } else {
                    prefs.edit().putBoolean(VNPanelService.KEY_MENU, true).apply()
                    startVnOverlayService(VNPanelService.ACTION_START_MENU)
                }
            } else {
                prefs.edit().putBoolean(VNPanelService.KEY_MENU, false).apply()
                startVnOverlayService(VNPanelService.ACTION_STOP_MENU)
            }
        }
    }

    private fun notifyWebVnPanelState() {
        val p = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
        val p90 = p.getBoolean(VNPanelService.KEY_90, false)
        val bypass = p.getBoolean(VNPanelService.KEY_BYPASS, false)
        val crosshair = p.getBoolean(VNPanelService.KEY_CROSSHAIR, false)
        val menu = p.getBoolean(VNPanelService.KEY_MENU, false)
        val js = "window.dispatchEvent(new CustomEvent('ze-native-vn-panel-sync',{detail:{is90Enabled:$p90,isBypassEnabled:$bypass,isCrosshairEnabled:$crosshair,isMenuEnabled:$menu}}));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun isStorageAccessGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun launchStoragePermissionPrompt() {
        runOnUiThread {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                if (!Environment.isExternalStorageManager()) {
                    try {
                        val intent = Intent(
                            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                            Uri.parse("package:$packageName")
                        )
                        storagePermissionLauncher.launch(intent)
                    } catch (_: Throwable) {
                        try {
                            val fallbackIntent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                            storagePermissionLauncher.launch(fallbackIntent)
                        } catch (_: Throwable) {}
                    }
                } else {
                    notifyWebStoragePermission()
                }
            } else {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(
                        Manifest.permission.READ_EXTERNAL_STORAGE,
                        Manifest.permission.WRITE_EXTERNAL_STORAGE
                    ),
                    REQ_STORAGE_PERMISSIONS
                )
            }
        }
    }

    private fun notifyWebStoragePermission() {
        val granted = isStorageAccessGranted()
        val js = "window.dispatchEvent(new CustomEvent('ze-native-storage-permission',{detail:{granted:$granted}}));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun findExistingNamedFile(rootDir: File, targetFileName: String, maxDepth: Int = 5): File? {
        if (maxDepth < 0 || !rootDir.exists() || !rootDir.isDirectory) return null
        val direct = File(rootDir, targetFileName)
        if (direct.exists() && direct.isFile) return direct
        val children = rootDir.listFiles() ?: return null
        for (child in children) {
            if (child.isDirectory) {
                val found = findExistingNamedFile(child, targetFileName, maxDepth - 1)
                if (found != null) return found
            }
        }
        return null
    }

    inner class AndroidInterfaceBridge {
        @JavascriptInterface
        fun startFloatingMenu() {
            handleFloatingMenuToggle(true)
        }

        @JavascriptInterface
        fun stopFloatingMenu() {
            handleFloatingMenuToggle(false)
        }

        @JavascriptInterface
        fun openFreeFire(): String {
            return VNPanelService.launchFreeFireOrStore(this@MainActivity)
        }

        @JavascriptInterface
        fun openMobileLegends(): String {
            val pkg = "com.mobile.legends"
            val launchIntent = try {
                packageManager.getLaunchIntentForPackage(pkg)
            } catch (_: Throwable) {
                null
            }
            if (launchIntent != null) {
                try {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                    startActivity(launchIntent)
                    return pkg
                } catch (_: Throwable) {}
            }
            try {
                val marketIntent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=com.mobile.legends")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(marketIntent)
            } catch (_: Throwable) {}
            return "playstore"
        }

        @JavascriptInterface
        fun hasStoragePermission(): Boolean {
            return isStorageAccessGranted()
        }

        @JavascriptInterface
        fun requestStoragePermission() {
            launchStoragePermissionPrompt()
        }

        @JavascriptInterface
        fun writeFileToAndroidData(targetSubdir: String, fileName: String, base64Content: String): String {
            val res = JSONObject()
            if (!isStorageAccessGranted()) {
                launchStoragePermissionPrompt()
                res.put("success", false)
                res.put("needsPermission", true)
                res.put("message", "Izin penyimpanan penuh Android/data diperlukan")
                return res.toString()
            }

            val cleanName = fileName.trim().substringAfterLast('/').substringAfterLast('\\')
            if (cleanName.isBlank()) {
                res.put("success", false)
                res.put("message", "Nama file tidak valid")
                return res.toString()
            }

            return try {
                val decodedBytes = Base64.decode(base64Content, Base64.DEFAULT)
                val extRoot = Environment.getExternalStorageDirectory()
                val androidDataRoot = File(extRoot, "Android/data")
                if (!androidDataRoot.exists()) {
                    androidDataRoot.mkdirs()
                }

                val cleanSubdir = targetSubdir.trim().trim('/')
                val targetDir = if (cleanSubdir.isNotEmpty()) {
                    File(androidDataRoot, cleanSubdir)
                } else {
                    File(androidDataRoot, "com.dts.freefireth/files")
                }

                // Cek apakah sudah ada file dengan nama yang sama di Android/data untuk ditimpa langsung
                val existingMatch = findExistingNamedFile(targetDir, cleanName)
                    ?: findExistingNamedFile(androidDataRoot, cleanName)

                val outFile = existingMatch ?: run {
                    if (!targetDir.exists()) targetDir.mkdirs()
                    File(targetDir, cleanName)
                }
                val wasExisting = outFile.exists()
                outFile.parentFile?.mkdirs()
                outFile.writeBytes(decodedBytes)

                res.put("success", true)
                res.put("overwritten", wasExisting)
                res.put("path", outFile.absolutePath)
                res.put("bytes", decodedBytes.size)
                res.toString()
            } catch (e: Throwable) {
                res.put("success", false)
                res.put("message", e.message ?: "Gagal menulis ke Android/data")
                res.toString()
            }
        }

        @JavascriptInterface
        fun showMicDeniedDialog() {
            runOnUiThread {
                val micGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED
                if (!micGranted) {
                    if (hasPreviouslyDeniedMic()) {
                        showMicSettingsDialog()
                    } else {
                        markMicRequestedOnce()
                        ActivityCompat.requestPermissions(
                            this@MainActivity,
                            arrayOf(Manifest.permission.RECORD_AUDIO),
                            REQ_MEDIA_PERMISSIONS
                        )
                    }
                }
            }
        }
    }

    inner class ZeNativeBridge {
        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread { requestStartupPermissionsIfNeeded() }
        }

        @JavascriptInterface
        fun showMicDeniedDialog() {
            AndroidInterfaceBridge().showMicDeniedDialog()
        }

        @JavascriptInterface
        fun setCallAudioMode(inCall: Boolean, speakerOn: Boolean) {
            runOnUiThread { setCallAudioModeInternal(inCall, speakerOn) }
        }

        @JavascriptInterface
        fun ensureCallAudioPermissions(): Boolean {
            val hasMic = ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
            if (!hasMic) {
                runOnUiThread {
                    markMicRequestedOnce()
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.RECORD_AUDIO),
                        REQ_MEDIA_PERMISSIONS
                    )
                }
            }
            return hasMic
        }

        @JavascriptInterface
        fun connectVpn(serverCode: String, serverIp: String, port: Int, killSwitch: Boolean) {
            pendingVpnServerCode = serverCode.ifBlank { "SG" }
            pendingVpnServerIp = serverIp.ifBlank { "103.145.22.84" }
            pendingVpnPort = if (port > 0) port else 51820

            runOnUiThread {
                val prepareIntent = VpnService.prepare(this@MainActivity)
                if (prepareIntent != null) {
                    vpnPermissionLauncher.launch(prepareIntent)
                } else {
                    startInAppVpnService(pendingVpnServerCode, pendingVpnServerIp, pendingVpnPort)
                }
            }
        }

        @JavascriptInterface
        fun disconnectVpn() {
            val intent = Intent(this@MainActivity, VPNService::class.java).apply {
                action = VPNService.ACTION_DISCONNECT
            }
            startService(intent)
        }

        @JavascriptInterface
        fun openApp(packageNameStr: String): Boolean {
            val targetPkg = if (packageNameStr.isBlank()) "com.mobile.legends" else packageNameStr
            val launchIntent = packageManager.getLaunchIntentForPackage(targetPkg)
            if (launchIntent != null) {
                return try {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(launchIntent)
                    true
                } catch (_: Throwable) {
                    false
                }
            }
            return false
        }

        @JavascriptInterface
        fun setUserSession(userId: String, userName: String, serverOrigin: String) {
            val cleanedOrigin = serverOrigin.trim()
            val resolvedServerUrl = if (
                cleanedOrigin.isBlank() ||
                cleanedOrigin.contains("appassets.androidplatform.net", ignoreCase = true)
            ) {
                BuildConfig.ZEIO_APP_URL
            } else {
                cleanedOrigin
            }

            val prefs = getSharedPreferences(ZeChatForegroundService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(ZeChatForegroundService.KEY_USER_ID, userId)
                .putString(ZeChatForegroundService.KEY_USER_NAME, userName)
                .putString(ZeChatForegroundService.KEY_SERVER_URL, resolvedServerUrl)
                .apply()

            if (userId.isNotBlank()) {
                val svcIntent = Intent(this@MainActivity, ZeChatForegroundService::class.java).apply {
                    putExtra(ZeChatForegroundService.EXTRA_USER_ID, userId)
                    putExtra(ZeChatForegroundService.EXTRA_SERVER_URL, resolvedServerUrl)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(svcIntent)
                } else {
                    startService(svcIntent)
                }
            }
        }

        @JavascriptInterface
        fun showChatNotification(chatId: String, senderName: String, messageText: String, senderPhoto: String) {
            ZeChatForegroundService.showChatNotification(
                applicationContext,
                chatId,
                senderName,
                messageText
            )
        }

        @JavascriptInterface
        fun updateMusicNotification(
            title: String,
            artist: String,
            coverUrl: String,
            audioUrl: String,
            isPlaying: Boolean
        ) {
            val svcIntent = Intent(this@MainActivity, ZeMusicForegroundService::class.java).apply {
                action = ZeMusicForegroundService.ACTION_UPDATE
                putExtra(ZeMusicForegroundService.EXTRA_TITLE, title)
                putExtra(ZeMusicForegroundService.EXTRA_ARTIST, artist)
                putExtra(ZeMusicForegroundService.EXTRA_COVER, coverUrl)
                putExtra(ZeMusicForegroundService.EXTRA_AUDIO_URL, audioUrl)
                putExtra(ZeMusicForegroundService.EXTRA_IS_PLAYING, isPlaying)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svcIntent)
            } else {
                startService(svcIntent)
            }
        }

        @JavascriptInterface
        fun stopMusicNotification() {
            val svcIntent = Intent(this@MainActivity, ZeMusicForegroundService::class.java).apply {
                action = ZeMusicForegroundService.ACTION_STOP
            }
            startService(svcIntent)
        }

        @JavascriptInterface
        fun canDrawOverlays(): Boolean {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)
        }

        @JavascriptInterface
        fun setFloatingMenu(enabled: Boolean) {
            handleFloatingMenuToggle(enabled)
        }

        @JavascriptInterface
        fun setCrosshair(enabled: Boolean) {
            runOnUiThread {
                val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().putBoolean(VNPanelService.KEY_CROSSHAIR, enabled).apply()
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)) {
                    if (enabled || prefs.getBoolean(VNPanelService.KEY_MENU, false)) {
                        startVnOverlayService(VNPanelService.ACTION_UPDATE_STATE)
                    } else {
                        startVnOverlayService(VNPanelService.ACTION_STOP_MENU)
                    }
                }
            }
        }

        @JavascriptInterface
        fun syncVnPanelState(
            p90: Boolean,
            bypass: Boolean,
            crosshair: Boolean,
            menu: Boolean,
            customFileName: String,
            owner90Name: String,
            ownerBypassName: String
        ) {
            val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean(VNPanelService.KEY_90, p90)
                .putBoolean(VNPanelService.KEY_BYPASS, bypass)
                .putBoolean(VNPanelService.KEY_CROSSHAIR, crosshair)
                .putBoolean(VNPanelService.KEY_MENU, menu)
                .putString(VNPanelService.KEY_CUSTOM_FILE, customFileName)
                .putString(VNPanelService.KEY_OWNER_90, owner90Name)
                .putString(VNPanelService.KEY_OWNER_BYPASS, ownerBypassName)
                .apply()

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)) {
                if (menu || crosshair) {
                    startVnOverlayService(VNPanelService.ACTION_UPDATE_STATE)
                }
            }
        }

        @JavascriptInterface
        fun playFreeFire(): String {
            return VNPanelService.launchFreeFireOrStore(applicationContext)
        }

        @JavascriptInterface
        fun getApiBaseUrl(): String {
            return BuildConfig.ZEIO_APP_URL
        }

        @JavascriptInterface
        fun downloadMediaFile(url: String, filename: String, mimeType: String): Boolean {
            val id = "dl_${System.currentTimeMillis()}"
            return startNativeStreamingDownload(id, url, filename, mimeType)
        }

        @JavascriptInterface
        fun downloadMediaWithProgress(downloadId: String, url: String, filename: String, mimeType: String): Boolean {
            return startNativeStreamingDownload(downloadId, url, filename, mimeType)
        }

        @JavascriptInterface
        fun openNativeGallery(mimeType: String): Boolean {
            return openDeviceGallery(mimeType)
        }

        @JavascriptInterface
        fun saveBase64ToDownloads(base64Data: String, filename: String, mimeType: String): Boolean {
            return saveBase64ToPublicDownloads(base64Data, filename, mimeType)
        }

        @JavascriptInterface
        fun saveAuthSession(token: String, userJson: String) {
            val prefs = getSharedPreferences(PREF_PERSISTENT, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(KEY_AUTH_TOKEN, token)
                .putString(KEY_AUTH_USER_JSON, userJson)
                .commit()
        }

        @JavascriptInterface
        fun getAuthToken(): String {
            return getSharedPreferences(PREF_PERSISTENT, Context.MODE_PRIVATE)
                .getString(KEY_AUTH_TOKEN, "") ?: ""
        }

        @JavascriptInterface
        fun getSavedUserJson(): String {
            return getSharedPreferences(PREF_PERSISTENT, Context.MODE_PRIVATE)
                .getString(KEY_AUTH_USER_JSON, "") ?: ""
        }

        @JavascriptInterface
        fun clearAuthSession() {
            val prefs = getSharedPreferences(PREF_PERSISTENT, Context.MODE_PRIVATE)
            prefs.edit()
                .remove(KEY_AUTH_TOKEN)
                .remove(KEY_AUTH_USER_JSON)
                .commit()
        }

        @JavascriptInterface
        fun saveAiSettings(userId: String, settingsJson: String) {
            val cleanId = userId.ifBlank { "default" }.trim()
            val prefs = getSharedPreferences(PREF_PERSISTENT, Context.MODE_PRIVATE)
            prefs.edit()
                .putString("$KEY_AI_SETTINGS_PREFIX$cleanId", settingsJson)
                .putString("${KEY_AI_SETTINGS_PREFIX}latest", settingsJson)
                .commit()
        }

        @JavascriptInterface
        fun getAiSettings(userId: String): String {
            val cleanId = userId.ifBlank { "default" }.trim()
            val prefs = getSharedPreferences(PREF_PERSISTENT, Context.MODE_PRIVATE)
            return prefs.getString("$KEY_AI_SETTINGS_PREFIX$cleanId", null)
                ?: prefs.getString("${KEY_AI_SETTINGS_PREFIX}latest", "")
                ?: ""
        }

        @JavascriptInterface
        fun setScreenOrientation(mode: String) {
            runOnUiThread {
                val target = when (mode.lowercase()) {
                    "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
                requestedOrientation = target
            }
        }
    }

    private fun dispatchDownloadProgressToWeb(
        downloadId: String,
        progress: Int,
        status: String,
        message: String,
        savedLocation: String
    ) {
        if (!::webView.isInitialized) return
        val safeId = JSONObject.quote(downloadId)
        val safeStatus = JSONObject.quote(status)
        val safeMsg = JSONObject.quote(message)
        val safeLoc = JSONObject.quote(savedLocation)
        val js = "window.__zeNativeDownloadProgress && window.__zeNativeDownloadProgress($safeId, $progress, $safeStatus, $safeMsg, $safeLoc);"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun openDeviceGallery(mimeType: String): Boolean {
        return try {
            val targetUri = when {
                mimeType.contains("image", true) -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                mimeType.contains("audio", true) -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                else -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            }
            val viewIntent = Intent(Intent.ACTION_VIEW, targetUri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                startActivity(viewIntent)
                return true
            } catch (_: Throwable) {}

            val galleryIntent = Intent.makeMainSelectorActivity(
                Intent.ACTION_MAIN,
                Intent.CATEGORY_APP_GALLERY
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(galleryIntent)
            true
        } catch (_: Throwable) {
            false
        }
    }

    private fun startNativeStreamingDownload(
        downloadId: String,
        url: String,
        filename: String,
        mimeType: String
    ): Boolean {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            dispatchDownloadProgressToWeb(downloadId, 0, "error", "URL video/audio tidak valid", "")
            return false
        }

        val req = PendingDownload(downloadId, url, filename, mimeType.ifBlank { "video/mp4" })

        val missingPerms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                missingPerms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val mediaPerm = when {
                req.mimeType.startsWith("audio", true) -> Manifest.permission.READ_MEDIA_AUDIO
                req.mimeType.startsWith("image", true) -> Manifest.permission.READ_MEDIA_IMAGES
                else -> Manifest.permission.READ_MEDIA_VIDEO
            }
            if (ContextCompat.checkSelfPermission(this, mediaPerm) != PackageManager.PERMISSION_GRANTED &&
                !ActivityCompat.shouldShowRequestPermissionRationale(this, mediaPerm)
            ) {
                missingPerms.add(mediaPerm)
            }
        }

        if (missingPerms.isNotEmpty() && Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            pendingDownloadRequest = req
            runOnUiThread {
                ActivityCompat.requestPermissions(this, missingPerms.toTypedArray(), REQ_DOWNLOAD_PERMISSIONS)
            }
            return true
        }

        executeNativeStreamingDownload(req)
        return true
    }

    private fun executeNativeStreamingDownload(req: PendingDownload) {
        dispatchDownloadProgressToWeb(req.downloadId, 2, "progress", "Menghubungkan ke server media...", "")
        downloadExecutor.execute {
            var conn: HttpURLConnection? = null
            var tempFile: File? = null
            try {
                var currentUrl = req.url
                var redirects = 0
                while (redirects < 6) {
                    val urlObj = URL(currentUrl)
                    val c = (urlObj.openConnection() as HttpURLConnection).apply {
                        instanceFollowRedirects = false
                        connectTimeout = 15000
                        readTimeout = 45000
                        requestMethod = "GET"
                        setRequestProperty(
                            "User-Agent",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                        )
                        setRequestProperty("Referer", "https://www.tiktok.com/")
                        setRequestProperty("Accept", "*/*")
                    }
                    c.connect()
                    val code = c.responseCode
                    if (code in listOf(
                            HttpURLConnection.HTTP_MOVED_PERM,
                            HttpURLConnection.HTTP_MOVED_TEMP,
                            HttpURLConnection.HTTP_SEE_OTHER,
                            307,
                            308
                        )
                    ) {
                        val loc = c.getHeaderField("Location")
                        c.disconnect()
                        if (loc.isNullOrBlank()) throw IllegalStateException("Redirect URL kosong")
                        currentUrl = URL(urlObj, loc).toString()
                        redirects++
                        continue
                    }
                    conn = c
                    break
                }

                val activeConn = conn ?: throw IllegalStateException("Gagal membuat koneksi HTTP")
                val status = activeConn.responseCode
                if (status !in 200..299) {
                    throw IllegalStateException("Server media merespons HTTP $status")
                }

                val serverMime = activeConn.contentType ?: req.mimeType
                if (serverMime.contains("text/html", ignoreCase = true)) {
                    throw IllegalStateException("Link TikTok tidak mengembalikan file media valid (HTML)")
                }

                val totalBytes = activeConn.contentLengthLong
                val safeMime = if (serverMime.isNotBlank() && !serverMime.contains("octet-stream")) {
                    serverMime.substringBefore(';').trim()
                } else {
                    req.mimeType
                }
                val isAudio = safeMime.startsWith("audio", true) || req.filename.endsWith(".mp3", true)
                val isImage = safeMime.startsWith("image", true)
                val fallbackExt = when {
                    isAudio -> "mp3"
                    isImage -> "jpg"
                    else -> "mp4"
                }
                var safeName = req.filename.replace("[^a-zA-Z0-9._-]".toRegex(), "_")
                if (safeName.isBlank()) {
                    safeName = "VNJAVA_${System.currentTimeMillis()}.$fallbackExt"
                } else if (!safeName.contains('.')) {
                    safeName = "$safeName.$fallbackExt"
                }

                tempFile = File(cacheDir, "dl_tmp_${System.currentTimeMillis()}_$safeName")
                BufferedInputStream(activeConn.inputStream, 16384).use { input ->
                    FileOutputStream(tempFile).use { out ->
                        val buffer = ByteArray(16384)
                        var downloaded = 0L
                        var lastReportAt = 0L
                        var lastPct = -1
                        while (true) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            out.write(buffer, 0, read)
                            downloaded += read
                            val now = System.currentTimeMillis()
                            val pct = if (totalBytes > 0) {
                                ((downloaded * 95L) / totalBytes).toInt().coerceIn(5, 95)
                            } else {
                                (5 + (downloaded / (128 * 1024L)).toInt() * 4).coerceAtMost(90)
                            }
                            if (pct != lastPct && (now - lastReportAt >= 120 || pct >= 95)) {
                                lastPct = pct
                                lastReportAt = now
                                dispatchDownloadProgressToWeb(
                                    req.downloadId,
                                    pct,
                                    "progress",
                                    "Mengunduh... $pct%",
                                    ""
                                )
                            }
                        }
                        out.flush()
                    }
                }

                if (!tempFile.exists() || tempFile.length() < 512) {
                    throw IllegalStateException("File hasil download kosong atau korup")
                }

                dispatchDownloadProgressToWeb(req.downloadId, 97, "progress", "Menyimpan ke Galeri...", "")

                val savedLocationLabel = saveFileToGalleryAndScan(tempFile, safeName, safeMime, isAudio, isImage)

                dispatchDownloadProgressToWeb(
                    req.downloadId,
                    100,
                    "done",
                    if (isAudio) "Tersimpan di Musik / Download" else "Tersimpan di Galeri",
                    savedLocationLabel
                )
                runOnUiThread {
                    val toastLabel = if (isAudio) "Tersimpan di Musik: $safeName" else "Video tersimpan di Galeri: $safeName"
                    Toast.makeText(this, toastLabel, Toast.LENGTH_SHORT).show()
                }
            } catch (e: Throwable) {
                val errMsg = e.message?.takeIf { it.isNotBlank() } ?: "Gagal mengunduh file media"
                dispatchDownloadProgressToWeb(req.downloadId, 0, "error", errMsg, "")
                runOnUiThread {
                    Toast.makeText(this, "Download gagal: $errMsg", Toast.LENGTH_SHORT).show()
                }
            } finally {
                try { conn?.disconnect() } catch (_: Throwable) {}
                try { tempFile?.delete() } catch (_: Throwable) {}
            }
        }
    }

    private fun saveFileToGalleryAndScan(
        srcFile: File,
        safeName: String,
        mimeType: String,
        isAudio: Boolean,
        isImage: Boolean
    ): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val collectionUri = when {
                isAudio -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                isImage -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                else -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            }
            val relDir = when {
                isAudio -> "${Environment.DIRECTORY_MUSIC}/VNJAVA"
                isImage -> "${Environment.DIRECTORY_PICTURES}/VNJAVA"
                else -> "${Environment.DIRECTORY_DCIM}/VNJAVA"
            }
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, relDir)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(collectionUri, values)
                ?: throw IllegalStateException("Gagal membuat entri MediaStore Galeri")
            try {
                val outStream: OutputStream = contentResolver.openOutputStream(uri)
                    ?: throw IllegalStateException("Gagal membuka stream Galeri")
                outStream.use { out ->
                    srcFile.inputStream().use { inp -> inp.copyTo(out) }
                }
                val doneValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                contentResolver.update(uri, doneValues, null, null)
                return relDir
            } catch (err: Throwable) {
                try { contentResolver.delete(uri, null, null) } catch (_: Throwable) {}
                throw err
            }
        } else {
            val baseDir = when {
                isAudio -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
                isImage -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                else -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM)
            }
            val outDir = File(baseDir, "VNJAVA")
            if (!outDir.exists()) outDir.mkdirs()
            val outFile = File(outDir, safeName)
            srcFile.inputStream().use { inp ->
                FileOutputStream(outFile).use { out -> inp.copyTo(out) }
            }
            MediaScannerConnection.scanFile(this, arrayOf(outFile.absolutePath), arrayOf(mimeType), null)
            return outFile.absolutePath
        }
    }

    private fun saveBase64ToPublicDownloads(
        base64Data: String,
        filename: String,
        mimeType: String
    ): Boolean {
        return try {
            val cleanB64 = base64Data.substringAfter("base64,").replace("\\s+".toRegex(), "")
            val bytes = Base64.decode(cleanB64, Base64.DEFAULT)
            if (bytes.isEmpty()) return false
            val safeName = filename.replace("[^a-zA-Z0-9._-]".toRegex(), "_")
                .ifBlank { "VNJAVA_${System.currentTimeMillis()}.mp4" }
            val safeMime = mimeType.ifBlank { "video/mp4" }
            val isAudio = safeMime.startsWith("audio", true)
            val isImage = safeMime.startsWith("image", true)
            val isVideo = safeMime.startsWith("video", true)

            if (isAudio || isImage || isVideo) {
                val tmp = File(cacheDir, "b64_${System.currentTimeMillis()}_$safeName")
                try {
                    tmp.writeBytes(bytes)
                    saveFileToGalleryAndScan(tmp, safeName, safeMime, isAudio, isImage)
                } finally {
                    try { tmp.delete() } catch (_: Throwable) {}
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                    put(MediaStore.Downloads.MIME_TYPE, safeMime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return false
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
            } else {
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!dir.exists()) dir.mkdirs()
                val outFile = File(dir, safeName)
                outFile.writeBytes(bytes)
                MediaScannerConnection.scanFile(this, arrayOf(outFile.absolutePath), arrayOf(safeMime), null)
            }

            runOnUiThread {
                val label = if (isVideo || isImage) "Tersimpan di Galeri: $safeName" else "Tersimpan ke Download: $safeName"
                Toast.makeText(this, label, Toast.LENGTH_SHORT).show()
            }
            true
        } catch (_: Throwable) {
            false
        }
    }
}
