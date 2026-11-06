// Прохождение урока: 7 шагов по docs/lesson-format.md.
// повторение → ситуация → слова → правило → практика → говорение → итог
const LessonPlayer = (() => {
  const NAMES = ['Повторение', 'Ситуация', 'Новые слова', 'Правило', 'Практика', 'Говорение', 'Итог'];

  let L = null;        // урок (JSON)
  let root = null;     // контейнер экрана
  let ctx = null;      // помощники из app.js: esc, t, setChrome, onDone
  let step = 0;
  let started = 0;
  let stats = null;    // { correct, total }

  const esc = s => ctx.esc(s);
  const t = o => ctx.t(o);
  const de = o => (o && o.de) || '';

  // ---------- общие элементы ----------
  function frame(inner) {
    ctx.setChrome('Урок ' + L.id, { back: true });
    const dots = NAMES.map((n, i) => `<span class="${i < step ? 'done' : i === step ? 'now' : ''}" title="${n}"></span>`).join('');
    root.innerHTML = `
      <div class="stepper">${dots}</div>
      <p class="small muted step-label">Шаг ${step + 1} из 7 · <b>${NAMES[step]}</b></p>
      ${inner}`;
    window.scrollTo(0, 0);
  }

  function nextStep() {
    Speech.stop();
    step++;
    Store.update(d => { d.lessonProgress[L.id] = step; });
    render();
  }

  function on(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); }

  const say = (text, label = '🔊') => `<button class="icon-btn" data-say="${esc(text)}" aria-label="Послушать">${label}</button>`;
  const saySlow = text => `<button class="icon-btn" data-say="${esc(text)}" data-rate="0.6" aria-label="Медленно">🐢</button>`;

  // Сравнение ответов: регистр, лишние пробелы, знаки препинания и «кривые» апострофы не важны
  const norm = s => String(s).toLowerCase().replace(/[’‘`´]/g, "'").replace(/[.,!?;:"«»]/g, ' ').replace(/\s+/g, ' ').trim();
  const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

  // ---------- шаг 1: повторение ----------
  // До 10 карточек (~3 минуты), остальные — на экране «Повторить»
  function stepReview() {
    const n = Math.min(10, Review.availableToday());
    if (!n) {
      frame(`
        <div class="card hero">
          <div class="emoji">🔁</div>
          <h2>Сегодня повторять нечего</h2>
          <p class="muted">Начнём сразу с нового материала.</p>
          <button class="btn" id="go">Дальше</button>
        </div>`);
      on('go', nextStep);
      return;
    }
    frame(`<div id="rv"></div>`);
    Review.session(document.getElementById('rv'), {
      limit: 10,
      onFinish(r) {
        document.getElementById('rv').innerHTML = `
          <div class="card hero">
            <div class="emoji">👍</div>
            <h2>Разминка готова</h2>
            <p class="muted">Повторено: ${r.reviewed}, вспомнили: ${r.remembered}</p>
            <button class="btn" id="go">Дальше: новый материал</button>
          </div>`;
        on('go', nextStep);
      }
    });
  }

  // ---------- шаг 2: ситуация ----------
  function stepSituation() {
    const s = L.situation;
    frame(`
      <div class="card">
        <p class="muted">${esc(t(s.context))}</p>
        <button class="btn secondary" id="playAll">▶ Прослушать диалог</button>
        <div class="dialogue">
          ${s.lines.map(l => `
            <div class="line">
              <div class="line-head"><b>${esc(l.speaker)}</b>${say(l.en)}</div>
              <p class="en">${esc(l.en)}</p>
              <details><summary class="small">Показать перевод</summary><p class="small muted">${esc(t(l.translation))}<br><i>${esc(de(l.translation))}</i></p></details>
            </div>`).join('')}
        </div>
        <p class="small muted">Сначала попробуйте понять сами, перевод — только если нужно.</p>
      </div>
      <button class="btn" id="go">Дальше: новые слова</button>`);
    on('playAll', () => Speech.speakAll(s.lines.map(l => l.en)));
    on('go', nextStep);
  }

  // ---------- шаг 3: новые слова ----------
  function stepWords(i = 0) {
    const w = L.words[i];
    frame(`
      <p class="small muted">Слово ${i + 1} из ${L.words.length}</p>
      <div class="card word-card">
        <div class="word-emoji">${esc(w.image || '📝')}</div>
        <div class="word-en">${esc(w.en)} ${say(w.en)} ${saySlow(w.en)}</div>
        <div class="muted">${esc(w.ipa)}</div>
        <div id="reveal">
          <p class="small muted">Знаете, что это значит? Попробуйте вспомнить, потом откройте.</p>
          <button class="btn secondary" id="show">Показать перевод</button>
        </div>
      </div>
      <button class="btn" id="go" hidden>${i + 1 < L.words.length ? 'Следующее слово' : 'Дальше: правило'}</button>`);
    Speech.speak(w.en);
    on('show', () => {
      document.getElementById('reveal').innerHTML = `
        <p class="word-tr">${esc(t(w.translation))}</p>
        <p class="small muted">по-немецки: ${esc(de(w.translation))}</p>
        <div class="example"><b>${esc(w.example.en)}</b> ${say(w.example.en)}<br><span class="small muted">${esc(t(w.example.translation))}</span></div>
        ${w.association ? `<p class="tip">💡 ${esc(t(w.association))}</p>` : ''}
        ${w.germanBridge ? `<p class="tip">🇩🇪 ${esc(w.germanBridge)}</p>` : ''}
        ${w.falseFriend ? `<p class="tip warn">${esc(t(w.falseFriend))}</p>` : ''}`;
      document.getElementById('go').hidden = false;
    });
    on('go', () => (i + 1 < L.words.length ? stepWords(i + 1) : nextStep()));
  }

  // ---------- шаг 4: правило ----------
  function stepRule() {
    const r = L.rule;
    const table = r.table ? `
      <div class="table-wrap"><table>
        <thead><tr>${r.table[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${r.table.slice(1).map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>` : '';
    frame(`
      <div class="card">
        <h2>${esc(t(r.title))}</h2>
        <p>${esc(t(r.explanation))}</p>
        ${table}
        <h3>Примеры</h3>
        ${r.examples.map(e => `<div class="example"><b>${esc(e.en)}</b> ${say(e.en)}<br><span class="small muted">${esc(t(e.translation))}</span></div>`).join('')}
        ${r.germanBridge ? `<p class="tip">🇩🇪 ${esc(t(r.germanBridge))}</p>` : ''}
        ${r.commonMistake ? `<p class="tip warn">❌ <s>${esc(r.commonMistake.wrong)}</s> → ✅ <b>${esc(r.commonMistake.right)}</b><br><span class="small">${esc(t(r.commonMistake.why))}</span></p>` : ''}
      </div>
      <button class="btn" id="go">Понятно, к практике</button>`);
    on('go', nextStep);
  }

  // ---------- шаг 5: практика ----------
  function stepPractice() {
    // Очередь упражнений; ошибочные один раз повторяются в конце
    const queue = L.exercises.map(e => ({ ex: e, retry: false }));
    stats = { correct: 0, total: L.exercises.length };
    let pos = 0;

    function show() {
      if (pos >= queue.length) return nextStep();
      const { ex, retry } = queue[pos];
      const head = `
        <p class="small muted">Задание ${Math.min(pos + 1, queue.length)} из ${queue.length}${retry ? ' · <b>ещё раз</b>' : ''}${ex.review ? ' · <span class="badge">повторение</span>' : ''}</p>
        <p class="instr">${esc(t(ex.instruction))}</p>`;
      const r = Exercises[ex.type] ? Exercises[ex.type](ex) : { html: '<p>Неизвестный тип задания</p>', setup: (done) => done(true, '') };
      frame(head + r.html + `<div id="feedback"></div>`);
      r.setup((ok, correctText) => feedback(ok, correctText, ex, retry));
    }

    function feedback(ok, correctText, ex, retry) {
      if (!retry) { if (ok) stats.correct++; else queue.push({ ex, retry: true }); }
      root.querySelectorAll('.answer-zone button, .answer-zone input').forEach(el => { el.disabled = true; });
      const fb = document.getElementById('feedback');
      fb.innerHTML = `
        <div class="fb ${ok ? 'good' : 'bad'}">
          <b>${ok ? '✅ Верно!' : '❌ Не совсем.'}</b>
          ${!ok && correctText ? `<p>Правильно: <b>${esc(correctText)}</b></p>` : ''}
          <p class="small">${esc(t(ex.explanation))}</p>
          ${!ok && !retry ? '<p class="small muted">Это задание вернётся в конце — попробуете ещё раз.</p>' : ''}
        </div>
        <button class="btn" id="nextEx">Дальше</button>`;
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      on('nextEx', () => { pos++; show(); });
    }

    show();
  }

  // Типы упражнений. Каждый возвращает { html, setup(done) }, done(ok, правильныйОтвет)
  const Exercises = {
    choice(ex) {
      return {
        html: `
          <div class="card"><p class="question">${esc(ex.question).replace('___', '<span class="gap">___</span>')}</p></div>
          <div class="answer-zone">${ex.options.map((o, k) => `<button class="btn option" data-k="${k}">${esc(o)}</button>`).join('')}</div>`,
        setup(done) { bindOptions(ex, done); }
      };
    },

    listen(ex) {
      const audio = `
        <div class="card listen-box">
          ${say(ex.audioText, '🔊 Слушать')} ${saySlow(ex.audioText)}
        </div>`;
      setTimeout(() => Speech.speak(ex.audioText), 300);
      if (ex.options) {
        return {
          html: audio + `<div class="answer-zone">${ex.options.map((o, k) => `<button class="btn option" data-k="${k}">${esc(o)}</button>`).join('')}</div>`,
          setup(done) { bindOptions(ex, done); }
        };
      }
      return textAnswer(audio, ex.answers);
    },

    gap(ex) {
      return textAnswer(`<div class="card"><p class="question">${esc(ex.text).replace('___', '<span class="gap">___</span>')}</p></div>`, ex.answers, ex.hint);
    },

    translate(ex) {
      return textAnswer(`<div class="card"><p class="question">${esc(t(ex.prompt))}</p><p class="small muted">по-немецки: ${esc(de(ex.prompt))}</p></div>`, ex.answers);
    },

    build(ex) {
      const tokens = shuffle(ex.tokens);
      return {
        html: `
          <div class="card"><div class="built" id="built"><span class="muted small">Нажимайте на слова по порядку</span></div></div>
          <div class="answer-zone">
            <div class="chips" id="chips">${tokens.map((w, k) => `<button class="chip" data-k="${k}">${esc(w)}</button>`).join('')}</div>
            <button class="btn" id="check">Проверить</button>
          </div>`,
        setup(done) {
          const picked = [];
          const $built = document.getElementById('built');
          const redraw = () => {
            $built.innerHTML = picked.length
              ? picked.map((k, idx) => `<button class="chip on" data-idx="${idx}">${esc(tokens[k])}</button>`).join('')
              : '<span class="muted small">Нажимайте на слова по порядку</span>';
            root.querySelectorAll('#chips .chip').forEach(c => { c.hidden = picked.includes(Number(c.dataset.k)); });
          };
          root.querySelector('#chips').addEventListener('click', e => {
            const c = e.target.closest('.chip'); if (!c || c.disabled) return;
            picked.push(Number(c.dataset.k)); redraw();
          });
          $built.addEventListener('click', e => {
            const c = e.target.closest('.chip'); if (!c || c.disabled) return;
            picked.splice(Number(c.dataset.idx), 1); redraw();
          });
          on('check', () => {
            if (!picked.length) return;
            const given = picked.map(k => tokens[k]).join(' ');
            $built.querySelectorAll('.chip').forEach(c => { c.disabled = true; });
            done(norm(given) === norm(ex.answer), ex.answer.replace(/ ([?!.,])/g, '$1'));
          });
        }
      };
    },

    match(ex) {
      const right = shuffle(ex.pairs.map(p => p[1]));
      return {
        html: `
          <div class="answer-zone match">
            <div>${ex.pairs.map((p, k) => `<button class="btn option m-left" data-k="${k}">${esc(p[0])}</button>`).join('')}</div>
            <div>${right.map(r => `<button class="btn option m-right" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
          </div>
          <p class="small muted">Нажмите слово слева, потом его перевод справа.</p>`,
        setup(done) {
          let sel = null, mistakes = 0, matched = 0;
          root.querySelectorAll('.m-left').forEach(b => b.addEventListener('click', () => {
            if (b.classList.contains('ok')) return;
            root.querySelectorAll('.m-left').forEach(x => x.classList.remove('sel'));
            b.classList.add('sel'); sel = Number(b.dataset.k);
            Speech.speak(ex.pairs[sel][0]);
          }));
          root.querySelectorAll('.m-right').forEach(b => b.addEventListener('click', () => {
            if (sel === null || b.classList.contains('ok')) return;
            const left = root.querySelector(`.m-left[data-k="${sel}"]`);
            if (ex.pairs[sel][1] === b.dataset.v) {
              left.classList.remove('sel'); left.classList.add('ok'); b.classList.add('ok');
              sel = null; matched++;
              if (matched === ex.pairs.length) done(mistakes === 0, '');
            } else {
              mistakes++; b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600);
            }
          }));
        }
      };
    }
  };

  function bindOptions(ex, done) {
    root.querySelectorAll('.answer-zone [data-k]').forEach(b => b.addEventListener('click', () => {
      const k = Number(b.dataset.k);
      const ok = k === ex.answer;
      b.classList.add(ok ? 'ok' : 'wrong');
      if (!ok) root.querySelector(`.answer-zone [data-k="${ex.answer}"]`).classList.add('ok');
      done(ok, ex.options[ex.answer]);
    }));
  }

  // Ответ вводом текста; подсказка ступенями: первая буква → весь ответ
  function textAnswer(top, answers, hint) {
    return {
      html: top + `
        <div class="answer-zone">
          <input type="text" class="text-in" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ваш ответ…">
          <button class="btn" id="check">Проверить</button>
          <button class="btn secondary" id="hint">💡 Подсказка</button>
          <p class="small muted" id="hintText"></p>
        </div>`,
      setup(done) {
        const $in = document.getElementById('ans');
        let hints = 0;
        setTimeout(() => $in.focus(), 50);
        const check = () => {
          if (!$in.value.trim()) return;
          const ok = answers.some(a => norm(a) === norm($in.value));
          $in.classList.add(ok ? 'ok' : 'wrong');
          done(ok, answers[0]);
        };
        on('check', check);
        $in.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
        on('hint', () => {
          hints++;
          const a = answers[0];
          const words = a.split(' ');
          document.getElementById('hintText').textContent =
            hints === 1 ? (hint ? t(hint) + ' · ' : '') + 'Начинается на «' + a[0] + '…», слов: ' + words.length
                        : 'Ответ: ' + a;
        });
      }
    };
  }

  // ---------- шаг 6: говорение ----------
  function stepSpeaking(i = 0) {
    const s = L.speaking[i];
    const text = s.type === 'repeat' ? s.phrase : s.question;
    frame(`
      <p class="small muted">Задание ${i + 1} из ${L.speaking.length}</p>
      <div class="card">
        <p class="instr">${esc(t(s.instruction))}</p>
        <p class="question">${s.type === 'repeat' ? esc(s.phrase) : '❓ ' + esc(s.question)}</p>
        <div>${say(text, '🔊 Слушать')} ${saySlow(text)}</div>
      </div>
      <div class="card">
        <button class="btn rec" id="rec">🎙 Записать себя</button>
        <div id="mine"></div>
        ${s.type === 'answer' ? `<button class="btn secondary" id="examples">Показать примеры ответа</button><div id="exList"></div>` : ''}
        <p class="small muted" id="recNote"></p>
      </div>
      <div class="self">
        <button class="btn" id="good">✅ Получилось</button>
        <button class="btn secondary" id="again">🔁 Ещё раз</button>
      </div>`);
    setTimeout(() => Speech.speak(text), 300);

    Recorder.bind(document.getElementById('rec'), document.getElementById('mine'), document.getElementById('recNote'));
    on('examples', () => {
      document.getElementById('exList').innerHTML = `<ul class="examples">${s.expected.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    });
    on('good', () => { Recorder.stop(); i + 1 < L.speaking.length ? stepSpeaking(i + 1) : nextStep(); });
    on('again', () => { Recorder.stop(); stepSpeaking(i); });
  }

  // Запись своего голоса (микрофон браузера). Если микрофона нет — остаётся самооценка.
  const Recorder = (() => {
    let rec = null, stream = null;
    function stop() {
      if (rec && rec.state === 'recording') rec.stop();
      if (stream) stream.getTracks().forEach(tr => tr.stop());
      rec = null; stream = null;
    }
    function bind(btn, out, note) {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        btn.disabled = true;
        note.textContent = 'Запись голоса в этом браузере недоступна. Скажите фразу вслух и оцените себя сами.';
        return;
      }
      btn.addEventListener('click', async () => {
        if (rec && rec.state === 'recording') { stop(); btn.textContent = '🎙 Записать ещё раз'; btn.classList.remove('on'); return; }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          note.textContent = 'Нет доступа к микрофону. Разрешите его в браузере или просто скажите фразу вслух.';
          return;
        }
        const chunks = [];
        rec = new MediaRecorder(stream);
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = () => {
          const url = URL.createObjectURL(new Blob(chunks, { type: chunks[0] ? chunks[0].type : 'audio/webm' }));
          out.innerHTML = `<p class="small muted">Ваша запись — сравните с образцом:</p><audio controls src="${url}"></audio>`;
        };
        rec.start();
        btn.textContent = '⏹ Остановить запись';
        btn.classList.add('on');
        note.textContent = 'Говорите…';
        setTimeout(() => { if (rec && rec.state === 'recording') { stop(); btn.textContent = '🎙 Записать ещё раз'; btn.classList.remove('on'); note.textContent = ''; } }, 10000);
      });
    }
    return { bind, stop };
  })();

  // ---------- шаг 7: итог ----------
  function stepSummary() {
    const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
    const today = Store.today();
    let added = 0;
    Store.update(d => {
      d.completedLessons[L.id] = d.completedLessons[L.id] || today;
      if (stats) d.lessonResults[L.id] = { correct: stats.correct, total: stats.total, date: today };
      delete d.lessonProgress[L.id];
      d.activity[today] = (d.activity[today] || 0) + minutes;
      // Новые карточки: первое повторение — завтра (SM-2 начинает с интервала 1 день)
      L.cards.forEach(id => {
        if (!d.cards[id]) { d.cards[id] = Review.newCard({ lesson: L.id }); added++; }
      });
    });
    const res = stats ? `${stats.correct} из ${stats.total}` : '—';
    frame(`
      <div class="card hero">
        <div class="emoji">🎉</div>
        <h2>Урок пройден!</h2>
        <p class="muted">Правильно с первой попытки: ${res} · ${minutes} мин</p>
      </div>
      <div class="card">
        <h2>Сегодня я научилась</h2>
        <ul class="cando">${L.summary.canDo.map(c => `<li>${esc(t(c))}</li>`).join('')}</ul>
      </div>
      <div class="card">
        <h2>В карточки добавлено: ${added}</h2>
        <p class="small muted">Первое повторение — завтра.</p>
        <p>${L.words.map(w => `<span class="chip on static">${esc(w.en)}</span>`).join(' ')}</p>
      </div>
      <button class="btn" id="next">Дальше</button>
      <a class="btn secondary" href="#/map">К карте курса</a>`);
    on('next', () => ctx.onDone(L.id));
  }

  function render() {
    [stepReview, stepSituation, stepWords, stepRule, stepPractice, stepSpeaking, stepSummary][step]();
  }

  return {
    start(lesson, context, fromStep = 0) {
      L = lesson; ctx = context; root = context.root;
      step = Math.min(Math.max(0, fromStep), 6);
      started = Date.now();
      stats = null;
      Store.update(d => { d.lessonProgress[L.id] = step; });
      render();
    },
    stop() { Recorder.stop(); Speech.stop(); }
  };
})();
