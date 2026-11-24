/* مراجعة التفسير — منطق الموقع */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS = {
  get(k){ try { return localStorage.getItem(k) } catch(e){ return null } },
  set(k,v){ try { localStorage.setItem(k,v) } catch(e){} },
  json(k,d){ try { return JSON.parse(localStorage.getItem(k)) ?? d } catch(e){ return d } }
};
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]] } return a };

const SUR = {50:'ق',51:'الذاريات',52:'الطور',53:'النجم',54:'القمر',55:'الرحمن',56:'الواقعة',57:'الحديد',58:'المجادلة',59:'الحشر',60:'الممتحنة',61:'الصف',62:'الجمعة',63:'المنافقون',64:'التغابن',65:'الطلاق',66:'التحريم'};
const SCOPES = { qaf:[50,51,52,53,54,55,56,57], muj:[58,59,60,61,62,63,64,65,66] };
SCOPES.both = SCOPES.qaf.concat(SCOPES.muj);
const QURAN_URL = n => `https://cdn.jsdelivr.net/npm/quran-json@3.1.2/dist/chapters/${n}.json`;
const QN = 30, QCOUNTS = [10, 20, 30, 50], LETTERS = ['أ','ب','ج'];

/* ---------- Supabase ---------- */
const CFG = window.TQ_CONFIG || {};
const sb = (CFG.supabaseUrl && CFG.supabaseKey && window.supabase) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
let role = null, session = null;

/* ---------- player identity (per device) ---------- */
let pid = LS.get('tq-pid');
if (!pid) { pid = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16) })); LS.set('tq-pid', pid) }

let ekey = LS.get('tq-key');
if (!ekey) { ekey = crypto.randomUUID ? crypto.randomUUID() : pid.replace(/./g, c => c === '-' ? c : (Math.random() * 16 | 0).toString(16)); LS.set('tq-key', ekey) }
const RENAME_MS = 24 * 3600 * 1000;
const canRename = () => Date.now() < (+LS.get('tq-renameUntil') || 0);

let mine = { t: null, h: null }, renameOpen = false;
let banks = [], boards = { t: [], h: [] }, boardTab = 't', boardState = sb ? 'loading' : 'off', quiz = null, preview = [], previewMeta = {}, abort = null;

