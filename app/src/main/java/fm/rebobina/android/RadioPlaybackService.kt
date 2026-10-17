package fm.rebobina.android

import android.net.Uri
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSession.ControllerInfo
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.LibraryResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class RadioPlaybackService : MediaLibraryService() {
    private lateinit var player: ExoPlayer
    private lateinit var librarySession: MediaLibrarySession
    private val metadataExecutor = Executors.newSingleThreadScheduledExecutor()
    @Volatile private var serviceDestroyed = false
    @Volatile private var currentTitle = STATION_NAME
    @Volatile private var currentArtist = "Radio en vivo"
    @Volatile private var currentArtwork = ""

    private val sessionCallback = object : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(rootItem(), params))

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val items = if (parentId == ROOT_ID && page == 0) {
                listOf(stationItem())
            } else {
                emptyList()
            }
            return Futures.immediateFuture(LibraryResult.ofItemList(items, params))
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            if (mediaId == STATION_ID) {
                Futures.immediateFuture(LibraryResult.ofItem(stationItem(), null))
            } else {
                Futures.immediateFuture(
                    LibraryResult.ofError(
                        androidx.media3.session.SessionError.ERROR_BAD_VALUE,
                    ),
                )
            }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: ControllerInfo,
            mediaItems: List<MediaItem>,
        ): ListenableFuture<List<MediaItem>> =
            Futures.immediateFuture(mediaItems.map { playableStationItem() })
    }

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(AudioAttributes.DEFAULT, true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
        librarySession = MediaLibrarySession.Builder(this, player, sessionCallback).build()
        metadataExecutor.scheduleWithFixedDelay(
            ::refreshNowPlaying,
            0,
            METADATA_INTERVAL_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    override fun onGetSession(controllerInfo: ControllerInfo): MediaLibrarySession =
        librarySession

    private fun rootItem() = MediaItem.Builder()
        .setMediaId(ROOT_ID)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(STATION_NAME)
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .build(),
        )
        .build()

    private fun stationItem() = MediaItem.Builder()
        .setMediaId(STATION_ID)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(currentTitle)
                .setArtist(currentArtist)
                .setArtworkUri(artworkUri())
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .build(),
        )
        .build()

    private fun playableStationItem() = MediaItem.Builder()
        .setMediaId(STATION_ID)
        .setUri(STREAM_URL)
        .setMediaMetadata(stationItem().mediaMetadata)
        .build()

    private fun artworkUri(): Uri = when {
        currentArtwork.startsWith("https://") -> Uri.parse(currentArtwork)
        else -> Uri.parse("android.resource://$packageName/drawable/ic_launcher")
    }

    private fun refreshNowPlaying() {
        var connection: HttpURLConnection? = null
        try {
            connection = URL(NOW_PLAYING_URL).openConnection() as HttpURLConnection
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.setRequestProperty("Accept", "application/json")
            val json = connection.inputStream.bufferedReader().use { it.readText() }
            val response = JSONObject(json)
            val song = response.optJSONObject("now_playing")?.optJSONObject("song")
            val live = response.optJSONObject("live")
            val title = song?.optString("title").orEmpty().ifBlank { STATION_NAME }
            val artist = if (
                live?.optBoolean("is_live") == true &&
                live.optString("streamer_name").isNotBlank()
            ) {
                "En vivo: ${live.optString("streamer_name")}"
            } else {
                song?.optString("artist").orEmpty().ifBlank { "Radio en vivo" }
            }
            val art = song?.optString("art").orEmpty()
                .takeIf { it.startsWith("https://") }
                .orEmpty()

            currentTitle = title
            currentArtist = artist
            currentArtwork = art
            android.os.Handler(player.applicationLooper).post {
                if (serviceDestroyed) return@post
                val index = player.currentMediaItemIndex
                val current = player.currentMediaItem ?: return@post
                val replacement = playableStationItem()
                val currentMetadata = current.mediaMetadata
                val newMetadata = replacement.mediaMetadata
                if (
                    index >= 0 &&
                    (currentMetadata.title != newMetadata.title ||
                        currentMetadata.artist != newMetadata.artist ||
                        currentMetadata.artworkUri != newMetadata.artworkUri)
                ) {
                    player.replaceMediaItem(index, replacement)
                }
            }
        } catch (error: Exception) {
            Log.w(TAG, "No se pudo actualizar la información de la canción.", error)
        } finally {
            connection?.disconnect()
        }
    }

    override fun onDestroy() {
        serviceDestroyed = true
        metadataExecutor.shutdownNow()
        librarySession.release()
        player.release()
        super.onDestroy()
    }

    companion object {
        const val STATION_ID = "rebobina-live"
        private const val ROOT_ID = "rebobina-root"
        private const val STATION_NAME = "Rebobina FM"
        private const val STREAM_URL = "https://a8.asurahosting.com:7710/radio.mp3"
        private const val NOW_PLAYING_URL =
            "https://a8.asurahosting.com/api/nowplaying/rebobina_fm"
        private const val METADATA_INTERVAL_SECONDS = 30L
        private const val TAG = "RebobinaFM"
    }
}
