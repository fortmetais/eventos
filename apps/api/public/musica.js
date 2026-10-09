(() => {
  const audio = document.getElementById("background-music");
  const controls = document.querySelector(".music-controls");
  const toggle = document.getElementById("music-toggle");
  const status = document.getElementById("music-status");
  if (!audio || !controls || !toggle || !status) return;

  audio.volume = 0.3;
  controls.hidden = false;

  const update = () => {
    const silent = audio.paused || audio.muted;
    const label = silent ? "Ativar som da música" : "Silenciar música";
    toggle.dataset.silent = String(silent);
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  };
  const showError = () => {
    status.textContent = "Não foi possível tocar a música. Tente novamente.";
    status.hidden = false;
    update();
  };

  audio.addEventListener("play", () => {
    status.hidden = true;
    update();
  });
  audio.addEventListener("pause", update);
  audio.addEventListener("volumechange", update);
  audio.addEventListener("error", showError);
  toggle.addEventListener("click", () => {
    if (audio.paused || audio.muted) {
      audio.muted = false;
      audio.play().catch(showError);
    } else {
      audio.muted = true;
    }
    update();
  });

  update();
  // Try audible playback at the configured volume; when blocked, the icon
  // provides the user gesture required by the browser to start the music.
  audio.play().catch((error) => {
    if (error.name === "NotAllowedError") update();
    else showError();
  });
})();
