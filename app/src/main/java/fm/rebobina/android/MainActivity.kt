package fm.rebobina.android

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.webkit.WebViewAssetLoader
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject

class MainActivity : Activity() {
    private var webView: WebView? = null
    private var controller: MediaController? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var pendingPlay = false
    private var playbackError = false

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) playbackError = false
            publishPlayerState()
        }

        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
            publishPlayerState()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_READY) playbackError = false
            publishPlayerState()
        }

        override fun onPlayerError(error: PlaybackException) {
            playbackError = true
            publishPlayerState()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        val page = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(10, 74, 74))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setSupportZoom(false)
            addJavascriptInterface(RadioBridge(), "RebobinaAndroid")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ) = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    val uri = request.url
                    if (uri.host == "appassets.androidplatform.net") return false
                    if (request.isForMainFrame && uri.scheme == "https") {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                    }
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    publishPlayerState()
                }
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(page) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(0, systemBars.top, 0, systemBars.bottom)
            insets
        }
        webView = page
        setContentView(page)
        page.loadUrl("https://appassets.androidplatform.net/assets/web/indexpwa.html")
        connectMediaController()
    }

    private fun connectMediaController() {
        val token = SessionToken(this, ComponentName(this, RadioPlaybackService::class.java))
        val future = MediaController.Builder(this, token).buildAsync()
        controllerFuture = future
        future.addListener(
            {
                if (isFinishing || isDestroyed) return@addListener
                try {
                    controller = future.get().also {
                        it.addListener(playerListener)
                    }
                    publishPlayerState()
                    if (pendingPlay) playRadio()
                } catch (error: Exception) {
                    controllerFuture = null
                    playbackError = true
                    publishPlayerState()
                    android.util.Log.e("RebobinaFM", "No se pudo conectar el reproductor.", error)
                }
            },
            androidx.core.content.ContextCompat.getMainExecutor(this),
        )
    }

    private fun playRadio() {
        val mediaController = controller ?: run {
            pendingPlay = true
            if (controllerFuture == null) connectMediaController()
            return
        }
        pendingPlay = false
        if (mediaController.currentMediaItem?.mediaId != RadioPlaybackService.STATION_ID) {
            mediaController.setMediaItem(
                MediaItem.Builder()
                    .setMediaId(RadioPlaybackService.STATION_ID)
                    .setMediaMetadata(
                        MediaMetadata.Builder()
                            .setTitle("Rebobina FM")
                            .setArtist("Radio en vivo")
                            .build(),
                    )
                    .build(),
            )
        }
        if (mediaController.playbackState == Player.STATE_IDLE ||
            mediaController.playbackState == Player.STATE_ENDED
        ) {
            mediaController.prepare()
        }
        playbackError = false
        mediaController.play()
    }

    private fun publishPlayerState() {
        val page = webView ?: return
        val metadata = controller?.mediaMetadata
        val state = JSONObject()
            .put("title", metadata?.title?.toString() ?: "Rebobina FM")
            .put("artist", metadata?.artist?.toString() ?: "Radio en vivo")
            .put("artwork", metadata?.artworkUri?.toString() ?: "")
            .put("isPlaying", controller?.isPlaying == true)
            .put("error", playbackError)
        page.post {
            page.evaluateJavascript(
                "window.rebobinaNativeUpdate && window.rebobinaNativeUpdate($state)",
                null,
            )
        }
    }

    override fun onDestroy() {
        controller?.removeListener(playerListener)
        controllerFuture?.let(MediaController::releaseFuture)
        webView?.apply {
            removeJavascriptInterface("RebobinaAndroid")
            destroy()
        }
        webView = null
        super.onDestroy()
    }

    inner class RadioBridge {
        @JavascriptInterface
        fun play() = runOnUiThread { playRadio() }

        @JavascriptInterface
        fun pause() = runOnUiThread { controller?.pause() }

        @JavascriptInterface
        fun setVolume(volume: Double) = runOnUiThread {
            controller?.volume = volume.coerceIn(0.0, 1.0).toFloat()
        }
    }
}
