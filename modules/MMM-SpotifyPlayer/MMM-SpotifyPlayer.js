Module.register("MMM-SpotifyPlayer", {
	defaults: {
		nowPlayingEndpoint: "remote/spotify/now-playing",
		controlEndpoint: "remote/spotify/control",
		pollIntervalMs: 7000,
		authStorageKey: "intelliglass-spotify-auth",
		useBrowserSessionAuthFallback: true,
		showAlbumArt: true,
		playPreviewAudio: false,
		controlSlideIndex: null,
		activationKey: "ArrowUp",
		secondaryActivationKey: "ArrowDown",
		controlWindowMs: 5000,
		spotifyKeyMode: "SPOTIFY",
		gestureControlsEnabled: true,
		emptyTitle: "Spotify not connected",
		emptyArtist: "Connect Spotify from RemoteApp"
	},

	start () {
		this.pollTimer = null;
		this.lastTrackId = "";
		this.track = null;
		this.emptyState = {
			title: this.config.emptyTitle,
			artist: this.config.emptyArtist,
			status: "Not connected"
		};
		this.currentCarouselSlideIndex = 0;
		this.hasPlaybackFocus = false;
		this.playbackFocusTimer = null;
		this.startPolling();
	},

	getStyles () {
		return ["MMM-SpotifyPlayer.css"];
	},

	suspend () {
		this.stopPolling();
	},

	resume () {
		this.startPolling();
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-spotify-player";
		if (this.hasPlaybackFocus) {
			wrapper.classList.add("is-armed");
		}

		const body = document.createElement("div");
		body.className = "mmm-spotify-player-body";

		const indicator = document.createElement("div");
		indicator.className = "mmm-spotify-player-indicator";
		indicator.title = this.hasPlaybackFocus
			? "Spotify is armed for the next gesture"
			: "";
		body.appendChild(indicator);

		if (this.config.showAlbumArt) {
			const artworkWrap = document.createElement("div");
			artworkWrap.className = "mmm-spotify-player-artwork";

			const artwork = document.createElement("img");
			artwork.alt = "Album artwork";
			if (this.track?.artworkUrl) {
				artwork.src = this.track.artworkUrl;
			} else {
				artwork.className = "is-empty";
			}
			artworkWrap.appendChild(artwork);
			body.appendChild(artworkWrap);
		}

		const meta = document.createElement("div");
		meta.className = "mmm-spotify-player-meta";

		const title = document.createElement("div");
		title.className = "mmm-spotify-player-title bright";
		title.textContent = this.track?.title || this.emptyState.title;
		meta.appendChild(title);

		const artist = document.createElement("div");
		artist.className = "mmm-spotify-player-artist small dimmed";
		artist.textContent = this.track?.artist || this.emptyState.artist;
		meta.appendChild(artist);

		const status = document.createElement("div");
		status.className = "mmm-spotify-player-status xsmall dimmed";
		status.textContent = this.track?.status || this.emptyState.status;
		meta.appendChild(status);

		body.appendChild(meta);
		wrapper.appendChild(body);

		if (this.config.playPreviewAudio && this.track?.previewUrl) {
			const audio = document.createElement("audio");
			audio.preload = "none";
			audio.src = this.track.previewUrl;
			audio.autoplay = Boolean(this.track.isPlaying);
			audio.volume = 0.9;
			wrapper.appendChild(audio);
		}

		return wrapper;
	},

	startPolling () {
		this.stopPolling();
		void this.refreshNowPlaying();
		const interval = this.getPollInterval();
		this.pollTimer = setInterval(() => {
			void this.refreshNowPlaying();
		}, interval);
	},

	stopPolling () {
		if (!this.pollTimer) {
			return;
		}
		clearInterval(this.pollTimer);
		this.pollTimer = null;
	},

	getPollInterval () {
		const parsed = Number(this.config.pollIntervalMs);
		if (!Number.isFinite(parsed)) {
			return 7000;
		}
		return Math.max(1000, Math.min(300000, Math.round(parsed)));
	},

	resolveNowPlayingEndpoint () {
		return this.resolveEndpoint(this.config.nowPlayingEndpoint);
	},

	resolveControlEndpoint () {
		return this.resolveEndpoint(this.config.controlEndpoint);
	},

	resolveEndpoint (endpointConfig) {
		const endpoint = typeof endpointConfig === "string"
			? endpointConfig.trim()
			: "";
		if (!endpoint) {
			return "";
		}

		try {
			const basePath = typeof config?.basePath === "string" && config.basePath
				? config.basePath
				: "/";
			const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;
			return new URL(endpoint, `${location.origin}${normalizedBasePath}`).toString();
		} catch {
			return endpoint;
		}
	},

	async refreshNowPlaying () {
		const endpoint = this.resolveNowPlayingEndpoint();
		if (endpoint) {
			await this.fetchNowPlayingFromEndpoint(endpoint);
			return;
		}

		if (this.config.useBrowserSessionAuthFallback) {
			await this.fetchNowPlayingFromSpotify(this.readBrowserSessionAuth());
			return;
		}

		this.renderEmpty(this.config.emptyTitle, "Not connected", this.config.emptyArtist);
	},

	notificationReceived (notification, payload) {
		if (notification === "CAROUSEL_CHANGED") {
			this.handleCarouselChanged(payload);
			return;
		}

		if (notification === "KEYPRESS") {
			void this.handleKeyPress(payload);
		}
	},

	handleCarouselChanged (payload) {
		if (!payload || !Number.isInteger(payload.slide)) {
			return;
		}

		this.currentCarouselSlideIndex = payload.slide;
		if (!this.isControlSlideActive()) {
			this.setPlaybackFocus(false);
		}
	},

	setPlaybackFocus (enabled) {
		if (!this.config.gestureControlsEnabled || !this.config.spotifyKeyMode) {
			return;
		}

		if (this.playbackFocusTimer) {
			clearTimeout(this.playbackFocusTimer);
			this.playbackFocusTimer = null;
		}

		if (enabled === this.hasPlaybackFocus) {
			if (enabled) {
				this.schedulePlaybackFocusRelease();
			}
			return;
		}

		this.hasPlaybackFocus = enabled;
		this.updateDom(0);
		this.sendNotification("KEYPRESS_MODE_CHANGED", enabled ? this.config.spotifyKeyMode : "DEFAULT");
		if (enabled) {
			this.schedulePlaybackFocusRelease();
		}
	},

	schedulePlaybackFocusRelease () {
		const timeoutMs = Number(this.config.controlWindowMs);
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
			return;
		}

		this.playbackFocusTimer = setTimeout(() => {
			this.setPlaybackFocus(false);
		}, Math.round(timeoutMs));
	},

	isControlSlideActive () {
		return Number.isInteger(this.config.controlSlideIndex)
			&& this.currentCarouselSlideIndex === this.config.controlSlideIndex;
	},

	async handleKeyPress (payload) {
		if (!this.config.gestureControlsEnabled || !this.isControlSlideActive() || !payload) {
			return;
		}

		if (payload.currentMode === "DEFAULT" && this.isActivationKey(payload.keyName)) {
			this.setPlaybackFocus(true);
			return;
		}

		if (!this.hasPlaybackFocus || payload.currentMode !== this.config.spotifyKeyMode) {
			return;
		}

		if (payload.keyName === "ArrowRight") {
			await this.sendPlaybackControl("next");
			this.setPlaybackFocus(false);
			return;
		}

		if (payload.keyName === "ArrowLeft") {
			await this.sendPlaybackControl("previous");
			this.setPlaybackFocus(false);
			return;
		}

		if (payload.keyName === " ") {
			await this.sendPlaybackControl(this.track?.isPlaying ? "pause" : "play");
			this.setPlaybackFocus(false);
		}
	},

	async sendPlaybackControl (action) {
		const endpoint = this.resolveControlEndpoint();
		if (!endpoint) {
			return;
		}

		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action })
			});

			if (response.status === 401) {
				this.renderEmpty(this.config.emptyTitle, "Not connected", this.config.emptyArtist);
				return;
			}

			if (!response.ok) {
				this.renderEmpty("Spotify control failed", `Error ${response.status}`, "");
				return;
			}

			await this.refreshNowPlaying();
		} catch {
			this.renderEmpty("Spotify control failed", "Offline", "");
		}
	},

	getActivationKeys () {
		return Array.from(new Set([
			this.config.activationKey,
			this.config.secondaryActivationKey
		]
			.filter((key) => typeof key === "string")
			.map((key) => key.trim())
			.filter(Boolean)));
	},

	isActivationKey (key) {
		return this.getActivationKeys().includes(key);
	},

	async fetchNowPlayingFromEndpoint (endpoint) {
		try {
			const response = await fetch(endpoint, { cache: "no-store" });
			if (response.status === 204) {
				this.renderEmpty("Nothing playing", "Idle", "");
				return;
			}
			if (response.status === 401) {
				this.renderEmpty(this.config.emptyTitle, "Not connected", this.config.emptyArtist);
				return;
			}
			if (!response.ok) {
				this.renderEmpty("Spotify unavailable", `Error ${response.status}`, "");
				return;
			}
			const data = await response.json();
			this.renderNormalizedTrack(this.normalizeNowPlaying(data));
		} catch {
			this.renderEmpty("Spotify unavailable", "Offline", "");
		}
	},

	async fetchNowPlayingFromSpotify (auth) {
		if (!auth?.accessToken) {
			this.renderEmpty(this.config.emptyTitle, "Not connected", this.config.emptyArtist);
			return;
		}
		if (auth.expiresAt && Date.now() > auth.expiresAt) {
			this.renderEmpty("Spotify token expired", "Token expired", "");
			return;
		}

		try {
			const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=track", {
				headers: { Authorization: `Bearer ${auth.accessToken}` },
				cache: "no-store"
			});
			if (response.status === 204) {
				this.renderEmpty("Nothing playing", "Idle", "");
				return;
			}
			if (response.status === 401) {
				this.renderEmpty("Spotify unauthorized", "Unauthorized", "");
				return;
			}
			if (!response.ok) {
				this.renderEmpty("Spotify unavailable", `Error ${response.status}`, "");
				return;
			}
			const data = await response.json();
			this.renderNormalizedTrack(this.normalizeNowPlaying(data));
		} catch {
			this.renderEmpty("Spotify unavailable", "Offline", "");
		}
	},

	renderNormalizedTrack (track) {
		if (!track) {
			this.renderEmpty("Nothing playing", "Idle", "");
			return;
		}

		if (track.id && track.id === this.lastTrackId && this.track) {
			this.track = {
				...this.track,
				isPlaying: track.isPlaying,
				status: track.status,
				previewUrl: track.previewUrl
			};
			this.updateDom(0);
			return;
		}

		this.lastTrackId = track.id || "";
		this.track = track;
		this.updateDom(0);
	},

	renderEmpty (title, status, artist) {
		this.track = null;
		this.lastTrackId = "";
		this.emptyState = {
			title: title || "Nothing playing",
			artist: artist || "",
			status: status || "Idle"
		};
		this.updateDom(0);
	},

	normalizeNowPlaying (data) {
		if (!data || typeof data !== "object") {
			return null;
		}

		if (data.item) {
			const item = data.item;
			const artists = Array.isArray(item.artists)
				? item.artists.map((artist) => artist?.name || "").filter(Boolean).join(", ")
				: "";
			const images = Array.isArray(item.album?.images) ? item.album.images : [];
			return {
				id: typeof item.id === "string" ? item.id : "",
				title: typeof item.name === "string" ? item.name : "",
				artist: artists,
				artworkUrl: images[0]?.url || "",
				previewUrl: typeof item.preview_url === "string" ? item.preview_url : "",
				isPlaying: Boolean(data.is_playing),
				status: data.is_playing ? "Playing" : "Paused"
			};
		}

		if (typeof data.title === "string" || typeof data.artist === "string") {
			return {
				id: typeof data.id === "string" ? data.id : "",
				title: typeof data.title === "string" ? data.title : "",
				artist: typeof data.artist === "string" ? data.artist : "",
				artworkUrl: typeof data.artworkUrl === "string" ? data.artworkUrl : "",
				previewUrl: typeof data.previewUrl === "string" ? data.previewUrl : "",
				isPlaying: Boolean(data.isPlaying),
				status: typeof data.status === "string"
					? data.status
					: (data.isPlaying ? "Playing" : "Paused")
			};
		}

		return null;
	},

	readBrowserSessionAuth () {
		try {
			const raw = sessionStorage.getItem(this.config.authStorageKey);
			if (!raw) {
				return null;
			}
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed.accessToken !== "string") {
				return null;
			}
			return {
				accessToken: parsed.accessToken,
				expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null
			};
		} catch {
			return null;
		}
	}
});