/* ---------- views ---------- */
const VIEWS = ['home','board','quiz','result','admin'];
function show(v){
  if (!VIEWS.includes(v)) v = 'home';
  if ((v === 'quiz' || v === 'result') && !quiz) v = 'home';
  document.querySelectorAll('[data-view]').forEach(s => s.hidden = s.dataset.view !== v);
  $('#hero').hidden = v !== 'home';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  if (v === 'admin') renderAdmin();
  if (v === 'board' || v === 'home') { renderBoards(); loadBoards() }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

/* ---------- name ---------- */
const nameIn = $('#name');
nameIn.value = LS.get('tq-name') || '';
nameIn.addEventListener('input', () => LS.set('tq-name', nameIn.value.trim()));
const msg = t => $('#homeMsg').textContent = t;
if (LS.get('tq-guest')) nameIn.placeholder = LS.get('tq-guest') + ' (يمكنك كتابة اسمك)';
// يرجع الاسم المكتوب، أو اسم الزائر المحفوظ، أو null ليُعيَّن اسم زائر عند حفظ النتيجة
function getName(){
  const n = nameIn.value.trim();
  return n ? n.slice(0, 40) : (LS.get('tq-guest') || '');
}
// اسم افتراضي متسلسل: زائر 1، زائر 2، ...
async function guestName(){
  let g = LS.get('tq-guest'); if (g) return g;
  let n = 0, ok = false;
  if (sb && navigator.onLine) {
    try {
      const { data, error } = await sb.from('scores').select('name').like('name', 'زائر %').limit(10000);
      if (!error) { ok = true; (data || []).forEach(r => { const m = /^زائر (\d+)$/.exec(r.name || ''); if (m) n = Math.max(n, +m[1]) }) }
    } catch (e) {}
  }
  g = 'زائر ' + (ok ? n + 1 : 1000 + (Math.random() * 9000 | 0));
  LS.set('tq-guest', g); nameIn.placeholder = g + ' (يمكنك كتابة اسمك)';
  return g;
}
async function renameMe(newName){
  newName = String(newName || '').trim().slice(0, 40);
  if (!newName) return 'اكتب اسماً.';
  if (!canRename()) return 'انتهت مدة تعديل الاسم (24 ساعة من آخر اختبار).';
  const p = LS.json('tq-pending', []); p.forEach(r => { if (r.player_id === pid) r.name = newName }); LS.set('tq-pending', JSON.stringify(p));
  LS.set('tq-name', newName); nameIn.value = newName;
  if (sb) {
    if (!navigator.onLine) return 'أنت غير متصل؛ سيُستخدم الاسم الجديد في نتائجك القادمة.';
    const { error } = await sb.rpc('rename_player', { p_player: pid, p_key: ekey, p_name: newName });
    if (error) return 'تعذّر تعديل الاسم في لوحة الصدارة الآن.';
    loadBoards();
  }
  return 'ok';
}

/* ---------- leaderboard ---------- */
async function loadBoards(){
  if (!sb || !navigator.onLine) { if (!sb) boardState = 'off'; renderBoards(); return }
  try {
    const res = await Promise.all(['t','h'].map(k => sb.from('leaderboard').select('player_id,name,best,plays').eq('kind', k).order('best', { ascending: false }).limit(10)));
    res.forEach((r, i) => { if (r.error) throw r.error; boards[i ? 'h' : 't'] = r.data || [] });
    boardState = 'ok';
    await Promise.all(['t','h'].map(async k => {
      const me = await sb.from('leaderboard').select('name,best,plays').eq('kind', k).eq('player_id', pid).maybeSingle();
      if (me.error || !me.data) { mine[k] = null; return }
      const [above, all] = await Promise.all([
        sb.from('leaderboard').select('player_id', { count: 'exact', head: true }).eq('kind', k).gt('best', me.data.best),
        sb.from('leaderboard').select('player_id', { count: 'exact', head: true }).eq('kind', k)
      ]);
      mine[k] = { ...me.data, rank: (above.count || 0) + 1, of: all.count || 0 };
    }));
  } catch (e) { boardState = boards.t.length || boards.h.length ? 'ok' : 'err' }
  renderBoards();
}
function boardHTML(title){
  const rows = boards[boardTab] || [];
  let body = '';
  if (boardState === 'off') body = '<div class="empty">لوحة الصدارة غير مفعّلة بعد.</div>';
  else if (boardState === 'loading') body = '<div class="empty">جارٍ تحميل القائمة…</div>';
  else if (boardState === 'err' && !rows.length) body = '<div class="empty">تعذّر تحميل القائمة الآن.</div>';
  else if (!rows.length) body = '<div class="empty">لا توجد نتائج بعد. كن أول المشاركين!</div>';
  else body = '<ol class="lb">' + rows.map((d, i) => `<li class="${d.player_id === pid ? 'me' : ''}"><span class="rk ${i < 3 ? 'g' + (i + 1) : ''}">${i + 1}</span><span class="nm">${esc(d.name || 'مشارك')}<small>${+d.plays || 1} محاولة</small></span><span class="pt">${+d.best || 0}</span></li>`).join('') + '</ol>';
  const m = mine[boardTab];
  if (boardState === 'ok') {
    const ren = canRename() ? (renameOpen
      ? `<form class="row" data-renform style="margin-top:8px"><input type="text" name="nm" maxlength="40" value="${esc(m ? m.name : (LS.get('tq-name') || ''))}" style="max-width:240px"><button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" data-rencancel>إلغاء</button><span class="note" data-renmsg></span></form>`
      : ` · <button class="btn ghost" type="button" data-renopen style="padding:4px 10px">تغيير اسمك</button>`) : '';
    body += m
      ? `<div class="mine note" style="margin-top:12px">نقاطك: <b>${+m.best || 0}</b> — ترتيبك: <b>${m.rank}</b> من ${m.of} — باسم «${esc(m.name)}»${ren}</div>`
      : `<div class="mine note" style="margin-top:12px">لم تُسجَّل لك نتيجة في هذا الاختبار بعد.${ren}</div>`;
  }
  return `<div class="boardhead"><div><h2 style="font-size:24px">${title}</h2><div class="note">أعلى عشرة مشاركين نقاطاً — تُحتسب أفضل نتيجة لكل مشارك</div></div>
  <div class="tabs" role="tablist"><button data-tab="t" class="${boardTab === 't' ? 'on' : ''}">التفسير</button><button data-tab="h" class="${boardTab === 'h' ? 'on' : ''}">الحفظ</button></div></div>${body}`;
}
function renderBoards(){ $('#homeBoard').innerHTML = boardHTML('العشرة الأوائل'); $('#fullBoard').innerHTML = boardHTML('لوحة الصدارة') }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (b) { boardTab = b.dataset.tab; renderBoards() }
  if (e.target.closest('[data-renopen]')) { renameOpen = true; renderBoards(); const i = document.querySelector('[data-renform] input'); if (i) i.focus() }
  if (e.target.closest('[data-rencancel]')) { renameOpen = false; renderBoards() }
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('[data-renform]'); if (!f) return; e.preventDefault();
  const out = f.querySelector('[data-renmsg]'); out.textContent = 'جارٍ الحفظ…';
  const r = await renameMe(f.elements.nm.value);
  if (r === 'ok') { renameOpen = false; renderBoards() } else out.textContent = r;
});

/* ---------- banks ---------- */
function clean(list){
  const out = [];
  (Array.isArray(list) ? list : []).forEach(x => {
    if (!x || typeof x.q !== 'string' || !Array.isArray(x.options) || x.options.length !== 3) return;
    const o = x.options.map(s => String(s).trim().slice(0, 400)), a = +x.answer;
    if (!(a >= 0 && a <= 2) || new Set(o).size !== 3 || o.some(s => !s)) return;
    out.push({ q: x.q.trim().slice(0, 600), options: o, answer: a, source: String(x.source || '').trim().slice(0, 3000) });
  });
  return out;
}
function setBanks(rows){
  banks = rows.map(x => ({ id: x.id, title: String(x.title || 'بنك'), file: String(x.file || ''), at: x.created_at || '', questions: clean(x.questions) }));
  renderBanks();
}
async function loadBanks(){
  const cached = LS.json('tq-banks', null);
  if (cached) setBanks(cached);
  if (!sb) { if (!cached) $('#bankCount').textContent = 'لم يُربط الموقع بقاعدة البيانات بعد.'; renderBanks(); return }
  try {
    const { data, error } = await sb.from('banks').select('id,title,file,questions,created_at').order('created_at');
    if (error) throw error;
    LS.set('tq-banks', JSON.stringify(data));
    setBanks(data);
  } catch (e) { if (!cached) $('#bankCount').textContent = 'تعذّر تحميل بنك الأسئلة؛ تحقّق من الاتصال.' }
}
function renderBanks(){
  const titles = [...new Set(banks.map(b => b.title))];
  const sel = $('#bankSel'), cur = sel.value;
  sel.innerHTML = '<option value="">كل الملفات</option>' + titles.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  if (titles.includes(cur)) sel.value = cur;
  const n = banks.reduce((s, b) => s + b.questions.length, 0);
  if (sb || banks.length) $('#bankCount').textContent = n ? `${n} سؤالاً في ${titles.length} ملف` : 'لم تُرفع ملفات تفسير بعد.';
  $('#startT').disabled = !n;
  renderBanksTable();
}

