# MMM-SpotifyPlayer

Spotify now-playing module for IntelliGlass.

## Configuration

```js
{
	module: "MMM-SpotifyPlayer",
	position: "top_center",
	header: "Spotify",
	config: {
		clientId: "",
		redirectUri: "",
		deviceName: "IntelliGlass Mirror",
		nowPlayingEndpoint: "remote/spotify/now-playing",
		controlEndpoint: "remote/spotify/control",
		pollIntervalMs: 7000,
		showAlbumArt: true,
		playPreviewAudio: false,
		controlSlideIndex: 0,
		activationKey: "ArrowUp",
		secondaryActivationKey: "ArrowDown",
		controlWindowMs: 5000,
		gestureControlsEnabled: true
	}
}
```

When `controlSlideIndex` matches the active MMM-Carousel slide, press `activationKey` or the optional `secondaryActivationKey` once to arm Spotify controls for `controlWindowMs` milliseconds:

- `ArrowRight` → next track
- `ArrowLeft` → previous track
- `Space` → play/pause

After one playback command, focus returns to normal carousel navigation. Put the module on the slide where you want those controls active, for example:

```js
slides: {
	main: ["clock", "weather", "MMM-SpotifyPlayer"]
}
```

`clientId`, `redirectUri`, `deviceName`, `pollIntervalMs`, `showAlbumArt`, and `playPreviewAudio`
can also be edited from `RemoteApp/spotify.html`.

The RemoteApp completes Spotify OAuth, hands the temporary access token to the MagicMirror server,
and the module polls `remote/spotify/now-playing` so the mirror can display the active track even
when OAuth was completed from a phone or laptop.
