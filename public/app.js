const LISTENING_STAGES = [
  { seconds: 5, label: "Quick Listen", multiplier: 1 },
  { seconds: 10, label: "More Time", multiplier: 0.75 },
  { seconds: 20, label: "Extended Listen", multiplier: 0.5 },
  { seconds: 30, label: "Final Chance", multiplier: 0.25 }
];

const state = {
  sourceMode: "artist",
  selectedArtist: null,
  selectedGenre: "hip-hop",
  game: null,
  currentRoundIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  stageIndex: 0,
  stageTimeLeft: 0,
  stageTimer: null,
  roundResults: [],
  hintUsed: false,
  roundFinished: false,

  spotifyConnected: false,
  spotifyPlayer: null,
  spotifyDeviceId: null,
  spotifyReady: false,
  clipStopTimer: null,
  isPlayingClip: false
};

const elements = {
  homeScreen: document.getElementById("homeScreen"),
  gameScreen: document.getElementById("gameScreen"),
  resultsScreen: document.getElementById("resultsScreen"),

  modeOptions:
    document.querySelectorAll(".mode-option"),

  artistModePanel:
    document.getElementById("artistModePanel"),

  genreModePanel:
    document.getElementById("genreModePanel"),

  artistSearch:
    document.getElementById("artistSearch"),

  searchButton:
    document.getElementById("searchButton"),

  searchStatus:
    document.getElementById("searchStatus"),

  artistResults:
    document.getElementById("artistResults"),

  selectedArtist:
    document.getElementById("selectedArtist"),

  selectedArtistImage:
    document.getElementById("selectedArtistImage"),

  selectedArtistName:
    document.getElementById("selectedArtistName"),

  selectedArtistGenres:
    document.getElementById("selectedArtistGenres"),

  clearArtistButton:
    document.getElementById("clearArtistButton"),

  genreSelect:
    document.getElementById("genreSelect"),

  gameMode:
    document.getElementById("gameMode"),

  roundCount:
    document.getElementById("roundCount"),

  startButton:
    document.getElementById("startButton"),

  roundNumber:
    document.getElementById("roundNumber"),

  score:
    document.getElementById("score"),

  streak:
    document.getElementById("streak"),

  difficultyBadge:
    document.getElementById("difficultyBadge"),

  listeningStage:
    document.getElementById("listeningStage"),

  gameSourceLabel:
    document.getElementById("gameSourceLabel"),

  stageTime:
    document.getElementById("stageTime"),

  stageCountdown:
    document.getElementById("stageCountdown"),

  timerFill:
    document.getElementById("timerFill"),

  stageDescription:
    document.getElementById("stageDescription"),

  spotifyPlayer:
    document.getElementById("spotifyPlayer"),

  guessInput:
    document.getElementById("guessInput"),

  guessButton:
    document.getElementById("guessButton"),

  revealButton:
    document.getElementById("revealButton"),

  hintButton:
    document.getElementById("hintButton"),

  skipButton:
    document.getElementById("skipButton"),

  quitButton:
    document.getElementById("quitButton"),

  messageBox:
    document.getElementById("messageBox"),

  finalScore:
    document.getElementById("finalScore"),

  correctCount:
    document.getElementById("correctCount"),

  bestStreak:
    document.getElementById("bestStreak"),

  roundResults:
    document.getElementById("roundResults"),

  playAgainButton:
    document.getElementById("playAgainButton")
};

function getPlayButton() {
  return document.getElementById("playClipButton");
}

function getReplayButton() {
  return document.getElementById("replayClipButton");
}

function getSpotifyConnectButton() {
  return document.getElementById("spotifyConnectButton");
}

function getPlayerStatus() {
  return document.getElementById("spotifyPlayerStatus");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(
    () => ({})
  );

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Something went wrong."
    );
  }

  return data;
}

