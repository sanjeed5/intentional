// Myinstants hits for the brain-rot takeover. Offscreen so Chrome will
// play them without a click on the page. Demo-only, not for shipping.

function playFile(path, volume = 1) {
  const audio = new Audio(chrome.runtime.getURL(path));
  audio.volume = volume;
  return audio.play();
}

function playSynthFallback() {
  const ctx = new AudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(72, now);
  osc.frequency.exponentialRampToValueAtTime(38, now + 0.28);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.9, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
  setTimeout(() => ctx.close().catch(() => {}), 600);
}

async function playSting() {
  try {
    await playFile("sounds/record-scratch.mp3", 0.85);
    setTimeout(() => {
      playFile("sounds/vine-boom.mp3", 1).catch(() => {});
    }, 140);
  } catch {
    playFile("sounds/vine-boom.mp3", 1).catch(playSynthFallback);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "OFFSCREEN_PLAY_STING") playSting();
});
