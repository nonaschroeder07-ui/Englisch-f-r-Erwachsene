// Хранение прогресса на устройстве (localStorage).
// Всё в одном объекте под ключом "ec.v1".
const Store = (() => {
  const KEY = 'ec.v1';

  const defaults = () => ({
    createdAt: new Date().toISOString(),
    placement: null,            // { date, masteredTopic, startTopic } — после теста
    startTopic: 1,
    completedLessons: {},       // { "01-01": "2026-11-06" }
    lessonProgress: {},         // { "01-02": 3 } — на каком шаге остановилась (0–6)
    lessonResults: {},          // { "01-01": { correct, total, date } }
    cards: {},                  // карточки SM-2: { id: { ef, interval, reps, due } } — этап 4
    activity: {},               // { "2026-11-06": минуты }
    reviews: {},                // { "2026-11-06": сколько карточек повторено }
    settings: { reminder: '19:00', speechRate: 0.9 }
  });

  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = Object.assign(defaults(), JSON.parse(raw));
    data.settings = Object.assign(defaults().settings, data.settings);
  } catch (e) { /* хранилище недоступно — работаем с данными в памяти */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Серия дней: сколько дней подряд (включая сегодня или вчера) были занятия
  function streak() {
    let n = 0;
    const d = new Date();
    if (!data.activity[today()]) d.setDate(d.getDate() - 1);
    for (;;) {
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (!data.activity[k]) break;
      n++; d.setDate(d.getDate() - 1);
    }
    return n;
  }

  return {
    get: () => data,
    save,
    today,
    streak,
    update(fn) { fn(data); save(); },
    reset() { data = defaults(); save(); }
  };
})();