function showScreen(screenName) {
  [
    elements.homeScreen,
    elements.gameScreen,
    elements.resultsScreen
  ].forEach(screen => {
    screen.classList.remove("active");
  });

  elements[screenName]
    .classList.add("active");
}

function showMessage(
  html,
  type = "info"
) {
  elements.messageBox.innerHTML = html;

  elements.messageBox.className =
    `message show ${type}`;
}

function clearMessage() {
  elements.messageBox.innerHTML = "";
  elements.messageBox.className =
    "message";
}

function setSearchStatus(
  text = ""
) {
  elements.searchStatus.textContent =
    text;
}

/* --------------------------------
   SPOTIFY CONNECTION
-------------------------------- */

async function checkSpotifyConnection() {
  try {
    const data = await apiFetch(
      "/api/spotify/status"
    );

    state.spotifyConnected =
      Boolean(data.connected);

    return state.spotifyConnected;

  } catch {
    state.spotifyConnected = false;
    return false;
  }
}

function updateSpotifyStatus() {
  const button =
    getSpotifyConnectButton();

  const status =
    getPlayerStatus();

  if (!button || !status) {
    return;
  }

  if (
    state.spotifyConnected &&
    state.spotifyReady
  ) {
    button.textContent =
      "✓ Spotify Connected";

    button.disabled = true;

    status.textContent =
      "Spotify is ready. Press Play Clip when a round begins.";

  } else if (state.spotifyConnected) {
    button.textContent =
      "Connecting player...";

    button.disabled = true;

    status.textContent =
      "Preparing the hidden Spotify player...";

  } else {
    button.textContent =
      "Connect Spotify";

    button.disabled = false;

    status.textContent =
      "Connect your Spotify Premium account to enable blind playback.";
  }
}

function connectSpotify() {
  window.location.href =
    "/api/spotify/login";
}

function waitForSpotifySDK() {
  return new Promise(
    resolve => {
      if (
        window.Spotify &&
        window.Spotify.Player
      ) {
        resolve();
        return;
      }

      window.onSpotifyWebPlaybackSDKReady =
        () => resolve();
    }
  );
}

async function initializeSpotifyPlayer() {
  if (!state.spotifyConnected) {
    updateSpotifyStatus();
    return;
  }

  if (state.spotifyPlayer) {
    return;
  }

  updateSpotifyStatus();

  try {
    await waitForSpotifySDK();

    state.spotifyPlayer =
      new window.Spotify.Player({
        name: "SongGuess Hidden Player",

        getOAuthToken:
          async callback => {
            try {
              const data =
                await apiFetch(
                  "/api/spotify/token"
                );

              callback(
                data.access_token
              );

            } catch (error) {
              console.error(error);

              state.spotifyConnected =
                false;

              state.spotifyReady =
                false;

              updateSpotifyStatus();
            }
          },

        volume: 0.8
      });

    state.spotifyPlayer.addListener(
      "ready",
      ({ device_id }) => {
        state.spotifyDeviceId =
          device_id;

        state.spotifyReady =
          true;

        console.log(
          "SongGuess Spotify player ready:",
          device_id
        );

        updateSpotifyStatus();
      }
    );

    state.spotifyPlayer.addListener(
      "not_ready",
      () => {
        state.spotifyReady =
          false;

        updateSpotifyStatus();
      }
    );

    state.spotifyPlayer.addListener(
      "initialization_error",
      ({ message }) => {
        console.error(
          "Spotify initialization error:",
          message
        );

        showMessage(
          `Spotify player error: ${escapeHtml(message)}`,
          "error"
        );
      }
    );

    state.spotifyPlayer.addListener(
      "authentication_error",
      ({ message }) => {
        console.error(
          "Spotify authentication error:",
          message
        );

        state.spotifyConnected =
          false;

        state.spotifyReady =
          false;

        updateSpotifyStatus();

        showMessage(
          "Spotify needs to be connected again.",
          "error"
        );
      }
    );

    state.spotifyPlayer.addListener(
      "account_error",
      ({ message }) => {
        console.error(
          "Spotify account error:",
          message
        );

        showMessage(
          `Spotify account error: ${escapeHtml(message)}. Spotify Premium is required for this player.`,
          "error"
        );
      }
    );

    state.spotifyPlayer.addListener(
      "playback_error",
      ({ message }) => {
        console.error(
          "Spotify playback error:",
          message
        );
      }
    );

    await state.spotifyPlayer.connect();

  } catch (error) {
    console.error(error);

    state.spotifyReady =
      false;

    updateSpotifyStatus();
  }
}