/* ---------- quiz engine ---------- */
function startQuiz(kind, questions, label, name){
  quiz = { kind, label, name, qs: questions, total: questions.length, i: 0, pts: 0, ok: 0, answers: [], t0: 0, locked: false };
  show('quiz'); renderQ();
}
function renderQ(){
  const q = quiz.qs[quiz.i];
  $('#qNum').textContent = `السؤال ${quiz.i + 1} من ${quiz.qs.length}`;
  $('#qPts').textContent = quiz.pts;
  $('#qProg').style.width = (quiz.i / quiz.qs.length * 100) + '%';
  $('#qType').textContent = q.type || quiz.label;
  const t = $('#qText'); t.textContent = q.q;
  if (q.ayah) { const s = document.createElement('span'); s.className = 'ayah'; s.textContent = '﴿' + q.ayah + '﴾'; t.appendChild(s) }
  const box = $('#qOpts'); box.innerHTML = '';
  q.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt' + (q.quran ? ' q' : '');
    b.innerHTML = `<span class="k">${LETTERS[i]}</span><span></span>`;
    b.lastChild.textContent = o;
    b.addEventListener('click', () => answer(i));
    box.appendChild(b);
  });
  $('#qFb').hidden = true; $('#qSrc').hidden = true; $('#qSrc').open = false; $('#qNext').hidden = true; $('#qPop').textContent = '';
  quiz.t0 = performance.now(); quiz.locked = false;
}
function answer(i){
  if (quiz.locked) return; quiz.locked = true;
  const q = quiz.qs[quiz.i], sec = (performance.now() - quiz.t0) / 1000, ok = i === q.answer;
  const btns = [...$('#qOpts').children];
  btns.forEach(b => b.disabled = true);
  btns[q.answer].classList.add('right'); if (!ok) btns[i].classList.add('wrong');
  let gain = 0;
  if (ok) { gain = 10 + Math.max(0, 5 - Math.floor(sec / 4)); quiz.pts += gain; quiz.ok++ }
  quiz.answers.push({ q, pick: i, ok });
  const fb = $('#qFb'); fb.hidden = false; fb.className = 'fb ' + (ok ? 'ok' : 'no');
  fb.textContent = ok ? 'إجابة صحيحة' : 'إجابة خاطئة — الصحيح: ' + q.options[q.answer];
  $('#qPop').textContent = ok ? `+${gain}` : ''; $('#qPts').textContent = quiz.pts;
  $('#qSrcTxt').textContent = q.src || '—'; $('#qSrc').hidden = false; $('#qSrc').open = !ok;
  const nx = $('#qNext'); nx.hidden = false; nx.textContent = quiz.i === quiz.qs.length - 1 ? 'عرض النتيجة' : 'السؤال التالي';
  nx.focus({ preventScroll: true });
}
$('#qNext').addEventListener('click', () => { if (quiz.i < quiz.qs.length - 1) { quiz.i++; renderQ(); window.scrollTo(0, 0) } else finish() });
$('#qQuit').addEventListener('click', () => { if (quiz.answers.length) { quiz.qs = quiz.qs.slice(0, quiz.answers.length); finish() } else { quiz = null; show('home') } });
document.addEventListener('keydown', e => {
  if ($('[data-view=quiz]').hidden || !quiz || e.target.matches('input,textarea,select')) return;
  const k = { '1': 0, '2': 1, '3': 2 }[e.key];
  if (k != null && !quiz.locked) answer(k); else if (e.key === 'Enter' && quiz.locked) $('#qNext').click();
});

