const STREAM_URL = "https://a8.asurahosting.com:7710/radio.mp3";
const NOW_PLAYING_URL = "https://a8.asurahosting.com/api/nowplaying/rebobina_fm";
const DEFAULT_TITLE = "Rebobina FM";
const DEFAULT_ARTIST = "Radio en vivo";
const METADATA_INTERVAL = 30_000;

function createPlayer(container) {
  const audio = document.createElement("audio");
  audio.id = "radio-stream";
  audio.preload = "none";
  audio.setAttribute("playsinline", "");
  const nativePlayback =
    window.RebobinaAndroid &&
    typeof window.RebobinaAndroid.play === "function";
  let isPlaying = false;

  const artwork = document.createElement("img");
  artwork.id = "player-art";
  artwork.alt = "Carátula de la canción actual";
  artwork.hidden = true;

  const info = document.createElement("div");
  info.id = "player-info";

  const title = document.createElement("div");
  title.id = "player-title";
  title.textContent = DEFAULT_TITLE;

  const artist = document.createElement("div");
  artist.id = "player-artist";
  artist.textContent = DEFAULT_ARTIST;

  const status = document.createElement("div");
  status.id = "player-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "En vivo";

  const toggle = document.createElement("button");
  toggle.id = "player-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Reproducir Rebobina FM");
  toggle.setAttribute("aria-pressed", "false");

  const volumeControl = document.createElement("div");
  volumeControl.id = "player-volume-control";

  const volume = document.createElement("input");
  volume.id = "player-volume";
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.step = "1";
  volume.value = String(Math.round(audio.volume * 100));
  volume.setAttribute("aria-label", "Volumen");
  volume.title = "Volumen";

  const volumeLevel = document.createElement("output");
  volumeLevel.id = "player-volume-level";
  volumeLevel.htmlFor = volume.id;
  volumeLevel.textContent = `${volume.value}%`;
  volumeControl.append(volume, volumeLevel);

  info.append(title, artist, status);
  container.replaceChildren(artwork, info, volumeControl, toggle, audio);

  const createPlaybackIcon = (isPlaying) => {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");

    if (isPlaying) {
      const pause = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      pause.setAttribute("d", "M6 5h4v14H6zM14 5h4v14h-4z");
      pause.setAttribute("fill", "currentColor");
      icon.append(pause);
    } else {
      const playIcon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      playIcon.setAttribute("d", "M6 4v16l12-8z");
      playIcon.setAttribute("fill", "currentColor");
      icon.append(playIcon);
    }

    return icon;
  };

  const setPlaybackState = (playing) => {
    isPlaying = playing;
    toggle.replaceChildren(createPlaybackIcon(playing));
    toggle.setAttribute(
      "aria-label",
      playing ? "Pausar Rebobina FM" : "Reproducir Rebobina FM",
    );
    toggle.setAttribute("aria-pressed", String(playing));
    status.textContent = playing ? "EN VIVO" : "Toca para escuchar";

    if (!nativePlayback && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }
  };
  setPlaybackState(false);

  const play = async () => {
    if (nativePlayback) {
      window.RebobinaAndroid.play();
      return;
    }

    try {
      if (!audio.src) audio.src = STREAM_URL;
      await audio.play();
    } catch (error) {
      setPlaybackState(false);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        status.textContent = "Toca ▶ para escuchar";
        return;
      }

      status.textContent = "No se pudo conectar. Toca ▶ para reintentar.";
      console.error("No se pudo iniciar la transmisión de Rebobina FM:", error);
    }
  };

  toggle.addEventListener("click", () => {
    if (!isPlaying) {
      void play();
    } else if (nativePlayback) {
      window.RebobinaAndroid.pause();
    } else {
      audio.pause();
    }
  });

  volume.addEventListener("input", () => {
    const level = Number(volume.value);
    if (nativePlayback) {
      window.RebobinaAndroid.setVolume(level / 100);
    } else {
      audio.volume = level / 100;
    }
    volumeLevel.value = `${level}%`;
    volumeLevel.textContent = `${level}%`;
  });

  if (nativePlayback) {
    window.rebobinaNativeUpdate = (state) => {
      title.textContent = state.title || DEFAULT_TITLE;
      artist.textContent = state.artist || DEFAULT_ARTIST;
      if (typeof state.artwork === "string" && state.artwork.startsWith("https://")) {
        artwork.src = state.artwork;
        artwork.hidden = false;
      }
      setPlaybackState(Boolean(state.isPlaying));
      status.textContent = state.error
        ? "Error de conexión. Toca ▶ para reintentar."
        : state.isPlaying
          ? "EN VIVO"
          : "Toca para escuchar";
    };
  }

  audio.addEventListener("play", () => setPlaybackState(true));
  audio.addEventListener("pause", () => setPlaybackState(false));
  audio.addEventListener("error", () => {
    status.textContent = "Error de conexión. Toca ▶ para reintentar.";
  });

  if (!nativePlayback && "mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => void play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  }

  let currentArtworkUrl = "";
  const updateMetadata = async () => {
    try {
      const response = await fetch(NOW_PLAYING_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`AzuraCast devolvió HTTP ${response.status}.`);
      }

      const data = await response.json();
      const song = data?.now_playing?.song;
      title.textContent = song?.title || DEFAULT_TITLE;
      artist.textContent =
        data?.live?.is_live && data.live.streamer_name
          ? `En vivo: ${data.live.streamer_name}`
          : song?.artist || DEFAULT_ARTIST;

      const artUrl = song?.art;
      if (typeof artUrl === "string" && artUrl !== currentArtworkUrl) {
        const parsedArtUrl = new URL(artUrl);
        if (parsedArtUrl.protocol === "https:") {
          currentArtworkUrl = parsedArtUrl.href;
          artwork.src = parsedArtUrl.href;
          artwork.hidden = false;
        }
      }

      if ("mediaSession" in navigator && "MediaMetadata" in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title.textContent,
          artist: artist.textContent,
          album: song?.album || "Rebobina FM",
          artwork: currentArtworkUrl ? [{ src: currentArtworkUrl }] : [],
        });
      }
    } catch (error) {
      status.textContent = audio.paused
        ? "Toca ▶ para escuchar"
        : "EN VIVO";
      console.error("No se pudo actualizar la información de la canción:", error);
    }
  };

  let metadataInterval;
  const refreshMetadata = () => {
    if (document.hidden) return;

    void updateMetadata();
    window.clearInterval(metadataInterval);
    metadataInterval = window.setInterval(
      refreshMetadata,
      METADATA_INTERVAL,
    );
  };

  if (!nativePlayback) refreshMetadata();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearInterval(metadataInterval);
    } else if (!nativePlayback) {
      refreshMetadata();
    }
  });
}

function initializePlayer() {
  const container = document.querySelector("#player");
  if (!container || container.dataset.initialized === "true") return;

  container.dataset.initialized = "true";
  createPlayer(container);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePlayer, {
    once: true,
  });
} else {
  initializePlayer();
}