async function transferPlaybackHere() {
  if (!state.spotifyDeviceId) {
    throw new Error(
      "Spotify player is still starting. Please wait a moment."
    );
  }

  const token =
    await apiFetch(
      "/api/spotify/token"
    );

  const response = await fetch(
  "https://api.spotify.com/v1/me/player",
  {
    method: "PUT",

    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      device_ids: [
        state.spotifyDeviceId
      ],
      play: false
    })
  }
);
  

  if (!response.ok) {
    const data =
      await response.json()
        .catch(() => ({}));

    throw new Error(
      data.error?.message ||
      "Could not activate the Spotify player."
    );
  }
}

async function playCurrentClip() {

  
if (state.roundFinished) {
    return;
  }

  const track = getCurrentTrack();



  if (!track) {
    return;
  }

  if (!state.spotifyConnected) {
    showMessage(
      "Please connect Spotify before playing.",
      "error"
    );

    connectSpotify();
    return;
  }

  if (!state.spotifyReady) {
    showMessage(
      "Spotify is still preparing. Wait a moment and try again.",
      "info"
    );

    return;
  } 

  clearTimeout(
    state.clipStopTimer
  );

  try {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const token =
      await apiFetch(
        "/api/spotify/token"
      );

    
       const response = await fetch(
  `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(
  state.spotifyDeviceId
)}`,
  {
    method: "PUT",

    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      uris: [track.uri],
      position_ms: 0
    })
  }
);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));


      throw new Error(
        data.error?.message ||
        "Spotify could not start playback."
      );
    }

    state.isPlayingClip = true;

    updateClipButtons(
      true
    );

    startListeningStage();

    const seconds =
      getCurrentStage().seconds;

    state.clipStopTimer =
      setTimeout(
        async () => {
          await stopCurrentClip();
        },
        seconds * 1000
      );

  } catch (error) {
    console.error(error);

    state.isPlayingClip =
      false;

    updateClipButtons(
      false
    );

    showMessage(
      `Could not play clip: ${escapeHtml(error.message)}`,
      "error"
    );
  }
}

async function stopCurrentClip() {
  clearTimeout(
    state.clipStopTimer
  );

  state.isPlayingClip =
    false;

  try {
    if (state.spotifyPlayer) {
      await state.spotifyPlayer.pause();
    }
  } catch (error) {
    console.warn(
      "Could not pause player:",
      error
    );
  }

  updateClipButtons(
    false
  );
}

function updateClipButtons(
  playing = false
) {
  const playButton =
    getPlayButton();

  const replayButton =
    getReplayButton();

  if (!playButton || !replayButton) {
    return;
  }

  const disabled =
    state.roundFinished ||
    !state.spotifyReady;

  playButton.disabled =
    disabled || playing;

  replayButton.disabled =
    disabled || playing;

  playButton.textContent =
    playing
      ? "Playing..."
      : `▶ Play ${getCurrentStage().seconds}s Clip`;

  replayButton.textContent =
    playing
      ? "Playing..."
      : "🔁 Replay Clip";
}

/* --------------------------------
   HOME SCREEN
-------------------------------- */

function setSourceMode(mode) {
  state.sourceMode = mode;

  elements.modeOptions.forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.sourceMode ===
          mode
      );
    }
  );

  const artistMode =
    mode === "artist";

  elements.artistModePanel
    .classList.toggle(
      "hidden",
      !artistMode
    );

  elements.genreModePanel
    .classList.toggle(
      "hidden",
      artistMode
    );

  updateStartButton();
}

