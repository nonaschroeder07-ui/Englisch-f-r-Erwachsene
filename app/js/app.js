// Главный файл приложения: загрузка курса, навигация между экранами.
// Экраны переключаются по адресу после # (например, #/map, #/lesson/01-01).
(() => {
  const CONTENT = '../content/';
  const $screen = document.getElementById('screen');
  const $title = document.getElementById('screenTitle');
  const $back = document.getElementById('backBtn');
  const $streak = document.getElementById('streakBadge');

  let course = null;            // content/course.json
  const cache = {};             // загруженные JSON-файлы

  // ---------- помощники ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = obj => (obj && (obj.ru || obj.de)) || '';

  async function loadJSON(path) {
    if (cache[path]) return cache[path];
    const res = await fetch(CONTENT + path);
    if (!res.ok) throw new Error('Не удалось загрузить ' + path);
    cache[path] = await res.json();
    return cache[path];
  }

  function allLessons() {
    return course.topics.flatMap(tp => tp.lessons.map((l, i) => ({ ...l, topic: tp.number, index: i })));
  }

  // Урок открыт, если он написан и: тема уже пройдена тестом, это первый урок стартовой темы,
  // или предыдущий урок выполнен.
  function lessonState(lesson) {
    const s = Store.get();
    if (s.completedLessons[lesson.id]) return 'done';
    if (!lesson.ready) return 'soon';
    const list = allLessons();
    const pos = list.findIndex(l => l.id === lesson.id);
    if (lesson.topic < s.startTopic) return 'open';
    if (lesson.topic === s.startTopic && lesson.index === 0) return 'open';
    const prev = list[pos - 1];
    if (prev && s.completedLessons[prev.id]) return 'open';
    return 'locked';
  }

  function nextLesson() {
    return allLessons().find(l => lessonState(l) === 'open') || null;
  }

  function topicPercent(tp) {
    const done = tp.lessons.filter(l => Store.get().completedLessons[l.id]).length;
    return Math.round(done / tp.lessons.length * 100);
  }

  function setChrome(title, { back = false, tab = null } = {}) {
    $title.textContent = title;
    $back.hidden = !back;
    document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    $streak.textContent = '🔥 ' + Store.streak();
    const due = Review.availableToday();
    const $badge = document.getElementById('dueBadge');
    $badge.hidden = !due;
    $badge.textContent = due;
    window.scrollTo(0, 0);
  }

  // ---------- тест на уровень ----------
  // Вопросы идут по темам 1→12. После 3 ошибок подряд («Не знаю» = ошибка) тест останавливается.
  // Уровень = последняя тема, до которой включительно все вопросы отвечены верно.
  function runPlacement(test) {
    const qs = test.questions;
    const answers = {};          // id вопроса → true/false
    let i = 0, wrongInARow = 0;
    const started = Date.now();
    const stopAfter = test.rules.stopAfterWrongInARow || 3;

    function showQuestion() {
      const q = qs[i];
      const pct = Math.round(i / qs.length * 100);
      const isText = q.question.length > 60;   // короткий текст для чтения
      $screen.innerHTML = `
        <p class="small muted">Вопрос ${i + 1} из ${qs.length}</p>
        <div class="bar" style="margin:0 0 16px"><div style="width:${pct}%"></div></div>
        <div class="card">
          <p class="muted">${esc(t(q.instruction))}</p>
          ${isText ? `<blockquote class="reading">${esc(q.question)}</blockquote>`
                   : `<p class="question">${esc(q.question).replace('___', '<span class="gap">___</span>')}</p>`}
        </div>
        ${q.options.map((o, k) => `<button class="btn option" data-k="${k}">${esc(o)}</button>`).join('')}
        <button class="btn dontknow" data-k="-1">🤷 ${esc(t(test.rules.dontKnowLabel))}</button>`;
      $screen.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => answer(Number(b.dataset.k))));
    }

    function answer(k) {
      const q = qs[i];
      const ok = k === q.answer;
      answers[q.id] = ok;
      wrongInARow = ok ? 0 : wrongInARow + 1;
      i++;
      if (wrongInARow >= stopAfter || i >= qs.length) finish(i < qs.length);
      else showQuestion();
    }

    async function finish(stoppedEarly) {
      // Тема пройдена, если все её вопросы заданы и ошибок ≤ 1 (если вопрос один — он должен быть верным)
      const allowed = test.rules.allowedErrorsPerTopic ?? 0;
      let mastered = 0;
      for (let n = 1; n <= 12; n++) {
        const own = qs.filter(q => q.topic === n);
        const asked = own.every(q => q.id in answers);
        const errors = own.filter(q => answers[q.id] !== true).length;
        const limit = own.length > 1 ? allowed : 0;
        if (own.length && asked && errors <= limit) mastered = n; else break;
      }
      const startTopic = mastered >= 12 ? null : mastered + 1;
      const result = test.scoring.results.find(r => mastered === 0 ? r.id === 'from-zero' : mastered >= 12 ? r.id === 'a1-done' : r.id === 'from-topic');
      const knownTopics = mastered === 1 ? 'тему 1' : 'темы 1–' + mastered;
      const msg = t(result.message).replace('{knownTopics}', knownTopics).replace('{startTopic}', startTopic);
      const correct = Object.values(answers).filter(Boolean).length;
      const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));

      // Слова уже пройденных тем — в карточки (сразу к повторению, чтобы проверить, что они действительно знакомы)
      const vocab = await Review.loadVocab();
      const knownIds = Object.keys(vocab).filter(id => Number(vocab[id].lesson.slice(0, 2)) <= mastered);
      let addedCards = 0;

      Store.update(d => {
        knownIds.forEach(id => { if (!d.cards[id]) { d.cards[id] = Review.newCard({ due: Store.today(), lesson: vocab[id].lesson, fromTest: true }); addedCards++; } });
        d.placement = { date: Store.today(), masteredTopic: mastered, startTopic, correct, asked: Object.keys(answers).length };
        d.startTopic = startTopic || 12;
        d.activity[Store.today()] = (d.activity[Store.today()] || 0) + minutes;
      });

      const topic = startTopic && course.topics.find(tp => tp.number === startTopic);
      const first = topic && topic.lessons[0];
      setChrome('Результат теста', { back: true });
      $screen.innerHTML = `
        <div class="card hero">
          <div class="emoji">${mastered === 0 ? '🌱' : mastered >= 12 ? '🏆' : '🎯'}</div>
          <h2>${esc(msg)}</h2>
          <p class="muted">Правильных ответов: ${correct} из ${Object.keys(answers).length}${stoppedEarly ? ' · тест остановлен после 3 ошибок подряд' : ''}</p>
          ${addedCards ? `<p class="small muted">В повторение добавлено слов из пройденных тем: ${addedCards}</p>` : ''}
          ${first && first.ready ? `<a class="btn" href="#/lesson/${esc(first.id)}">Начать: ${esc(first.id)} · ${esc(t(first.title))}</a>` : ''}
          ${first && !first.ready ? `<p class="small muted">Уроки темы ${startTopic} ещё пишутся. Пока можно повторить пройденные темы.</p>` : ''}
          <a class="btn secondary" href="#/map">Открыть карту курса</a>
          <p class="small muted">Пройдите тест снова через месяц, чтобы увидеть прогресс.</p>
        </div>`;
    }

    showQuestion();
  }

  // ---------- экраны ----------
  const screens = {
    start() {
      setChrome('English A1', { tab: 'start' });
      const s = Store.get();
      const next = nextLesson();
      const total = allLessons().length;
      const done = Object.keys(s.completedLessons).length;

      let main;
      if (!s.placement && done === 0) {
        main = `
          <div class="card hero">
            <div class="emoji">👋</div>
            <h2>Hello! Добро пожаловать</h2>
            <p class="muted">15–20 минут в день — и через 3–4 месяца уровень A1.</p>
            <a class="btn" href="#/test">Пройти тест на уровень</a>
            <a class="btn secondary" href="#/lesson/01-01">Начать с нуля</a>
            <p class="small muted">Тест займёт около 10 минут и подскажет, с какой темы начать.</p>
          </div>`;
      } else {
        main = `
          <div class="card hero">
            <div class="emoji">📘</div>
            <h2>С возвращением!</h2>
            ${next ? `<p class="muted">Следующий урок: <b>${esc(next.id)}</b> — ${esc(t(next.title))}</p>
              <a class="btn" href="#/lesson/${esc(next.id)}">Продолжить урок</a>`
                   : `<p class="muted">Все готовые уроки пройдены. Новые скоро появятся!</p>`}
            ${Review.availableToday()
              ? `<a class="btn secondary" href="#/review">🔁 Повторить карточки (${Review.availableToday()})</a>`
              : `<p class="small muted">✅ Карточки на сегодня повторены</p>`}
          </div>`;
      }

      $screen.innerHTML = main + `
        <div class="stats">
          <div class="stat"><b>${Store.streak()}</b><span>дней подряд</span></div>
          <div class="stat"><b>${done}/${total}</b><span>уроков</span></div>
          <div class="stat"><b>${Object.keys(s.cards).length}</b><span>слов</span></div>
        </div>`;

      // Напоминание внутри приложения: время наступило, а сегодня ещё не занимались
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      if (hhmm >= s.settings.reminder && !s.activity[Store.today()] && (s.placement || done)) {
        $screen.insertAdjacentHTML('afterbegin', `<div class="card nudge">⏰ <b>Время для английского!</b> 15 минут — и серия дней продолжится.</div>`);
      }
    },

    async test() {
      setChrome('Тест на уровень', { back: true });
      const test = await loadJSON('placement-test.json');
      const last = Store.get().placement;
      $screen.innerHTML = `
        <div class="card">
          <h2>${esc(t(test.title))}</h2>
          <p>${esc(t(test.intro))}</p>
          <p class="muted">${test.questions.length} вопросов · ~${test.rules.durationMin} минут</p>
          ${last ? `<p class="small muted">Прошлый результат (${esc(last.date)}): стартовая тема ${last.startTopic ?? '— A1 пройден'}.</p>` : ''}
          <button class="btn" id="startTest">${last ? 'Пройти тест снова' : 'Начать тест'}</button>
        </div>`;
      document.getElementById('startTest').addEventListener('click', () => runPlacement(test));
    },

    map() {
      setChrome('Карта курса', { tab: 'map' });
      const icons = { done: '✅', open: '▶️', locked: '🔒', soon: '⏳' };
      $screen.innerHTML = course.topics.map(tp => {
        const pct = topicPercent(tp);
        const lessons = tp.lessons.map(l => {
          const st = lessonState({ ...l, topic: tp.number, index: tp.lessons.indexOf(l) });
          const label = `<span class="state">${icons[st]}</span><span>${esc(l.id)} · ${esc(t(l.title))}</span>`;
          return (st === 'open' || st === 'done')
            ? `<li><a href="#/lesson/${esc(l.id)}">${label}</a></li>`
            : `<li><span class="row locked">${label}${st === 'soon' ? ' <span class="badge">скоро</span>' : ''}</span></li>`;
        }).join('');
        return `
          <details class="card" ${tp.number === Store.get().startTopic ? 'open' : ''}>
            <summary class="topic-head">
              <span class="topic-icon">${tp.icon}</span>
              <span class="topic-title"><strong>Тема ${tp.number}. ${esc(t(tp.title))}</strong>
                <span class="small muted">${esc(t(tp.goal))}</span></span>
              <span class="small muted">${pct}%</span>
            </summary>
            <div class="bar"><div style="width:${pct}%"></div></div>
            <ul class="lesson-list">${lessons}</ul>
          </details>`;
      }).join('');
    },

    async lesson(id) {
      setChrome('Урок ' + id, { back: true });
      const meta = allLessons().find(l => l.id === id);
      if (!meta || !meta.ready) {
        $screen.innerHTML = `<div class="card"><h2>Урок ещё не готов</h2><p class="muted">Этот урок скоро появится.</p></div>`;
        return;
      }
      const lesson = await loadJSON('lessons/' + id + '.json');
      const resumeAt = Store.get().lessonProgress[id] || 0;
      const steps = [
        ['Повторение', 'карточки из прошлых уроков', 3],
        ['Ситуация', t(lesson.situation.context), 1],
        ['Новые слова', lesson.words.length + ' слов', 4],
        ['Правило', t(lesson.rule.title), 3],
        ['Практика', lesson.exercises.length + ' заданий', 5],
        ['Говорение', lesson.speaking.length + ' задания вслух', 2],
        ['Итог', 'что я теперь умею', 1]
      ];
      $screen.innerHTML = `
        <div class="card">
          <span class="badge">Тема ${lesson.topic.number} · ${esc(t(lesson.topic.title))}</span>
          <h2 style="margin-top:10px">${esc(t(lesson.title))}</h2>
          <p><b>Цель:</b> ${esc(t(lesson.goal))}</p>
          <p class="muted">⏱ ~${lesson.durationMin} минут</p>
        </div>
        <div class="card">
          <h2>План урока</h2>
          <ol class="steps">${steps.map(([n, d, m]) => `<li><div><b>${n}</b> <span class="muted small">· ${m} мин</span><br><span class="small muted">${esc(d)}</span></div></li>`).join('')}</ol>
        </div>
        <div class="card">
          <h2>Новые слова</h2>
          <p class="small muted">Нажмите 🔊, чтобы послушать.</p>
          <ul class="lesson-list">${lesson.words.map(w => `
            <li><span class="row">
              <button class="back" data-say="${esc(w.en)}" aria-label="Послушать">🔊</button>
              <span><b>${esc(w.en)}</b> <span class="muted small">${esc(w.ipa)}</span><br>${esc(t(w.translation))}</span>
            </span></li>`).join('')}</ul>
        </div>
        <button class="btn" id="startLesson">${resumeAt ? 'Продолжить с шага ' + (resumeAt + 1) : Store.get().completedLessons[id] ? 'Пройти урок ещё раз' : 'Начать урок'}</button>
        ${resumeAt ? '<button class="btn secondary" id="restartLesson">Начать сначала</button>' : ''}`;

      const ctx = {
        root: $screen, esc, t, setChrome,
        onDone(doneId) {
          const next = nextLesson();
          location.hash = next ? '#/lesson/' + next.id : '#/map';
        }
      };
      document.getElementById('startLesson').addEventListener('click', () => LessonPlayer.start(lesson, ctx, resumeAt));
      const rs = document.getElementById('restartLesson');
      if (rs) rs.addEventListener('click', () => LessonPlayer.start(lesson, ctx, 0));
    },

    review() {
      setChrome('Повторение', { tab: 'review' });
      const ds = Review.deckStats();
      const n = Review.availableToday();
      const dueAll = Review.dueIds().length;

      if (!ds.total) {
        $screen.innerHTML = `
          <div class="card hero">
            <div class="emoji">🔁</div>
            <h2>Пока карточек нет</h2>
            <p class="muted">Они появятся после первого урока: каждое новое слово становится карточкой.</p>
            <a class="btn" href="#/map">К урокам</a>
          </div>`;
        return;
      }

      const deck = `
        <div class="stats" style="margin-top:14px">
          <div class="stat"><b>${ds.fresh}</b><span>новые</span></div>
          <div class="stat"><b>${ds.learning}</b><span>учатся</span></div>
          <div class="stat"><b>${ds.strong}</b><span>закреплены</span></div>
        </div>`;

      if (!n) {
        const nextTxt = dueAll
          ? `Дневной лимит (${Review.DAILY_LIMIT}) выполнен — остальные ${dueAll} подождут до завтра.`
          : ds.nextDue ? `Следующее повторение: ${ds.nextDue === Review.addDays(1) ? 'завтра' : esc(ds.nextDue)}` + (ds.dueTomorrow ? ` (${ds.dueTomorrow} карт.)` : '') : '';
        $screen.innerHTML = `
          <div class="card hero">
            <div class="emoji">✅</div>
            <h2>На сегодня всё повторено</h2>
            <p class="muted">${nextTxt}</p>
            <p class="small muted">Повторять раньше срока не нужно: память крепнет, когда слово чуть-чуть забылось.</p>
          </div>${deck}`;
        return;
      }

      $screen.innerHTML = `
        <div class="card hero">
          <div class="emoji">🔁</div>
          <h2>К повторению: ${n}</h2>
          <p class="muted">Займёт примерно ${Math.max(1, Math.round(n * 0.3))} мин.</p>
          <button class="btn" id="startReview">Начать</button>
          <p class="small muted">Сначала попробуйте вспомнить сами, потом откройте ответ и честно оцените.</p>
        </div>${deck}`;
      document.getElementById('startReview').addEventListener('click', () => {
        Review.session($screen, {
          onFinish(r) {
            setChrome('Повторение', { tab: 'review' });
            const ds2 = Review.deckStats();
            $screen.innerHTML = `
              <div class="card hero">
                <div class="emoji">🎉</div>
                <h2>Готово!</h2>
                <p class="muted">Повторено: ${r.reviewed} · вспомнили: ${r.remembered}</p>
                ${ds2.nextDue ? `<p class="small muted">Следующее повторение: ${ds2.nextDue === Review.addDays(1) ? 'завтра' : esc(ds2.nextDue)}</p>` : ''}
                <a class="btn" href="#/start">На главную</a>
              </div>`;
          }
        });
      });
    },

    progress() {
      setChrome('Прогресс', { tab: 'progress' });
      const s = Store.get();
      const minutes = Object.values(s.activity).reduce((a, b) => a + b, 0);
      const done = Object.keys(s.completedLessons).length;
      const total = allLessons().length;
      const ds = Review.deckStats();
      const results = Object.values(s.lessonResults || {});
      const acc = results.length ? Math.round(results.reduce((a, r) => a + r.correct / r.total, 0) / results.length * 100) : null;

      // Последние 7 дней: минуты занятий
      const days = [];
      for (let k = 6; k >= 0; k--) {
        const d = new Date(); d.setDate(d.getDate() - k);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        days.push({ label: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()], min: s.activity[key] || 0, today: k === 0 });
      }
      const maxMin = Math.max(20, ...days.map(d => d.min));

      $screen.innerHTML = `
        <div class="stats">
          <div class="stat"><b>${Store.streak()}</b><span>дней подряд</span></div>
          <div class="stat"><b>${ds.total}</b><span>слов в карточках</span></div>
          <div class="stat"><b>${minutes}</b><span>минут занятий</span></div>
        </div>
        <div class="card" style="margin-top:14px">
          <h2>Последние 7 дней</h2>
          <div class="week">
            ${days.map(d => `<div class="day${d.today ? ' today' : ''}"><span class="min">${d.min || ''}</span><div class="col"><div style="height:${Math.round(d.min / maxMin * 100)}%"></div></div><span>${d.label}</span></div>`).join('')}
          </div>
          <p class="small muted">Минуты в день. Цель — 15–20 минут.</p>
        </div>
        <div class="card">
          <h2>Слова</h2>
          <p class="muted">🌱 новые: ${ds.fresh} · 📖 учатся: ${ds.learning} · 💪 закреплены: ${ds.strong}</p>
          <p class="small muted">«Закреплено» — слово помнится неделю и дольше.</p>
          ${ds.total ? `<div class="bar split"><div style="width:${Math.round(ds.strong / ds.total * 100)}%"></div><div class="mid" style="width:${Math.round(ds.learning / ds.total * 100)}%"></div></div>` : ''}
        </div>
        <div class="card">
          <h2>Курс A1</h2>
          <p class="muted">Пройдено уроков: ${done} из ${total}${acc !== null ? ` · верно с первой попытки: ${acc}%` : ''}</p>
          <div class="bar"><div style="width:${Math.round(done / total * 100)}%"></div></div>
        </div>
        <div class="card">
          <h2>По темам</h2>
          ${course.topics.map(tp => `
            <p style="margin:12px 0 4px">${tp.icon} ${esc(t(tp.title))} <span class="muted small">· ${topicPercent(tp)}%</span></p>
            <div class="bar"><div style="width:${topicPercent(tp)}%"></div></div>`).join('')}
        </div>
        ${s.placement ? `<div class="card"><h2>Тест на уровень</h2><p class="muted">Последний раз: ${esc(s.placement.date)}. Стартовая тема: ${s.placement.startTopic ?? '—'}</p></div>` : ''}`;
    },

    settings() {
      setChrome('Настройки', { tab: 'settings' });
      const st = Store.get().settings;
      $screen.innerHTML = `
        <div class="card">
          <label class="field"><span>⏰ Время напоминания</span>
            <input type="time" id="reminder" value="${esc(st.reminder)}"></label>
          <p class="small muted">Напоминания на телефоне заработают после установки приложения (этап 5).</p>
        </div>
        <div class="card">
          <label class="field"><span>🔊 Скорость озвучки: <b id="rateVal">${st.speechRate}</b></span>
            <input type="range" id="rate" min="0.5" max="1.2" step="0.1" value="${st.speechRate}"></label>
          <button class="btn secondary" id="testVoice">Послушать: “Hello! Nice to meet you.”</button>
          ${Speech.available() ? '' : '<p class="small" style="color:var(--bad)">Этот браузер не умеет озвучивать текст.</p>'}
        </div>
        <div class="card">
          <h2>📅 Напоминание в календаре</h2>
          <p class="small muted">Надёжнее всего напоминает календарь телефона. Скачайте событие «English A1» на каждый день в ${esc(st.reminder)} и откройте файл — календарь предложит его добавить.</p>
          <button class="btn secondary" id="ics">Добавить в календарь</button>
        </div>
        <div class="card">
          <h2>📲 Приложение на телефоне</h2>
          <div id="installBox"></div>
          <p class="small muted" id="offlineStatus"></p>
        </div>
        <div class="card">
          <h2>Сброс</h2>
          <p class="small muted">Удалит весь прогресс, карточки и результаты теста на этом устройстве.</p>
          <button class="btn danger" id="reset">Сбросить прогресс</button>
        </div>`;

      document.getElementById('reminder').addEventListener('change', e => {
        Store.update(d => { d.settings.reminder = e.target.value; });
        screens.settings();
      });
      document.getElementById('ics').addEventListener('click', () => downloadICS(Store.get().settings.reminder));
      renderInstallBox();
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('status');
      } else {
        document.getElementById('offlineStatus').textContent = 'Офлайн-режим включится после следующего открытия приложения.';
      }
      document.getElementById('rate').addEventListener('input', e => {
        const v = Number(e.target.value);
        document.getElementById('rateVal').textContent = v;
        Store.update(d => { d.settings.speechRate = v; });
      });
      document.getElementById('testVoice').addEventListener('click', () => Speech.speak('Hello! Nice to meet you.'));
      document.getElementById('reset').addEventListener('click', () => {
        if (confirm('Точно сбросить весь прогресс? Это нельзя отменить.')) {
          Store.reset();
          location.hash = '#/start';
        }
      });
    }
  };

  // ---------- установка, офлайн, календарь ----------
  let installPrompt = null;
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    if (document.getElementById('installBox')) renderInstallBox();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; if (document.getElementById('installBox')) renderInstallBox(); });

  function renderInstallBox() {
    const box = document.getElementById('installBox');
    if (!box) return;
    if (isInstalled()) {
      box.innerHTML = '<p>✅ Приложение установлено и открыто как отдельная программа.</p>';
    } else if (installPrompt) {
      box.innerHTML = '<p class="small muted">Иконка появится на главном экране, приложение будет открываться без браузера.</p><button class="btn" id="installBtn">Установить приложение</button>';
      document.getElementById('installBtn').addEventListener('click', async () => {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        renderInstallBox();
      });
    } else {
      box.innerHTML = `
        <p class="small"><b>Android (Chrome):</b> меню ⋮ → «Добавить на главный экран» / «Установить приложение».</p>
        <p class="small"><b>iPhone (Safari):</b> кнопка «Поделиться» ⬆️ → «На экран „Домой“».</p>
        <p class="small"><b>Компьютер (Chrome / Edge):</b> значок установки справа в адресной строке.</p>`;
    }
  }

  function downloadICS(time) {
    const [h, m] = time.split(':');
    const d = new Date();
    const date = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//English A1//RU', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:english-a1-daily-' + Date.now() + '@english-a1',
      'DTSTAMP:' + stamp,
      'DTSTART:' + date + 'T' + h + m + '00',
      'DURATION:PT20M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:English A1 — 15 минут английского',
      'DESCRIPTION:Повторить карточки и пройти урок. Серия дней ждёт!',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:Время для английского!', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'english-a1-reminder.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Индикатор «нет интернета»
  const $offline = document.getElementById('offlineBar');
  const updateOnline = () => { $offline.hidden = navigator.onLine; };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  // Service worker — сохраняет приложение и уроки для работы без интернета
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
    navigator.serviceWorker.addEventListener('message', e => {
      const el = document.getElementById('offlineStatus');
      if (e.data && e.data.type === 'status' && el) el.textContent = `✅ Работает без интернета: сохранено файлов — ${e.data.files} (версия ${e.data.version}).`;
    });
  }

  // ---------- навигация ----------
  async function route() {
    LessonPlayer.stop();
    const [, name = 'start', arg] = (location.hash || '#/start').split('/');
    const fn = screens[name] || screens.start;
    try {
      await fn(arg);
    } catch (e) {
      console.error(e);
      $screen.innerHTML = `<div class="card"><h2>Что-то пошло не так</h2><p class="muted">${esc(e.message)}</p></div>`;
    }
  }

  // Кнопки 🔊 на любом экране
  $screen.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) Speech.speak(b.dataset.say, b.dataset.rate ? Number(b.dataset.rate) : undefined);
  });
  $back.addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/start')));
  window.addEventListener('hashchange', route);

  (async () => {
    try {
      course = await loadJSON('course.json');
      route();
    } catch (e) {
      $screen.innerHTML = `<div class="card"><h2>Не удалось загрузить курс</h2>
        <p class="muted">Откройте приложение через локальный сервер (serve.ps1), а не двойным щелчком по файлу.</p></div>`;
    }
  })();
})();
