require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const MARKET = process.env.SPOTIFY_MARKET || "US";

const SPOTIFY_TOKEN_URL =
  "https://accounts.spotify.com/api/token";

const SPOTIFY_AUTHORIZE_URL =
  "https://accounts.spotify.com/authorize";

const SPOTIFY_API_URL =
  "https://api.spotify.com/v1";

const CLIENT_ID =
  process.env.SPOTIFY_CLIENT_ID;

const CLIENT_SECRET =
  process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  "http://127.0.0.1:3000/callback";

/*
  This first local version supports one player:
  you, on your own computer.
*/
const authState = {
  state: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: 0
};

const USER_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state"
].join(" ");

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* ------------------------------
   HELPERS
------------------------------ */

function requireSpotifyConfig() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Spotify credentials are missing. Check your .env file."
    );
  }
}

function spotifyCredentials() {
  return Buffer.from(
    `${CLIENT_ID}:${CLIENT_SECRET}`
  ).toString("base64");
}

function generateState() {
  return crypto
    .randomBytes(24)
    .toString("hex");
}

/* ------------------------------
   APP TOKEN
   Used for public catalog searches.
------------------------------ */

let appToken = null;
let appTokenExpiresAt = 0;

async function getAppToken() {
  if (
    appToken &&
    Date.now() < appTokenExpiresAt
  ) {
    return appToken;
  }

  requireSpotifyConfig();

  const response = await fetch(
    SPOTIFY_TOKEN_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",

        Authorization:
          `Basic ${spotifyCredentials()}`
      },

      body:
        "grant_type=client_credentials"
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "Spotify app authentication error:",
      data
    );

    throw new Error(
      data.error_description ||
      "Could not authenticate with Spotify."
    );
  }

  appToken =
    data.access_token;

  appTokenExpiresAt =
    Date.now() +
    Math.max(
      60,
      data.expires_in - 60
    ) * 1000;

  return appToken;
}

async function spotifyFetch(endpoint) {
  const token =
    await getAppToken();

  const response = await fetch(
    `${SPOTIFY_API_URL}${endpoint}`,
    {
      headers: {
        Authorization:
          `Bearer ${token}`
      }
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      `Spotify error for ${endpoint}:`,
      data
    );

    const error =
      new Error(
        data.error?.message ||
        `Spotify request failed with status ${response.status}.`
      );

    error.status =
      response.status;

    throw error;
  }

  return data;
}

/* ------------------------------
   USER AUTHORIZATION
------------------------------ */

app.get(
  "/api/spotify/login",
  (req, res) => {
    try {
      requireSpotifyConfig();

      const state =
        generateState();

      authState.state = state;

      const params =
        new URLSearchParams({
          response_type: "code",

          client_id:
            CLIENT_ID,

          redirect_uri:
            REDIRECT_URI,

          scope:
            USER_SCOPES,

          state,

          show_dialog:
            "true"
        });

      res.redirect(
        `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`
      );

    } catch (error) {
      res.status(500).send(
        error.message
      );
    }
  }
);