function updateStartButton() {
  elements.startButton.disabled =
    state.sourceMode ===
      "artist" &&
    !state.selectedArtist;
}

async function searchArtists() {
  const query =
    elements.artistSearch.value
      .trim();

  if (query.length < 2) {
    setSearchStatus(
      "Enter at least 2 characters."
    );

    return;
  }

  elements.searchButton.disabled =
    true;

  setSearchStatus(
    "Searching Spotify..."
  );

  elements.artistResults.innerHTML =
    "";

  try {
    const data =
      await apiFetch(
        `/api/search/artists?q=${encodeURIComponent(
          query
        )}`
      );

    if (!data.artists.length) {
      setSearchStatus(
        "No artists found."
      );

      return;
    }

    setSearchStatus(
      `${data.artists.length} artist(s) found.`
    );

    renderArtistResults(
      data.artists
    );

  } catch (error) {
    setSearchStatus(
      error.message
    );

  } finally {
    elements.searchButton.disabled =
      false;
  }
}

function renderArtistResults(
  artists
) {
  elements.artistResults.innerHTML =
    artists.map(
      (artist, index) => {
        const image =
          artist.image ||
          "https://placehold.co/100x100?text=Music";

        const genres =
          artist.genres
            ?.slice(0, 3)
            .join(", ") ||
          "Spotify artist";

        return `
          <button
            class="artist-option"
            data-index="${index}"
          >
            <img
              class="artist-image"
              src="${escapeHtml(image)}"
              alt=""
            >

            <span>
              <strong>
                ${escapeHtml(artist.name)}
              </strong>

              <small>
                ${escapeHtml(genres)}
              </small>
            </span>
          </button>
        `;
      }
    ).join("");

  document
    .querySelectorAll(
      ".artist-option"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            selectArtist(
              artists[
                Number(
                  button.dataset.index
                )
              ]
            );
          }
        );
      }
    );
}

function selectArtist(
  artist
) {
  state.selectedArtist =
    artist;

  elements.selectedArtistImage.src =
    artist.image ||
    "https://placehold.co/100x100?text=Music";

  elements.selectedArtistName.textContent =
    artist.name;

  elements.selectedArtistGenres.textContent =
    artist.genres
      ?.slice(0, 4)
      .join(", ") ||
    "Spotify artist";

  elements.selectedArtist
    .classList.remove(
      "hidden"
    );

  elements.artistResults.innerHTML =
    "";

  setSearchStatus(
    `${artist.name} selected.`
  );

  updateStartButton();
}

function clearArtist() {
  state.selectedArtist =
    null;

  elements.selectedArtist
    .classList.add(
      "hidden"
    );

  elements.artistSearch.value =
    "";

  elements.artistResults.innerHTML =
    "";

  setSearchStatus("");

  updateStartButton();
}

/* --------------------------------
   GAME CREATION
-------------------------------- */

async function startGame() {
  const connected =
    await checkSpotifyConnection();

  if (!connected) {
    alert(
      "Please connect Spotify first."
    );

    connectSpotify();
    return;
  }

  if (!state.spotifyPlayer) {
    initializeSpotifyPlayer();
  }

  const mode =
    elements.gameMode.value;

  const rounds =
    Number(
      elements.roundCount.value
    );

  elements.startButton.disabled =
    true;

  const originalText =
    elements.startButton.textContent;

  elements.startButton.textContent =
    "Building game...";

  try {
    let data;

    if (
      state.sourceMode ===
      "artist"
    ) {
      data =
        await apiFetch(
          "/api/game/create",
          {
            method: "POST",

            body:
              JSON.stringify({
                artistId:
                  state.selectedArtist.id,

                rounds,
                mode
              })
          }
        );
    } else {
      state.selectedGenre =
        elements.genreSelect.value;

      data =
        await apiFetch(
          "/api/game/create-genre",
          {
            method: "POST",

            body:
              JSON.stringify({
                genre:
                  state.selectedGenre,

                rounds,
                mode
              })
          }
        );
    }

    if (!data.tracks?.length) {
      throw new Error(
        "No tracks were found for this game."
      );
    }

    state.game =
      data;

    state.currentRoundIndex =
      0;

    state.score =
      0;

    state.streak =
      0;

    state.bestStreak =
      0;

    state.roundResults =
      [];

    showScreen(
      "gameScreen"
    );

    loadRound();

  } catch (error) {
    alert(
      `Could not start game: ${error.message}`
    );

  } finally {
    elements.startButton.textContent =
      originalText;

    updateStartButton();
  }
}

