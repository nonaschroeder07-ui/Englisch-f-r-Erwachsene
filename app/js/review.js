// Повторение карточек по адаптированному SM-2 (см. docs/methodology.md, раздел 2).
// Кнопки: Не помню (q=1), Трудно (q=3), Хорошо (q=4), Легко (q=5).
// Первые интервалы: 1 → 3 → 7 → 14 дней, дальше интервал × EF.
const Review = (() => {
  const SCHEDULE = [1, 3, 7, 14];
  const DAILY_LIMIT = 20;
  const GRADES = [
    { q: 1, label: 'Не помню', cls: 'g-again' },
    { q: 3, label: 'Трудно', cls: 'g-hard' },
    { q: 4, label: 'Хорошо', cls: 'g-good' },
    { q: 5, label: 'Легко', cls: 'g-easy' }
  ];

  let vocab = null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); }

  async function loadVocab() {
    if (!vocab) vocab = (await fetch('../content/vocabulary-a1.json').then(r => r.json())).items;
    return vocab;
  }

  // Новая карточка
  function newCard(extra = {}) {
    return Object.assign({ ef: 2.5, reps: 0, interval: 0, due: addDays(1), added: Store.today() }, extra);
  }

  // Расчёт следующего повторения
  function schedule(card, q) {
    const c = Object.assign({}, card);
    if (q < 3) {
      c.reps = 0; c.interval = 1; c.lapses = (c.lapses || 0) + 1;
    } else {
      const base = c.reps < SCHEDULE.length ? SCHEDULE[c.reps] : Math.round(c.interval * c.ef);
      c.interval = q === 3 ? Math.max(1, Math.round(base * 0.6)) : q === 5 ? Math.round(base * 1.5) : base;
      c.reps++;
    }
    c.ef = Math.max(1.3, +(c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(2));
    c.due = addDays(c.interval);
    c.last = Store.today();
    return c;
  }

  function humanInterval(n) {
    if (n <= 1) return 'завтра';
    if (n < 30) return n + ' дн.';
    return Math.round(n / 30) + ' мес.';
  }

  function dueIds() {
    const today = Store.today();
    return Object.entries(Store.get().cards)
      .filter(([, c]) => c.due <= today)
      .sort((a, b) => a[1].due.localeCompare(b[1].due))
      .map(([id]) => id);
  }

  function reviewedToday() { return (Store.get().reviews || {})[Store.today()] || 0; }

  // Сколько можно повторить сегодня с учётом дневного лимита
  function availableToday() {
    return Math.min(dueIds().length, Math.max(0, DAILY_LIMIT - reviewedToday()));
  }

  // Статистика колоды: новые (ещё не повторялись), учатся (<7 дней), закреплены (≥7 дней)
  function deckStats() {
    const cards = Object.values(Store.get().cards);
    return {
      total: cards.length,
      fresh: cards.filter(c => !c.last).length,
      learning: cards.filter(c => c.last && c.interval < 7).length,
      strong: cards.filter(c => c.interval >= 7).length,
      dueTomorrow: cards.filter(c => c.due === addDays(1)).length,
      nextDue: cards.map(c => c.due).filter(d => d > Store.today()).sort()[0] || null
    };
  }

  // Сессия повторения в контейнере. opts: { limit, onFinish(result) }
  async function session(container, opts = {}) {
    const words = await loadVocab();
    const limit = Math.min(opts.limit || DAILY_LIMIT, Math.max(0, DAILY_LIMIT - reviewedToday()));
    const queue = dueIds().filter(id => words[id]).slice(0, limit).map(id => ({ id, again: false }));
    const total = queue.length;
    const started = Date.now();
    const result = { reviewed: 0, remembered: 0 };
    let pos = 0;

    if (!total) { finish(); return; }

    function show() {
      if (pos >= queue.length) return finish();
      const { id, again } = queue[pos];
      const card = Store.get().cards[id];
      const w = words[id];
      // Сначала узнавание (EN → RU), после первого успешного повторения — чередуем с вспоминанием (RU → EN)
      const production = card.reps > 0 && card.reps % 2 === 1;
      const front = production
        ? `<p class="small muted">Как это по-английски? Скажите вслух.</p>
           <div class="word-en">${esc(w.translation.ru)}</div>
           <p class="small muted">по-немецки: ${esc(w.translation.de)}</p>`
        : `<p class="small muted">Что это значит?</p>
           <div class="word-en">${esc(w.en)} <button class="icon-btn" data-say="${esc(w.en)}">🔊</button></div>
           <div class="muted">${esc(w.ipa)}</div>`;
      container.innerHTML = `
        <p class="small muted">Карточка ${Math.min(pos + 1, queue.length)} из ${queue.length}${again ? ' · <b>ещё раз</b>' : ''}</p>
        <div class="bar" style="margin:0 0 14px"><div style="width:${Math.round(pos / queue.length * 100)}%"></div></div>
        <div class="card word-card flashcard">
          ${front}
          <div id="back"></div>
        </div>
        <button class="btn" id="flip">Показать ответ</button>
        <div class="grades" id="grades" hidden></div>`;
      if (!production) Speech.speak(w.en);

      document.getElementById('flip').addEventListener('click', () => {
        document.getElementById('flip').hidden = true;
        document.getElementById('back').innerHTML = `
          <hr>
          ${production
            ? `<div class="word-en">${esc(w.en)} <button class="icon-btn" data-say="${esc(w.en)}">🔊</button></div><div class="muted">${esc(w.ipa)}</div>`
            : `<p class="word-tr">${esc(w.translation.ru)}</p><p class="small muted">по-немецки: ${esc(w.translation.de)}</p>`}`;
        if (production) Speech.speak(w.en);
        const g = document.getElementById('grades');
        g.hidden = false;
        g.innerHTML = `<p class="small muted" style="grid-column:1/-1;margin:0">Насколько легко вспомнили?</p>` +
          GRADES.map(x => `<button class="btn grade ${x.cls}" data-q="${x.q}">${x.label}<small>${x.q < 3 ? 'завтра' : humanInterval(schedule(card, x.q).interval)}</small></button>`).join('');
        g.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => grade(id, Number(b.dataset.q), again)));
      });
    }

    function grade(id, q, again) {
      const card = Store.get().cards[id];
      Store.update(d => {
        // Повтор внутри сессии (после «Не помню») — только тренировка: карточка уже назначена на завтра,
        // поэтому её расписание и коэффициент лёгкости второй раз не меняем
        if (!again) d.cards[id] = schedule(card, q);
        if (!again) {
          d.reviews = d.reviews || {};
          d.reviews[Store.today()] = (d.reviews[Store.today()] || 0) + 1;
        }
      });
      if (!again) { result.reviewed++; if (q >= 3) result.remembered++; }
      // «Не помню» — карточка ещё раз в конце этой же сессии
      if (q < 3 && !again) queue.push({ id, again: true });
      pos++;
      show();
    }

    function finish() {
      if (result.reviewed) {
        const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
        Store.update(d => { d.activity[Store.today()] = (d.activity[Store.today()] || 0) + minutes; });
      }
      if (opts.onFinish) opts.onFinish(result);
    }

    show();
  }

  return { session, newCard, schedule, dueIds, availableToday, deckStats, humanInterval, loadVocab, DAILY_LIMIT, addDays };
})();