app.get(
  "/callback",
  async (req, res) => {
    try {
      const {
        code,
        state,
        error
      } = req.query;

      if (error) {
        return res.redirect(
          `/?spotify_error=${encodeURIComponent(error)}`
        );
      }

      if (!code) {
        return res.redirect(
          "/?spotify_error=missing_code"
        );
      }

      if (
        !state ||
        state !== authState.state
      ) {
        return res.redirect(
          "/?spotify_error=invalid_state"
        );
      }

      authState.state = null;

      const response =
        await fetch(
          SPOTIFY_TOKEN_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",

              Authorization:
                `Basic ${spotifyCredentials()}`
            },

            body:
              new URLSearchParams({
                grant_type:
                  "authorization_code",

                code,

                redirect_uri:
                  REDIRECT_URI
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        console.error(
          "Spotify callback token error:",
          data
        );

        return res.redirect(
          "/?spotify_error=token_exchange_failed"
        );
      }

      authState.accessToken =
        data.access_token;

      authState.refreshToken =
        data.refresh_token ||
        authState.refreshToken;

      authState.expiresAt =
        Date.now() +
        Math.max(
          60,
          data.expires_in - 60
        ) * 1000;

      console.log(
        "Spotify user successfully connected."
      );

      res.redirect(
        "/?spotify_connected=1"
      );

    } catch (error) {
      console.error(
        "Spotify callback error:",
        error
      );

      res.redirect(
        `/?spotify_error=${encodeURIComponent(
          error.message
        )}`
      );
    }
  }
);

async function refreshUserToken() {
  if (!authState.refreshToken) {
    throw new Error(
      "Spotify is not connected yet."
    );
  }

  const response =
    await fetch(
      SPOTIFY_TOKEN_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          Authorization:
            `Basic ${spotifyCredentials()}`
        },

        body:
          new URLSearchParams({
            grant_type:
              "refresh_token",

            refresh_token:
              authState.refreshToken
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "Spotify refresh token error:",
      data
    );

    authState.accessToken = null;
    authState.refreshToken = null;
    authState.expiresAt = 0;

    throw new Error(
      "Your Spotify login expired. Please reconnect Spotify."
    );
  }

  authState.accessToken =
    data.access_token;

  if (data.refresh_token) {
    authState.refreshToken =
      data.refresh_token;
  }

  authState.expiresAt =
    Date.now() +
    Math.max(
      60,
      data.expires_in - 60
    ) * 1000;

  return authState.accessToken;
}

async function getUserToken() {
  if (
    authState.accessToken &&
    Date.now() < authState.expiresAt
  ) {
    return authState.accessToken;
  }

  return refreshUserToken();
}

app.get(
  "/api/spotify/status",
  (req, res) => {
    res.json({
      connected:
        Boolean(
          authState.accessToken ||
          authState.refreshToken
        )
    });
  }
);

app.get(
  "/api/spotify/token",
  async (req, res) => {
    try {
      const token =
        await getUserToken();

      res.json({
        access_token:
          token
      });

    } catch (error) {
      res.status(401).json({
        error:
          error.message
      });
    }
  }
);

/* ------------------------------
   SEARCH ARTISTS
------------------------------ */

app.get(
  "/api/search/artists",
  async (req, res) => {
    try {
      const query =
        String(
          req.query.q || ""
        ).trim();

      if (!query) {
        return res.status(400).json({
          error:
            "Artist search query is required."
        });
      }

      const data =
        await spotifyFetch(
          `/search?type=artist&limit=10&market=${MARKET}&q=${encodeURIComponent(
            query
          )}`
        );

      const artists =
        (data.artists?.items || []).map(
          artist => ({
            id: artist.id,
            name: artist.name,

            image:
              artist.images?.[0]?.url || "",

            genres:
              artist.genres || []
          })
        );

      res.json({
        artists
      });

    } catch (error) {
      console.error(error);

      res.status(
        error.status || 500
      ).json({
        error:
          error.message
      });
    }
  }
);

/* ------------------------------
   ARTIST ALBUMS
------------------------------ */

async function getArtistAlbums(
  artistId,
  maxAlbums = 30
) {
  let albums = [];
  let offset = 0;

  while (
    albums.length < maxAlbums &&
    offset < 50
  ) {
    const data =
      await spotifyFetch(
        `/artists/${artistId}/albums?include_groups=album,single&market=${MARKET}&limit=10&offset=${offset}`
      );

    const items =
      data.items || [];

    albums.push(...items);

    if (
      items.length < 10 ||
      !data.next
    ) {
      break;
    }

    offset += 10;
  }

  const seen = new Set();

  return albums.filter(
    album => {
      if (
        !album.id ||
        seen.has(album.id)
      ) {
        return false;
      }

      seen.add(album.id);
      return true;
    }
  );
}

/* ------------------------------
   ALBUM TRACKS
------------------------------ */

async function getTracksFromAlbums(
  albums,
  minimumTracks
) {
  let tracks = [];

  for (const album of albums) {
    if (
      tracks.length >=
      Math.max(
        minimumTracks * 4,
        40
      )
    ) {
      break;
    }

    try {
      const data =
        await spotifyFetch(
          `/albums/${album.id}/tracks?market=${MARKET}&limit=50`
        );

      for (
        const track of
        data.items || []
      ) {
        tracks.push({
          ...track,

          album: {
            id: album.id,
            name: album.name,
            images:
              album.images || []
          }
        });
      }

    } catch (error) {
      console.warn(
        `Could not load album ${album.id}:`,
        error.message
      );
    }
  }

  return tracks;
}

/* ------------------------------
   CREATE ARTIST GAME
------------------------------ */

app.post(
  "/api/game/create",
  async (req, res) => {
    try {
      const {
        artistId,
        rounds = 10,
        mode = "progressive"
      } = req.body;

      if (!artistId) {
        return res.status(400).json({
          error:
            "Artist ID is required."
        });
      }

      const requestedRounds =
        Math.min(
          Math.max(
            Number(rounds) || 10,
            1
          ),
          20
        );

      const artist =
        await spotifyFetch(
          `/artists/${artistId}`
        );

      const albums =
        await getArtistAlbums(
          artistId,
          30
        );

      let tracks =
        await getTracksFromAlbums(
          albums,
          requestedRounds
        );

      tracks =
        deduplicateTracks(tracks)
          .filter(
            track =>
              track.id &&
              track.name
          );

      if (!tracks.length) {
        throw new Error(
          "No playable tracks were found for this artist."
        );
      }

      tracks =
        assignDifficulty(
          tracks,
          mode
        );

      tracks =
        pickTracks(
          tracks,
          requestedRounds,
          mode
        );

      res.json({
        source: "artist",

        artist: {
          id: artist.id,
          name: artist.name
        },

        mode,

        tracks:
          tracks.map(
            formatTrack
          )
      });

    } catch (error) {
      console.error(
        "Game creation error:",
        error
      );

      res.status(
        error.status || 500
      ).json({
        error:
          error.message
      });
    }
  }
);

/* ------------------------------
   CREATE GENRE GAME
------------------------------ */

app.post(
  "/api/game/create-genre",
  async (req, res) => {
    try {
      const {
        genre,
        rounds = 10,
        mode = "progressive"
      } = req.body;

      if (!genre) {
        return res.status(400).json({
          error:
            "Genre is required."
        });
      }

      const requestedRounds =
        Math.min(
          Math.max(
            Number(rounds) || 10,
            1
          ),
          20
        );

      let tracks = [];
      let offset = 0;

      while (
        tracks.length <
        requestedRounds * 2 &&
        offset < 50
      ) {
        const data =
          await spotifyFetch(
            `/search?type=track&limit=10&offset=${offset}&market=${MARKET}&q=${encodeURIComponent(
              `genre:${genre}`
            )}`
          );

        const items =
          data.tracks?.items || [];

        tracks.push(...items);

        if (
          items.length < 10
        ) {
          break;
        }

        offset += 10;
      }

      tracks =
        deduplicateTracks(tracks)
          .filter(
            track =>
              track.id &&
              track.name
          );

      if (!tracks.length) {
        throw new Error(
          "No songs were found for that genre."
        );
      }

      tracks =
        assignDifficulty(
          tracks,
          mode
        );

      tracks =
        pickTracks(
          tracks,
          requestedRounds,
          mode
        );

      res.json({
        source: "genre",
        genre,
        mode,

        tracks:
          tracks.map(
            formatTrack
          )
      });

    } catch (error) {
      console.error(
        "Genre game error:",
        error
      );

      res.status(
        error.status || 500
      ).json({
        error:
          error.message
      });
    }
  }
);

/* ------------------------------
   TRACK HELPERS
------------------------------ */

function deduplicateTracks(
  tracks
) {
  const seen = new Set();

  return tracks.filter(
    track => {
      if (
        !track.id ||
        seen.has(track.id)
      ) {
        return false;
      }

      seen.add(track.id);
      return true;
    }
  );
}

function shuffle(array) {
  const copy = [...array];

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );

    [
      copy[i],
      copy[j]
    ] = [
      copy[j],
      copy[i]
    ];
  }

  return copy;
}