/* --------------------------------
   ROUND
-------------------------------- */

function getCurrentTrack() {
  return state.game?.tracks?.[
    state.currentRoundIndex
  ];
}

function loadRound() {
  clearInterval(
    state.stageTimer
  );

  clearTimeout(
    state.clipStopTimer
  );

  const track =
    getCurrentTrack();

  if (!track) {
    finishGame();
    return;
  }

  state.stageIndex =
    0;

  state.hintUsed =
    false;

  state.roundFinished =
    false;

  state.isPlayingClip =
    false;

  elements.roundNumber.textContent =
    `${state.currentRoundIndex + 1} / ${state.game.tracks.length}`;

  elements.score.textContent =
    state.score;

  elements.streak.textContent =
    state.streak;

  updateDifficulty(
    track.difficulty
  );

  elements.gameSourceLabel.textContent =
    state.game.source ===
    "genre"
      ? `Genre: ${state.game.genre}`
      : `Artist: ${state.game.artist.name}`;

  elements.guessInput.value =
    "";

  elements.guessInput.disabled =
    false;

  elements.guessButton.disabled =
    false;

  elements.hintButton.disabled =
    false;

  elements.skipButton.disabled =
    false;

  elements.revealButton.disabled =
    false;

  clearMessage();

  hideVisibleSpotifyEmbed();

  renderBlindPlayer();


  setTimeout(
    () => {
      elements.guessInput.focus();
    },
    150
  );
}

function hideVisibleSpotifyEmbed() {
  elements.spotifyPlayer.innerHTML =
    "";
}

function renderBlindPlayer() {
  elements.spotifyPlayer.innerHTML =
    `
      <div class="blind-player">
        <div
          class="blind-player-title"
        >
          🎵 Ready to listen?
        </div>

        <div
          class="blind-player-subtitle"
        >
          No song information will be shown.
        </div>

        <div
          class="blind-player-controls"
        >
          <button
            id="playClipButton"
            class="primary-button"
          >
            ▶ Play Clip
          </button>

          <button
            id="replayClipButton"
            class="secondary-button"
          >
            🔁 Replay Clip
          </button>
        </div>
      </div>
    `;

  getPlayButton()
    .addEventListener(
      "click",
      playCurrentClip
    );

  getReplayButton()
    .addEventListener(
      "click",
      playCurrentClip
    );

  updateClipButtons(
    false
  );
}

function updateDifficulty(
  difficulty
) {
  const value =
    String(
      difficulty ||
      "medium"
    ).toLowerCase();

  elements.difficultyBadge.className =
    `difficulty ${value}`;

  elements.difficultyBadge.textContent =
    value.toUpperCase();
}

/* --------------------------------
   LISTENING STAGES
-------------------------------- */

function getCurrentStage() {
  return LISTENING_STAGES[
    state.stageIndex
  ];
}