/* ---------- scores (with offline queue) ---------- */
async function sendScore(row){
  let { error } = await sb.from('scores').insert(row);
  if (error && row.edit_key && /edit_key/.test(error.message || '')) { const { edit_key, ...r } = row; ({ error } = await sb.from('scores').insert(r)) }
  if (error) throw error;
}
async function flushPending(){
  if (!sb || !navigator.onLine) return;
  const pend = LS.json('tq-pending', []);
  if (!pend.length) return;
  const left = [];
  for (const r of pend) { try { await sendScore(r) } catch (e) { left.push(r) } }
  LS.set('tq-pending', JSON.stringify(left));
  if (left.length < pend.length) loadBoards();
}
async function finish(){
  show('result');
  const k = quiz.kind;
  $('#rTitle').textContent = 'نتيجة ' + quiz.label; $('#rPts').textContent = quiz.pts; $('#rOk').textContent = quiz.ok; $('#rOf').textContent = quiz.qs.length;
  const wrong = quiz.answers.filter(a => !a.ok);
  $('#rReview').innerHTML = wrong.length
    ? '<h3>مراجعة الأخطاء</h3>' + wrong.map(a => `<div class="rv"><p><b>${esc(a.q.q)}</b>${a.q.ayah ? `<span class="ayah">﴿${esc(a.q.ayah)}﴾</span>` : ''}</p><p class="u">إجابتك: ${esc(a.q.options[a.pick])}</p><p class="a">الصحيح: ${esc(a.q.options[a.q.answer])}</p><details class="src"><summary>مصدر المعلومة</summary><div>${esc(a.q.src)}</div></details></div>`).join('')
    : '<p class="note">أحسنت! لا أخطاء في هذا الاختبار.</p>';
  const best = Math.max(+LS.get('tq-best-' + k) || 0, quiz.pts);
  LS.set('tq-best-' + k, best); $('#rBest').textContent = best;
  const save = $('#rSave'); $('#rRename').hidden = true;
  if (quiz.answers.length < quiz.total) { save.textContent = 'الاختبار لم يكتمل، لذلك لم تُسجّل النتيجة في لوحة الصدارة.'; return }
  if (!quiz.name) quiz.name = await guestName();
  LS.set('tq-renameUntil', String(Date.now() + RENAME_MS));
  $('#rName').value = quiz.name; $('#rNameMsg').textContent = 'يمكنك تغيير اسمك خلال 24 ساعة من هذا الاختبار.'; $('#rRename').hidden = false;
  if (!sb) { save.textContent = 'سُجّلت النتيجة على جهازك.'; return }
  // النقاط في لوحة الصدارة تُحوَّل إلى مقياس 30 سؤالاً حتى تتساوى الاختبارات مهما كان عددها
  const row = { player_id: pid, edit_key: ekey, name: quiz.name, kind: k, points: Math.floor(quiz.pts * QN / quiz.total), correct: quiz.ok, total: quiz.total };
  if (!navigator.onLine) { const p = LS.json('tq-pending', []); p.push(row); LS.set('tq-pending', JSON.stringify(p)); save.textContent = 'أنت غير متصل؛ ستُرسل النتيجة تلقائياً عند عودة الاتصال.'; return }
  save.textContent = 'جارٍ حفظ النتيجة…';
  try { await sendScore(row); save.textContent = 'سُجّلت النتيجة في لوحة الصدارة' + (quiz.total !== QN ? ` (${row.points} نقطة بعد تحويلها إلى مقياس ${QN} سؤالاً).` : '.'); loadBoards() }
  catch (e) { const p = LS.json('tq-pending', []); p.push(row); LS.set('tq-pending', JSON.stringify(p)); save.textContent = 'تعذّر الحفظ الآن؛ سنعيد المحاولة تلقائياً.' }
}
$('#rAgain').addEventListener('click', () => { const k = quiz.kind; quiz = null; show('home'); (k === 't' ? $('#startT') : $('#startH')).click() });

/* ---------- question count (10/20/30/50) ---------- */
function qCount(id){ const v = +$('#' + id).value; return QCOUNTS.includes(v) ? v : QN }
['nT', 'nH'].forEach(id => {
  const sel = $('#' + id), saved = +LS.get('tq-' + id);
  if (QCOUNTS.includes(saved)) sel.value = String(saved);
  sel.addEventListener('change', () => LS.set('tq-' + id, sel.value));
});

$('#rRename').addEventListener('submit', async e => {
  e.preventDefault(); const out = $('#rNameMsg'); out.textContent = 'جارٍ الحفظ…';
  const r = await renameMe($('#rName').value);
  out.textContent = r === 'ok' ? 'تم تغيير اسمك في لوحة الصدارة.' : r;
});

/* ---------- tafsir quiz ---------- */
$('#startT').addEventListener('click', () => {
  const name = getName(); msg('');
  const t = $('#bankSel').value;
  const pool = banks.filter(b => !t || b.title === t).flatMap(b => b.questions.map(q => ({ ...q, bank: b.title })));
  if (!pool.length) { msg('لا توجد أسئلة بعد.'); return }
  const qs = shuffle(pool).slice(0, qCount('nT')).map(q => {
    const order = shuffle([0, 1, 2]);
    return { q: q.q, type: 'تفسير — ' + q.bank, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer), src: q.source };
  });
  startQuiz('t', qs, 'اختبار التفسير', name);
});