function assignDifficulty(
  tracks,
  mode
) {
  const shuffled =
    shuffle([...tracks]);

  if (mode === "chaos") {
    return shuffled.map(
      (track, index) => ({
        ...track,

        difficulty:
          index % 2 === 0
            ? "easy"
            : "expert"
      })
    );
  }

  return shuffled.map(
    (track, index) => {
      const position =
        shuffled.length <= 1
          ? 0
          : index /
            (
              shuffled.length - 1
            );

      let difficulty;

      if (position < 0.25) {
        difficulty = "easy";
      } else if (
        position < 0.5
      ) {
        difficulty = "medium";
      } else if (
        position < 0.75
      ) {
        difficulty = "hard";
      } else {
        difficulty = "expert";
      }

      return {
        ...track,
        difficulty
      };
    }
  );
}

function pickTracks(
  tracks,
  rounds,
  mode
) {
  const count =
    Math.min(
      Math.max(
        Number(rounds) || 10,
        1
      ),
      tracks.length
    );

  if (mode === "random") {
    return shuffle(tracks)
      .slice(0, count);
  }

  if (mode === "chaos") {
    const chaos =
      tracks.filter(
        track =>
          track.difficulty === "easy" ||
          track.difficulty === "expert"
      );

    return shuffle(chaos)
      .slice(0, count);
  }

  const ordered = [
    ...shuffle(
      tracks.filter(
        track =>
          track.difficulty === "easy"
      )
    ),

    ...shuffle(
      tracks.filter(
        track =>
          track.difficulty === "medium"
      )
    ),

    ...shuffle(
      tracks.filter(
        track =>
          track.difficulty === "hard"
      )
    ),

    ...shuffle(
      tracks.filter(
        track =>
          track.difficulty === "expert"
      )
    )
  ];

  return ordered.slice(
    0,
    count
  );
}

function formatTrack(track) {
  return {
    id: track.id,

    title: track.name,

    artists:
      (track.artists || [])
        .map(
          artist =>
            artist.name
        ),

    difficulty:
      track.difficulty ||
      "medium",

    uri:
      `spotify:track:${track.id}`
  };
}

/* ------------------------------
   HEALTH CHECK
------------------------------ */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,

      market: MARKET,

      spotifyConfigured:
        Boolean(
          CLIENT_ID &&
          CLIENT_SECRET
        ),

      spotifyUserConnected:
        Boolean(
          authState.accessToken ||
          authState.refreshToken
        )
    });
  }
);

/* ------------------------------
   START
------------------------------ */

app.listen(
  PORT,
  "127.0.0.1",
  () => {
    console.log(
      `SongGuess is running at http://127.0.0.1:${PORT}`
    );

    console.log(
      `Spotify market: ${MARKET}`
    );

    console.log(
      `Spotify callback: ${REDIRECT_URI}`
    );
  }
);