function startListeningStage() {
  clearInterval(
    state.stageTimer
  );

  const stage =
    getCurrentStage();

  state.stageTimeLeft =
    stage.seconds;

  updateStageUI();

  state.stageTimer =
    setInterval(
      () => {
        if (
          state.roundFinished
        ) {
          clearInterval(
            state.stageTimer
          );

          return;
        }

        state.stageTimeLeft--;

        updateStageUI();

        if (
          state.stageTimeLeft <= 0
        ) {
          clearInterval(
            state.stageTimer
          );

          handleStageFinished();
        }
      },
      1000
    );
}

function updateStageUI() {
  const stage =
    getCurrentStage();

  elements.listeningStage.textContent =
    `Stage ${state.stageIndex + 1} of ${LISTENING_STAGES.length}`;

  elements.stageTime.textContent =
    `${stage.seconds} seconds`;

  elements.stageCountdown.textContent =
    `${Math.max(
      0,
      state.stageTimeLeft
    )}s`;

  const percentage =
    Math.max(
      0,
      (
        state.stageTimeLeft /
        stage.seconds
      ) * 100
    );

  elements.timerFill.style.width =
    `${percentage}%`;

  elements.stageDescription.textContent =
    getStageDescription();

  if (
    state.stageIndex >=
    LISTENING_STAGES.length - 1
  ) {
    elements.revealButton.textContent =
      "Final Stage";
  } else {
    const nextStage =
      LISTENING_STAGES[
        state.stageIndex + 1
      ];

    elements.revealButton.textContent =
      `🔓 Reveal ${nextStage.seconds}s`;
  }

  updateClipButtons(
    state.isPlayingClip
  );
}

function getStageDescription() {
  const stage =
    getCurrentStage();

  if (state.stageIndex === 0) {
    return `You are in the ${stage.label} stage. Guess now for maximum points.`;
  }

  if (
    state.stageIndex ===
    LISTENING_STAGES.length - 1
  ) {
    return `This is your ${stage.label}. Correct answers are worth the fewest points.`;
  }

  return "You revealed more listening time. Your potential points have been reduced.";
}

async function handleStageFinished() {
  if (
    state.roundFinished
  ) {
    return;
  }

  await stopCurrentClip();

  if (
    state.stageIndex <
    LISTENING_STAGES.length - 1
  ) {
    showMessage(
      "⏱️ Time for this stage is over.<br>You can still guess, replay the clip, or reveal more time.",
      "info"
    );
  } else {
    finishRound(
      false,
      "Final stage is over! ⏰"
    );
  }
}

async function revealMore() {
  if (
    state.roundFinished ||
    state.stageIndex >=
    LISTENING_STAGES.length - 1
  ) {
    return;
  }

  await stopCurrentClip();

  state.stageIndex++;

  clearMessage();

  startListeningStage();

  showMessage(
    `🔓 More time revealed.<br>Your score multiplier is now <strong>${Math.round(
      getCurrentStage().multiplier *
      100
    )}%</strong>.`,
    "info"
  );
}

/* --------------------------------
   GUESSING
-------------------------------- */

function isCorrectGuess(
  guess,
  answer
) {
  const cleanGuess =
    normalize(guess);

  const cleanAnswer =
    normalize(answer);

  if (!cleanGuess) {
    return false;
  }

  if (
    cleanGuess ===
    cleanAnswer
  ) {
    return true;
  }

  if (
    cleanGuess.length >= 4
  ) {
    return (
      cleanAnswer.includes(
        cleanGuess
      ) ||
      cleanGuess.includes(
        cleanAnswer
      )
    );
  }

  return false;
}

function submitGuess() {
  if (
    state.roundFinished
  ) {
    return;
  }

  const track =
    getCurrentTrack();

  const guess =
    elements.guessInput.value
      .trim();

  if (!guess) {
    return;
  }

  if (
    isCorrectGuess(
      guess,
      track.title
    )
  ) {
    finishRound(
      true,
      "Correct! 🎉"
    );
  } else {
    state.streak =
      0;

    elements.streak.textContent =
      state.streak;

    showMessage(
      "Not quite. Try again!",
      "error"
    );

    elements.guessInput.select();
  }
}

