(() => {
  const audio = document.getElementById("background-music");
  const controls = document.querySelector(".music-controls");
  const toggle = document.getElementById("music-toggle");
  const volume = document.getElementById("music-volume");
  const status = document.getElementById("music-status");
  if (!audio || !controls || !toggle || !volume || !status) return;

  audio.volume = Number(volume.value) / 100;
  audio.hidden = true;
  controls.hidden = false;

  const update = () => {
    toggle.textContent = audio.paused ? "Ouvir música" : "Pausar música";
    toggle.setAttribute("aria-pressed", String(!audio.paused));
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
  audio.addEventListener("error", showError);
  toggle.addEventListener("click", () => {
    if (audio.paused) audio.play().catch(showError);
    else audio.pause();
  });
  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value) / 100;
  });

  // Browsers may allow background playback for returning visitors.
  // A blocked attempt leaves the explicit play control available.
  audio.play().catch((error) => {
    if (error.name !== "NotAllowedError") showError();
  });
})();