/* ---------- hifz quiz ---------- */
const surahCache = {};
async function loadSurah(n){
  if (surahCache[n]) return surahCache[n];
  const r = await fetch(QURAN_URL(n));
  if (!r.ok) throw new Error('quran ' + n);
  const d = await r.json();
  return surahCache[n] = d.verses.map(v => String(v.text).trim());
}
function hifzQuestions(list, n = QN){
  const all = []; list.forEach(s => surahCache[s].forEach((t, i) => all.push({ s, i: i + 1, t })));
  const cnt = {}; all.forEach(a => cnt[a.t] = (cnt[a.t] || 0) + 1);
  const used = new Set(), qs = []; let guard = 0;
  const words = t => t.split(/\s+/).length;
  while (qs.length < n && guard++ < 6000) {
    const r = Math.random(), type = r < .5 ? 'next' : r < .75 ? 'prev' : 'surah';
    const idx = Math.random() * all.length | 0, a = all[idx];
    if (cnt[a.t] > 1 || used.has(idx)) continue;
    if (type === 'surah') {
      if (words(a.t) < 4) continue;
      const others = shuffle(list.filter(s => s !== a.s)).slice(0, 2), opts = shuffle([a.s, ...others]);
      qs.push({ type: 'الحفظ — تحديد السورة', q: 'في أي سورة وردت هذه الآية؟', ayah: a.t, options: opts.map(s => 'سورة ' + SUR[s]), answer: opts.indexOf(a.s), src: `سورة ${SUR[a.s]} — الآية ${a.i}:\n﴿${a.t}﴾` });
    } else {
      const b = all[type === 'next' ? idx + 1 : idx - 1];
      if (!b || b.s !== a.s) continue;
      const same = all.filter(x => x.s === a.s && x.t !== b.t && x.t !== a.t && Math.abs(x.i - a.i) > 1);
      const pool = same.length >= 2 ? same : all.filter(x => x.t !== b.t && x.t !== a.t);
      const L = words(b.t);
      const near = shuffle(pool).sort((x, y) => Math.abs(words(x.t) - L) - Math.abs(words(y.t) - L)).slice(0, 6);
      const d2 = shuffle(near).filter((x, i, arr) => arr.findIndex(y => y.t === x.t) === i).slice(0, 2);
      if (d2.length < 2) continue;
      const opts = shuffle([b.t, d2[0].t, d2[1].t]);
      const first = type === 'next' ? a : b, second = type === 'next' ? b : a;
      qs.push({
        type: type === 'next' ? 'الحفظ — الآية التالية' : 'الحفظ — الآية السابقة',
        q: type === 'next' ? `ما الآية التي تلي قوله تعالى في سورة ${SUR[a.s]}:` : `ما الآية التي تسبق قوله تعالى في سورة ${SUR[a.s]}:`,
        ayah: a.t, quran: true, options: opts, answer: opts.indexOf(b.t),
        src: `سورة ${SUR[a.s]} — الآيتان ${first.i} و${second.i}:\n﴿${first.t}﴾ (${first.i})\n﴿${second.t}﴾ (${second.i})`
      });
    }
    used.add(idx);
  }
  return qs;
}
$('#startH').addEventListener('click', async () => {
  const name = getName();
  const btn = $('#startH'), list = SCOPES[$('#scopeSel').value];
  btn.disabled = true; msg('جارٍ تحميل نص السور…');
  try { await Promise.all(list.map(loadSurah)); msg(''); startQuiz('h', hifzQuestions(list, qCount('nH')), 'اختبار الحفظ', name) }
  catch (e) { msg('تعذّر تحميل نص القرآن. اتصل بالإنترنت مرة واحدة ليُحفظ النص على جهازك.') }
  finally { btn.disabled = false }
});
// حفظ نص السور مسبقاً ليعمل اختبار الحفظ دون إنترنت
function prefetchQuran(){ if (!navigator.onLine) return; SCOPES.both.forEach((n, i) => setTimeout(() => loadSurah(n).catch(() => {}), 1500 + i * 300)) }

/* ---------- admin: auth ---------- */
async function refreshRole(){
  if (!sb) { role = null; session = null; return }
  const { data } = await sb.auth.getSession();
  session = data.session;
  role = null;
  if (session) { const r = await sb.rpc('my_role'); role = r.error ? null : r.data }
  $('#navAdmin').hidden = !role;
}
function renderAdmin(){
  $('#noBackend').hidden = !!sb;
  $('#loginBox').hidden = !sb || !!session;
  $('#adminDenied').hidden = !session || !!role;
  $('#adminBody').hidden = !role;
  if (session && !role) $('#deniedEmail').textContent = session.user.email;
  if (!role) return;
  $('#roleLine').textContent = (role === 'admin' ? 'أنت المدير' : 'أنت مشرف') + ' — ' + session.user.email;
  $('#ownerPanel').hidden = role !== 'admin';
  $('#staffPanel').hidden = role !== 'admin';
  renderBanksTable();
  if (role === 'admin') loadStaff();
}
$('#loginBox').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#lEmail').value.trim(), password = $('#lPass').value;
  if (!email || !password) { $('#lMsg').textContent = 'اكتب البريد وكلمة المرور.'; return }
  $('#lIn').disabled = true; $('#lMsg').textContent = 'جارٍ الدخول…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $('#lIn').disabled = false;
  if (error) { $('#lMsg').textContent = 'تعذّر الدخول: تحقّق من البريد وكلمة المرور، أو من تأكيد البريد.'; return }
  $('#lPass').value = ''; $('#lMsg').textContent = '';
  await refreshRole(); renderAdmin();
});
$('#lUp').addEventListener('click', async () => {
  const email = $('#lEmail').value.trim(), password = $('#lPass').value;
  if (!email || password.length < 8) { $('#lMsg').textContent = 'اكتب البريد وكلمة مرور من 8 أحرف على الأقل.'; return }
  const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname + '#admin' } });
  $('#lMsg').textContent = error ? 'تعذّر إنشاء الحساب: ' + error.message : 'أُنشئ الحساب. افتح رسالة التأكيد في بريدك، ثم اطلب من المدير إضافتك.';
});
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-logout]')) return;
  await sb.auth.signOut(); session = null; role = null; $('#navAdmin').hidden = true; renderAdmin();
});

/* ---------- admin: staff ---------- */
async function loadStaff(){
  const { data, error } = await sb.from('staff').select('email,role').order('added_at');
  const el = $('#staffList');
  if (error) { el.innerHTML = '<li>تعذّر تحميل القائمة.</li>'; return }
  el.innerHTML = data.map(s => `<li><span dir="ltr">${esc(s.email)}</span><span><span class="note">${s.role === 'admin' ? 'مدير' : 'مشرف'}</span> ${s.email.toLowerCase() === session.user.email.toLowerCase() ? '' : `<button class="btn danger" data-unstaff="${esc(s.email)}">إزالة</button>`}</span></li>`).join('');
}
$('#staffForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#sEmail').value.trim().toLowerCase(), r = $('#sRole').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#staffMsg').textContent = 'اكتب بريداً صحيحاً.'; return }
  const { error } = await sb.from('staff').upsert({ email, role: r });
  $('#staffMsg').textContent = error ? 'تعذّرت الإضافة.' : 'أُضيف. يدخل صاحب البريد من «دخول المشرفين» (وينشئ حساباً إن لم يكن له حساب).';
  if (!error) { $('#sEmail').value = ''; loadStaff() }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-unstaff]'); if (!b) return;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'تأكيد'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'إزالة' } }, 4000); return }
  await sb.from('staff').delete().eq('email', b.dataset.unstaff); loadStaff();
});

