// Озвучка английского через синтез речи браузера.
const Speech = (() => {
  let voice = null;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    voice = voices.find(v => v.lang === 'en-GB') ||
            voices.find(v => v.lang && v.lang.startsWith('en')) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  return {
    available: () => 'speechSynthesis' in window,
    // rate — скорость (по умолчанию из настроек), onend — вызывается после окончания фразы
    speak(text, rate, onend) {
      if (!('speechSynthesis' in window)) { if (onend) onend(); return false; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      if (voice) u.voice = voice;
      u.rate = rate || Store.get().settings.speechRate || 0.9;
      if (onend) { u.onend = onend; u.onerror = onend; }
      speechSynthesis.speak(u);
      return true;
    },
    // Несколько фраз подряд с небольшой паузой
    speakAll(texts, rate) {
      let i = 0;
      const nextOne = () => { if (i < texts.length) Speech.speak(texts[i++], rate, () => setTimeout(nextOne, 350)); };
      nextOne();
    },
    stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  };
})();