function calculatePoints(
  track
) {
  const basePoints = {
    easy: 100,
    medium: 250,
    hard: 500,
    expert: 1000
  };

  let points =
    basePoints[
      track.difficulty
    ] || 250;

  points =
    Math.round(
      points *
      getCurrentStage()
        .multiplier
    );

  if (
    state.hintUsed
  ) {
    points =
      Math.round(
        points * 0.5
      );
  }

  if (
    state.streak >= 3
  ) {
    points =
      Math.round(
        points * 1.25
      );
  }

  return Math.max(
    points,
    1
  );
}

async function finishRound(
  correct,
  message
) {
  if (
    state.roundFinished
  ) {
    return;
  }

  state.roundFinished =
    true;

  clearInterval(
    state.stageTimer
  );

  await stopCurrentClip();

  const track =
    getCurrentTrack();

  elements.guessInput.disabled =
    true;

  elements.guessButton.disabled =
    true;

  elements.hintButton.disabled =
    true;

  elements.skipButton.disabled =
    true;

  elements.revealButton.disabled =
    true;

  updateClipButtons(
    false
  );

  let points =
    0;

  if (correct) {
    points =
      calculatePoints(
        track
      );

    state.score +=
      points;

    state.streak++;

    state.bestStreak =
      Math.max(
        state.bestStreak,
        state.streak
      );

    showMessage(
      `<strong>${message}</strong><br>+${points} points<br><span class="muted">${escapeHtml(
        track.title
      )} by ${escapeHtml(
        track.artists.join(", ")
      )}</span>`,
      "success"
    );
  } else {
    state.streak =
      0;

    showMessage(
      `<strong>${message}</strong><br>The answer was: <strong>${escapeHtml(
        track.title
      )}</strong> by ${escapeHtml(
        track.artists.join(", ")
      )}`,
      "error"
    );
  }

  elements.score.textContent =
    state.score;

  elements.streak.textContent =
    state.streak;

  state.roundResults.push({
    track,
    correct,
    points,
    stage:
      state.stageIndex + 1
  });

  setTimeout(
    () => {
      state.currentRoundIndex++;

      if (
        state.currentRoundIndex >=
        state.game.tracks.length
      ) {
        finishGame();
      } else {
        loadRound();
      }
    },
    2500
  );
}

function useHint() {
  if (
    state.hintUsed ||
    state.roundFinished
  ) {
    return;
  }

  const track =
    getCurrentTrack();

  state.hintUsed =
    true;

  elements.hintButton.disabled =
    true;

  const words =
    track.title.split(
      /\s+/
    );

  const masked =
    words.map(
      word => {
        if (
          word.length <= 2
        ) {
          return (
            word[0] + "•"
          );
        }

        return (
          word[0] +
          "•".repeat(
            word.length - 1
          )
        );
      }
    ).join(" ");

  showMessage(
    `💡 Hint: <strong>${escapeHtml(
      masked
    )}</strong><br>${words.length} word(s)<br><small>Points are reduced by 50%.</small>`,
    "info"
  );
}

function skipSong() {
  if (
    state.roundFinished
  ) {
    return;
  }

  finishRound(
    false,
    "Skipped ⏭"
  );
}

/* --------------------------------
   RESULTS
-------------------------------- */

function finishGame() {
  clearInterval(
    state.stageTimer
  );

  clearTimeout(
    state.clipStopTimer
  );

  elements.finalScore.textContent =
    state.score;

  elements.correctCount.textContent =
    state.roundResults.filter(
      result =>
        result.correct
    ).length;

  elements.bestStreak.textContent =
    state.bestStreak;

  elements.roundResults.innerHTML =
    state.roundResults.map(
      (result, index) => `
        <div
          class="round-result"
        >
          <div>
            <div
              class="round-result-title"
            >
              Round ${index + 1}:
              ${escapeHtml(
                result.track.title
              )}
            </div>

            <div
              class="round-result-meta"
            >
              ${escapeHtml(
                result.track.artists.join(
                  ", "
                )
              )}
              ·
              ${escapeHtml(
                result.track.difficulty
              ).toUpperCase()}
              ·
              Stage ${result.stage}
            </div>
          </div>

          <strong
            class="${
              result.correct
                ? "correct-result"
                : "wrong-result"
            }"
          >
            ${
              result.correct
                ? `✓ +${result.points}`
                : "✕"
            }
          </strong>
        </div>
      `
    ).join("");

  showScreen(
    "resultsScreen"
  );
}