/* ---------- admin: banks ---------- */
function renderBanksTable(){
  const el = $('#banksTable'); if (!el) return;
  if (!banks.length) { el.innerHTML = '<div class="empty">لا توجد بنوك أسئلة بعد.</div>'; return }
  el.innerHTML = '<table class="bk"><thead><tr><th>البنك</th><th>الأسئلة</th><th>أضيف</th><th></th></tr></thead><tbody>' + banks.map(b => `<tr><td>${esc(b.title)}<br><span class="note">${esc(b.file)}</span></td><td class="n">${b.questions.length}</td><td>${b.at ? new Date(b.at).toLocaleDateString('ar-SA') : ''}</td><td class="n"><button class="btn danger" data-del="${esc(b.id)}">حذف</button></td></tr>`).join('') + '</tbody></table>';
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-del]'); if (!b || !sb) return;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'تأكيد الحذف'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'حذف' } }, 4000); return }
  b.disabled = true;
  const { error } = await sb.from('banks').delete().eq('id', b.dataset.del);
  if (error) b.textContent = 'تعذّر الحذف'; else loadBanks();
});

/* ---------- admin: PDF → questions ---------- */
const fileIn = $('#file'), drop = $('#drop'); let pdfFile = null;
drop.addEventListener('click', () => fileIn.click());
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click() } });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over') });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) setFile(f) });
fileIn.addEventListener('change', () => { if (fileIn.files[0]) setFile(fileIn.files[0]) });
function setFile(f){ pdfFile = f; $('#fileName').textContent = f.name; if (!$('#bTitle').value) $('#bTitle').value = f.name.replace(/\.pdf$/i, '') }
const log = t => $('#gLog').textContent = t, prog = p => $('#gProg').style.width = (p * 100) + '%';

function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s) }) }
async function pdfjs(){
  if (window.pdfjsLib && window.pdfjsWorker) return window.pdfjsLib;
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  await loadScript(base + 'pdf.min.js'); await loadScript(base + 'pdf.worker.min.js');
  return window.pdfjsLib;
}
const arRatio = t => { const s = t.replace(/\s/g, ''); return s.length ? (s.match(/[؀-ۿ]/g) || []).length / s.length : 0 };
function chunkText(pages, max = 6000){
  const out = []; let cur = '';
  for (const p of pages) {
    if (cur.length + p.length > max && cur) { out.push(cur); cur = '' }
    cur += p + '\n';
    while (cur.length > max * 1.5) { out.push(cur.slice(0, max)); cur = cur.slice(max) }
  }
  if (cur.trim().length > 40) out.push(cur);
  return out;
}
const blobToB64 = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b) });
async function callGenerate(body){
  const { data, error } = await sb.functions.invoke('generate-questions', { body });
  if (error) {
    let m = error.message;
    try { const j = await error.context.json(); if (j && j.error) m = j.error } catch (x) {}
    throw new Error(m);
  }
  return clean(data && data.questions);
}

$('#gen').addEventListener('click', async () => {
  if (!sb || !role) return;
  const title = $('#bTitle').value.trim(), per = Math.min(20, Math.max(3, +$('#perPart').value || 10)), pasted = $('#paste').value.trim();
  if (!title) { log('اكتب اسم البنك أولاً.'); $('#bTitle').focus(); return }
  if (!pdfFile && !pasted) { log('اختر ملف PDF أو الصق نصاً.'); return }
  abort = { stop: false }; $('#gen').disabled = true; $('#stop').hidden = false; prog(0);
  const got = [];
  try {
    let jobs = [];
    if (pasted && !pdfFile) jobs = chunkText([pasted]).map(t => ({ t }));
    else {
      log('جارٍ قراءة الملف…');
      const lib = await pdfjs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await pdfFile.arrayBuffer()), isEvalSupported: false }).promise;
      const from = Math.max(1, +$('#pFrom').value || 1), to = Math.min(pdf.numPages, +$('#pTo').value || pdf.numPages);
      if (from > to) throw new Error('نطاق الصفحات غير صحيح');
      let mode = $('#mode').value; const pages = [];
      if (mode !== 'img') {
        for (let p = from; p <= to; p++) {
          const pg = await pdf.getPage(p), tc = await pg.getTextContent();
          pages.push(tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').normalize('NFKC'));
          log(`قراءة الصفحة ${p} من ${to}`);
        }
        const all = pages.join('\n');
        if (mode === 'auto') mode = (all.replace(/\s/g, '').length > (to - from + 1) * 80 && arRatio(all) > .5) ? 'text' : 'img';
      }
      if (mode === 'text') jobs = chunkText(pages).map(t => ({ t }));
      else { let batch = []; for (let p = from; p <= to; p++) { batch.push(p); if (batch.length === 3 || p === to) { jobs.push({ pages: batch, pdf }); batch = [] } } }
    }
    for (let j = 0; j < jobs.length; j++) {
      if (abort.stop) break;
      log(`استخراج الأسئلة: الجزء ${j + 1} من ${jobs.length} (حتى الآن ${got.length} سؤالاً)`); prog(j / jobs.length);
      const job = jobs[j];
      try {
        if (job.t) got.push(...await callGenerate({ title, n: per, text: job.t }));
        else {
          const images = [];
          for (const p of job.pages) {
            const pg = await job.pdf.getPage(p), vp0 = pg.getViewport({ scale: 1 }), sc = Math.min(2, 1400 / vp0.width), vp = pg.getViewport({ scale: sc });
            const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
            await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            images.push({ media_type: 'image/jpeg', data: await blobToB64(await new Promise(r => c.toBlob(r, 'image/jpeg', .8))) });
          }
          got.push(...await callGenerate({ title, n: per, images, pages: job.pages }));
        }
      } catch (e) { log('خطأ في الجزء ' + (j + 1) + ': ' + e.message); if (/403|غير مصرح|ANTHROPIC/.test(e.message)) break }
    }
    prog(1);
    if (got.length) log(`تم استخراج ${got.length} سؤالاً. راجعها ثم احفظها.`);
    else if (!$('#gLog').textContent.startsWith('خطأ')) log('لم يُستخرج أي سؤال؛ جرّب طريقة قراءة أخرى.');
  } catch (e) { log('حدث خطأ: ' + (e && e.message ? e.message : 'تعذّر إكمال العملية')) }
  finally { $('#gen').disabled = false; $('#stop').hidden = true; abort = null }
  if (got.length) addPreview(got, title, pdfFile ? pdfFile.name : 'نص ملصق');
});
$('#stop').addEventListener('click', () => { if (abort) abort.stop = true });
$('#importBtn').addEventListener('click', () => {
  let arr; try { arr = JSON.parse($('#importTxt').value) } catch (e) { log('نص JSON غير صالح.'); return }
  if (arr && Array.isArray(arr.banks)) { planBackup([{ name: 'نص ملصق', data: arr }]); $('#importTxt').value = ''; log('نسخة احتياطية: راجع القائمة في قسم «بنوك الأسئلة» ثم اضغط «حفظ المحدّد».'); $('#bkPlan').scrollIntoView({ behavior: 'smooth' }); return }
  if (arr && arr.questions) arr = arr.questions;
  const title = $('#bTitle').value.trim(); if (!title) { log('اكتب اسم البنك أولاً.'); return }
  const got = clean(arr); log(`أضيف ${got.length} سؤالاً إلى المراجعة.`);
  if (got.length) { addPreview(got, title, 'استيراد'); $('#importTxt').value = '' }
});
function addPreview(list, title, file){ preview = preview.concat(list); previewMeta = { title, file }; renderPreview() }
function renderPreview(){
  $('#previewPanel').hidden = !preview.length; $('#pCount').textContent = `(${preview.length})`;
  $('#plist').innerHTML = preview.map((q, i) => `<div class="pq"><div class="h"><b>${i + 1}. ${esc(q.q)}</b><button class="btn danger" data-rm="${i}">حذف</button></div><ul>${q.options.map((o, k) => `<li class="${k === q.answer ? 'c' : ''}">${esc(o)}</li>`).join('')}</ul><div class="s">المصدر: ${esc(q.source)}</div></div>`).join('');
}
$('#plist').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; preview.splice(+b.dataset.rm, 1); renderPreview() });
$('#pDiscard').addEventListener('click', () => { preview = []; renderPreview() });
$('#pSave').addEventListener('click', async () => {
  if (!sb || !preview.length) return;
  const btn = $('#pSave'); btn.disabled = true;
  const title = previewMeta.title || $('#bTitle').value.trim() || 'بنك أسئلة', file = previewMeta.file || '';
  const rows = []; for (let i = 0; i < preview.length; i += 100) rows.push({ title, file, questions: preview.slice(i, i + 100) });
  const { error } = await sb.from('banks').insert(rows);
  if (error) log('تعذّر الحفظ: ' + error.message);
  else { log(`حُفظ ${preview.length} سؤالاً في «${title}».`); preview = []; renderPreview(); loadBanks() }
  btn.disabled = false;
});