/* --------------------------------
   EVENT LISTENERS
-------------------------------- */

elements.modeOptions.forEach(
  button => {
    button.addEventListener(
      "click",
      () => {
        setSourceMode(
          button.dataset.sourceMode
        );
      }
    );
  }
);

elements.searchButton.addEventListener(
  "click",
  searchArtists
);

elements.artistSearch.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter"
    ) {
      searchArtists();
    }
  }
);

elements.clearArtistButton.addEventListener(
  "click",
  clearArtist
);

elements.startButton.addEventListener(
  "click",
  startGame
);

elements.guessButton.addEventListener(
  "click",
  submitGuess
);

elements.guessInput.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter"
    ) {
      submitGuess();
    }
  }
);

elements.revealButton.addEventListener(
  "click",
  revealMore
);

elements.hintButton.addEventListener(
  "click",
  useHint
);

elements.skipButton.addEventListener(
  "click",
  skipSong
);

elements.quitButton.addEventListener(
  "click",
  async () => {
    clearInterval(
      state.stageTimer
    );

    await stopCurrentClip();

    state.game =
      null;

    showScreen(
      "homeScreen"
    );
  }
);

elements.playAgainButton.addEventListener(
  "click",
  () => {
    state.game =
      null;

    showScreen(
      "homeScreen"
    );
  }
);

/* --------------------------------
   INITIALIZATION
-------------------------------- */

async function checkServer() {
  try {
    const data =
      await apiFetch(
        "/api/health"
      );

    if (
      !data.spotifyConfigured
    ) {
      setSearchStatus(
        "Server is running, but Spotify credentials are not configured."
      );
    }

    const connected =
      await checkSpotifyConnection();

    if (
      connected
    ) {
      initializeSpotifyPlayer();
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    if (
      params.get(
        "spotify_connected"
      ) === "1"
    ) {
      state.spotifyConnected =
        true;

      window.history.replaceState(
        {},
        document.title,
        "/"
      );

      initializeSpotifyPlayer();
    }

    const spotifyError =
      params.get(
        "spotify_error"
      );

    if (
      spotifyError
    ) {
      alert(
        `Spotify connection failed: ${spotifyError}`
      );

      window.history.replaceState(
        {},
        document.title,
        "/"
      );
    }

  } catch {
    setSearchStatus(
      "Unable to connect to the SongGuess server."
    );
  }
}

function addSpotifyConnectionUI() {
  const existing =
    document.getElementById(
      "spotifyConnectionArea"
    );

  if (existing) {
    return;
  }

  const container =
    document.createElement(
      "div"
    );

  container.id =
    "spotifyConnectionArea";

  container.className =
    "spotify-connection";

  container.innerHTML =
    `
      <button
        id="spotifyConnectButton"
        class="spotify-connect-button"
      >
        Connect Spotify
      </button>

      <div
        id="spotifyPlayerStatus"
        class="spotify-player-status"
      >
        Connect your Spotify Premium account to enable blind playback.
      </div>
    `;

  elements.startButton
    .parentElement
    .insertBefore(
      container,
      elements.startButton
    );

  getSpotifyConnectButton()
    .addEventListener(
      "click",
      connectSpotify
    );

  updateSpotifyStatus();
}

setSourceMode(
  "artist"
);

addSpotifyConnectionUI();

checkServer();