/* ---------- admin: backup / bulk restore ---------- */
const SURAH_SLUGS = { alfatiha: 'الفاتحة', qaf: 'ق', adhariyat: 'الذاريات', attur: 'الطور', annajm: 'النجم', alqamar: 'القمر', arrahman: 'الرحمن', alwaqia: 'الواقعة', alhadid: 'الحديد', almujadila: 'المجادلة', alhashr: 'الحشر', almumtahana: 'الممتحنة', assaff: 'الصف', aljumuah: 'الجمعة', almunafiqun: 'المنافقون', attaghabun: 'التغابن', attalaq: 'الطلاق', attahrim: 'التحريم' };
function titleFromFile(name){
  const base = String(name).replace(/\.json$/i, '').trim();
  const slug = base.toLowerCase().replace(/^tafsir-/, '');
  return SURAH_SLUGS[slug] ? 'سورة ' + SURAH_SLUGS[slug] : base;
}
let bkPlanList = [];
const bkMsg = t => $('#bkMsg').textContent = t;
function planBackup(files){
  const plan = [], bad = [];
  files.forEach(({ name, data }) => {
    if (data && Array.isArray(data.banks)) {
      data.banks.forEach(b => { const q = clean(b && b.questions); if (q.length) plan.push({ title: String(b.title || titleFromFile(name)).trim().slice(0, 120), file: String(b.file || name), questions: q }); else bad.push(name) });
    } else {
      const q = clean(data && data.questions ? data.questions : data);
      if (q.length) plan.push({ title: titleFromFile(name).slice(0, 120), file: name, questions: q }); else bad.push(name);
    }
  });
  const have = new Set(banks.map(b => b.title));
  bkPlanList = plan.map(p => ({ ...p, on: !have.has(p.title), dup: have.has(p.title) }));
  renderPlan();
  bkMsg(plan.length ? `جاهز للحفظ: ${plan.length} بنكاً.` + (bad.length ? ` تعذّرت قراءة: ${bad.join('، ')}` : '') : 'لم أجد أسئلة صالحة في الملفات المختارة.');
}
function renderPlan(){
  $('#bkPlan').hidden = !bkPlanList.length;
  $('#bkRows').innerHTML = bkPlanList.map((p, i) => `<tr><td><input type="checkbox" data-bk-on="${i}" ${p.on ? 'checked' : ''} aria-label="تحديد"></td><td><input type="text" data-bk-t="${i}" value="${esc(p.title)}" maxlength="120"></td><td class="n">${p.questions.length}</td><td class="note">${p.dup ? 'موجود مسبقاً؛ غير محدّد حتى لا يتكرر' : ''}</td></tr>`).join('');
}
$('#bkRows').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.bkOn !== undefined) bkPlanList[+t.dataset.bkOn].on = t.checked;
  if (t.dataset.bkT !== undefined) bkPlanList[+t.dataset.bkT].title = t.value.trim().slice(0, 120);
});
$('#bkUp').addEventListener('click', () => $('#bkFile').click());
$('#bkFile').addEventListener('change', async () => {
  const fs = [...$('#bkFile').files]; $('#bkFile').value = ''; if (!fs.length) return;
  const files = [];
  for (const f of fs) { try { files.push({ name: f.name, data: JSON.parse(await f.text()) }) } catch (e) { files.push({ name: f.name, data: null }) } }
  planBackup(files);
});
$('#bkCancel').addEventListener('click', () => { bkPlanList = []; renderPlan(); bkMsg('') });
$('#bkSave').addEventListener('click', async () => {
  if (!sb) { bkMsg('الموقع غير متصل بقاعدة البيانات.'); return }
  const sel = bkPlanList.filter(p => p.on && p.title);
  if (!sel.length) { bkMsg('لم تحدد أي بنك.'); return }
  const btn = $('#bkSave'); btn.disabled = true;
  let ok = 0, nq = 0; const fail = [];
  for (const [k, p] of sel.entries()) {
    bkMsg(`جارٍ الحفظ ${k + 1} من ${sel.length}: «${p.title}»…`);
    const rows = []; for (let i = 0; i < p.questions.length; i += 100) rows.push({ title: p.title, file: p.file, questions: p.questions.slice(i, i + 100) });
    const { error } = await sb.from('banks').insert(rows);
    if (error) fail.push(p.title); else { ok++; nq += p.questions.length; p.on = false; p.dup = true }
  }
  btn.disabled = false;
  bkMsg(`حُفظ ${ok} بنكاً (${nq} سؤالاً).` + (fail.length ? ` تعذّر حفظ: ${fail.join('، ')}` : ''));
  if (!fail.length) { bkPlanList = []; } renderPlan(); loadBanks();
});
$('#bkDown').addEventListener('click', () => {
  if (!banks.length) { bkMsg('لا توجد بنوك لتنزيلها.'); return }
  const byTitle = new Map();
  banks.forEach(b => { if (!byTitle.has(b.title)) byTitle.set(b.title, { title: b.title, file: b.file, questions: [] }); byTitle.get(b.title).questions.push(...b.questions) });
  const out = { type: 'tafseer-backup', version: 1, created: new Date().toISOString(), banks: [...byTitle.values()] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `tafseer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  bkMsg(`نُزّلت نسخة فيها ${out.banks.length} بنكاً.`);
});

$('#resetLb').addEventListener('click', async e => {
  const b = e.currentTarget; if (!sb || role !== 'admin') return;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'اضغط مرة أخرى للتأكيد'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'تصفير لوحة الصدارة' }, 4000); return }
  b.disabled = true; b.textContent = 'جارٍ التصفير…';
  const { error } = await sb.from('scores').delete().gte('created_at', '1970-01-01');
  b.textContent = error ? 'تعذّر التصفير' : 'تم التصفير'; loadBoards();
  setTimeout(() => { b.disabled = false; b.dataset.armed = ''; b.textContent = 'تصفير لوحة الصدارة' }, 2500);
});

/* ---------- install & offline ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false });
$('#installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true });
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $('#iosHint').hidden = false;
const netUI = () => { $('#offline').hidden = navigator.onLine; if (navigator.onLine) { flushPending(); loadBoards() } };
window.addEventListener('online', netUI); window.addEventListener('offline', netUI);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

/* ---------- boot ---------- */
(async () => {
  $('#offline').hidden = navigator.onLine;
  show(location.hash.slice(1) || 'home');
  await loadBanks();
  if (sb) {
    // تأجيل الاستدعاءات خارج دالة الاستماع لتجنّب تعليق مكتبة Supabase
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(async () => { await refreshRole(); if (location.hash === '#admin') renderAdmin() }, 0) });
    try { await refreshRole() } catch (e) {}
    if (location.hash === '#admin') renderAdmin();
    flushPending();
  }
  prefetchQuran();
})();
})();
