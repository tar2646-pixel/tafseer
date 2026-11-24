/* خطة الحفظ وخطة المراجعة — تُحفظ على جهاز المستخدم */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS = {
  get(k){ try { return localStorage.getItem(k) } catch(e){ return null } },
  set(k,v){ try { localStorage.setItem(k,v) } catch(e){} },
  json(k,d){ try { return JSON.parse(localStorage.getItem(k)) ?? d } catch(e){ return d } }
};

/* ---------- بيانات مصحف المدينة (604 صفحة) ---------- */
const SUR = [, 'الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];
// صفحة بداية كل سورة
const SP = [, 1,2,50,77,106,128,151,177,187,208,221,235,249,255,262,267,282,293,305,312,322,332,342,350,359,367,377,385,396,404,411,415,418,428,434,440,446,453,458,467,477,483,489,496,499,502,507,511,515,518,520,523,526,528,531,534,537,542,545,549,551,553,554,556,558,560,562,564,566,568,570,572,574,575,577,578,580,582,583,585,586,587,587,589,590,591,591,592,593,594,595,595,596,596,597,597,598,598,599,599,600,600,601,601,601,602,602,602,603,603,603,604,604,604];
const PAGES = 604;
const juzStart = j => j === 1 ? 1 : 2 + 20 * (j - 1);
const JUZ_PAGES = new Set(Array.from({ length: 30 }, (_, i) => juzStart(i + 1)));
const juzEnd = j => j === 30 ? PAGES : juzStart(j + 1) - 1;
// السور الطويلة (حتى الحجرات) تبدأ عادة في أول الصفحة، والقصيرة قد تبدأ في وسطها
const TOP = s => s <= 49;
const surahAtTop = p => { for (let s = 1; s <= 114; s++) if (SP[s] === p && (TOP(s) || JUZ_PAGES.has(p))) return s; let r = 1; for (let s = 1; s <= 114; s++) if (SP[s] < p) r = s; return r };
const surahAtEnd = p => { let r = 1; for (let s = 1; s <= 114; s++) if (SP[s] <= p) r = s; return r };

/* ---------- إعدادات ---------- */
const DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const AMOUNTS = { // بأنصاف الصفحات
  hifz: [1, 2, 3, 4, 6, 8, 10, 20],
  review: [2, 4, 10, 20, 40, 60, 80, 120, 200]
};
const TITLES = { hifz: 'خطة الحفظ', review: 'خطة المراجعة' };
function fmtAmount(u){
  if (u % 40 === 0) { const j = u / 40; return j === 1 ? 'جزء' : j === 2 ? 'جزءان' : j <= 10 ? `${j} أجزاء` : `${j} جزءاً` }
  if (u === 20) return 'نصف جزء';
  if (u === 10) return 'ربع جزء';
  const p = Math.floor(u / 2), h = u % 2;
  if (!p) return 'نصف وجه';
  const base = p === 1 ? 'وجه' : p === 2 ? 'وجهان' : p <= 10 ? `${p} أوجه` : `${p} وجهاً`;
  return h ? base + ' ونصف' : base;
}
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) };
const fHijri = (() => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long' }) } catch (e) { return null } })();
const fGreg = new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' });
const fMonth = new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' });
const fHMonth = (() => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'long', year: 'numeric' }) } catch (e) { return null } })();

/* ---------- ترتيب الصفحات حسب النطاق والاتجاه ---------- */
function pageOrder(c){
  let groups = [];
  if (c.scope === 'surah') {
    const a = Math.min(c.from, c.to), b = Math.max(c.from, c.to), seen = new Set();
    for (let s = a; s <= b; s++) {
      const end = s === 114 ? PAGES : (SP[s + 1] > SP[s] ? SP[s + 1] - (s + 1 <= b || TOP(s + 1) ? 1 : 0) : SP[s]);
      const g = []; for (let p = SP[s]; p <= Math.max(SP[s], end); p++) if (!seen.has(p)) { seen.add(p); g.push(p) }
      if (g.length) groups.push(g);
    }
  } else {
    const a = c.scope === 'all' ? 1 : Math.min(c.from, c.to), b = c.scope === 'all' ? 30 : Math.max(c.from, c.to);
    for (let j = a; j <= b; j++) { const g = []; for (let p = juzStart(j); p <= juzEnd(j); p++) g.push(p); groups.push(g) }
  }
  if (c.dir === 'back') groups.reverse();
  return groups.flat();
}
// كل صفحة نصفان؛ الوحدة = [صفحة، 0 أو 1]
function units(c){ const out = []; pageOrder(c).forEach(p => out.push([p, 0], [p, 1])); return out }
function studyDaysBetween(start, n, days){ let k = 0; for (let i = 0; i < n; i++) if (days.includes(addDays(start, i).getDay())) k++; return k }
// مقدار كل يوم بأنصاف الصفحات. عند تحديد عدد الأيام يُوزَّع النطاق بالتساوي على أيام الحفظ المتاحة
function sizesOf(c, total){
  if (c.mode === 'days') {
    const k = Math.max(1, Math.min(total, studyDaysBetween(parse(c.start), Math.max(1, +c.totalDays || 1), c.days)));
    return i => i >= k ? 0 : Math.round((i + 1) * total / k) - Math.round(i * total / k);
  }
  const per = Math.max(1, +c.amount || 2); return () => per;
}
function schedule(c){
  const u = units(c), size = sizesOf(c, u.length), out = [];
  if (!c.days || !c.days.length) return { per: size(0), lo: size(0), hi: size(0), rows: out, total: u.length };
  let i = 0, d = parse(c.start), guard = 0;
  while (i < u.length && guard++ < 6000) {
    if (c.days.includes(d.getDay())) { const n = Math.min(size(out.length) || 1, u.length - i); out.push({ n: out.length, date: iso(d), from: u[i], to: u[i + n - 1], size: n }); i += n }
    d = addDays(d, 1);
  }
  const ss = out.map(r => r.size), full = ss.length > 1 ? ss.slice(0, -1) : ss;
  return { per: Math.max(...full, 1), lo: Math.min(...full, 99999), hi: Math.max(...full, 1), rows: out, total: u.length };
}
const fmtPer = s => s.lo && s.lo !== s.hi ? `${fmtAmount(s.lo)} إلى ${fmtAmount(s.hi)}` : fmtAmount(s.per);
function fmtFrom([p, h]){ return { page: `ص\u00A0${p}${h ? ' (من منتصفها)' : ''}`, sur: SUR[h ? surahAtEnd(p) : surahAtTop(p)] } }
function fmtTo([p, h]){ return { page: `ص\u00A0${p}${h ? '' : ' (إلى منتصفها)'}`, sur: SUR[h ? surahAtEnd(p) : surahAtTop(p)] } }

/* ---------- حالة الخطط ---------- */
const store = () => LS.json('tq-plans', {});
// كل حفظ محلي يُبلغ ملف الحساب ليزامن الخطة مع الخادم
const savePlans = (s, silent) => { LS.set('tq-plans', JSON.stringify(s)); if (!silent) document.dispatchEvent(new CustomEvent('tq:plans-changed')) };
// الخطة المحذوفة تبقى علامةً {deleted} حتى تنتقل عملية الحذف إلى الأجهزة الأخرى
const live = p => (p && !p.deleted && p.cfg) ? p : null;
let type = LS.get('tq-plan-type') === 'review' ? 'review' : 'hifz';
let view = 'week', anchor = null, editing = false;

const DEF = t => ({ scope: 'all', from: 1, to: 30, dir: t === 'hifz' ? 'back' : 'fwd', mode: 'amount', amount: t === 'hifz' ? 2 : 40, totalDays: 30, days: [0, 1, 2, 3, 4], start: iso(today()), target: t === 'hifz' ? 20 : 3 });

/* ---------- عرض ---------- */
const root = () => $('#planRoot');
function render(){
  const r = root(); if (!r) return;
  const st = store(), plan = live(st[type]);
  let html = `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:16px">
    <h2 style="margin:0;font-size:26px">${TITLES[type]}</h2>
    <div class="tabs" role="tablist"><button data-ptype="hifz" class="${type === 'hifz' ? 'on' : ''}">الحفظ</button><button data-ptype="review" class="${type === 'review' ? 'on' : ''}">المراجعة</button></div></div>`;
  if (!plan || editing) html += formHTML(plan ? plan.cfg : DEF(type), !!plan);
  else html += planHTML(plan);
  r.innerHTML = html;
  if (!plan || editing) updatePreview();
  else { const t = r.querySelector('tr.today'); if (t) t.scrollIntoView({ block: 'nearest' }) }
}
function opts(list, cur){ return list.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('') }
function formHTML(c, isEdit){
  const juz = Array.from({ length: 30 }, (_, i) => [i + 1, 'الجزء ' + (i + 1)]);
  const sur = SUR.map((n, i) => [i, i + '. ' + n]).slice(1);
  const rng = c.scope === 'surah' ? sur : juz;
  return `<form class="panel" id="planForm">
   <div class="grid2">
    <div><label class="f" for="pScope">النطاق</label><select id="pScope" name="scope">${opts([['all','المصحف كاملاً'],['juz','أجزاء محددة'],['surah','سور محددة']], c.scope)}</select></div>
    <div><label class="f" for="pDir">الاتجاه</label><select id="pDir" name="dir">${opts([['fwd','من البداية إلى النهاية (الفاتحة ← الناس)'],['back','من النهاية إلى البداية (يبدأ بآخر جزء)']], c.dir)}</select></div>
    <div ${c.scope === 'all' ? 'hidden' : ''} data-rng><label class="f" for="pFrom">من</label><select id="pFrom" name="from">${opts(rng, c.from)}</select></div>
    <div ${c.scope === 'all' ? 'hidden' : ''} data-rng><label class="f" for="pTo">إلى</label><select id="pTo" name="to">${opts(rng, c.to)}</select></div>
    <div><label class="f" for="pMode">طريقة التحديد</label><select id="pMode" name="mode">${opts([['amount','أحدد مقدار الورد اليومي'],['days','أحدد عدد الأيام لإتمام النطاق']], c.mode)}</select></div>
    <div data-m="amount" ${c.mode === 'amount' ? '' : 'hidden'}><label class="f" for="pAmount">الورد اليومي</label><select id="pAmount" name="amount">${opts(AMOUNTS[type].map(u => [u, fmtAmount(u)]), c.amount)}</select></div>
    <div data-m="days" ${c.mode === 'days' ? '' : 'hidden'}><label class="f" for="pTotal">عدد الأيام (أيام التقويم)</label><input type="number" id="pTotal" name="totalDays" min="1" max="3650" value="${+c.totalDays || 30}"></div>
    <div><label class="f" for="pStart">تاريخ البدء</label><input type="date" id="pStart" name="start" value="${esc(c.start)}" style="min-height:44px;font-size:16px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);width:100%;color:inherit"></div>
    <div><label class="f" for="pTarget">عدد التكرار المستهدف لكل ورد</label><input type="number" id="pTarget" name="target" min="1" max="1000" value="${+c.target || 1}"></div>
   </div>
   <fieldset style="border:0;padding:0;margin:14px 0 0"><legend class="f" style="font-size:14px;color:var(--mute);margin-bottom:6px">أيام ${type === 'hifz' ? 'الحفظ' : 'المراجعة'} في الأسبوع</legend>
    <div class="row pdays">${DAYS.map((d, i) => `<label class="chip"><input type="checkbox" name="day" value="${i}" ${c.days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></fieldset>
   <div class="ppreview" id="pPreview"></div>
   <div class="row" style="margin-top:14px"><button class="btn gold" type="submit">${isEdit ? 'حفظ التعديل' : 'إنشاء الخطة'}</button>${isEdit ? '<button class="btn" type="button" data-pcancel>إلغاء</button>' : ''}</div>
   ${isEdit ? '<p class="note">تعديل الخطة يعيد توزيع الأوراد، وتبقى علامات التنفيذ والتقييم والتكرار محفوظة حسب التاريخ.</p>' : ''}
  </form>`;
}
function readForm(){
  const f = $('#planForm'); if (!f) return null;
  const c = { scope: f.scope.value, dir: f.dir.value, from: +f.from.value, to: +f.to.value, mode: f.mode.value, amount: +f.amount.value, totalDays: Math.min(3650, Math.max(1, +f.totalDays.value || 1)), start: f.start.value || iso(today()), target: Math.min(1000, Math.max(1, +f.target.value || 1)), days: [...f.querySelectorAll('[name=day]:checked')].map(x => +x.value) };
  if (c.scope === 'all') { c.from = 1; c.to = 30 }
  return c;
}
function updatePreview(){
  const c = readForm(), out = $('#pPreview'); if (!c || !out) return;
  if (!c.days.length) { out.innerHTML = '<p class="note" style="color:var(--bad)">اختر يوماً واحداً على الأقل.</p>'; return }
  const s = schedule(c), last = s.rows[s.rows.length - 1];
  const end = last ? parse(last.date) : parse(c.start), cal = Math.round((end - parse(c.start)) / 864e5) + 1;
  out.innerHTML = `<div class="psum"><div><b>${fmtPer(s)}</b>الورد اليومي</div><div><b>${s.rows.length}</b>يوم ${type === 'hifz' ? 'حفظ' : 'مراجعة'}</div><div><b>${s.total / 2}</b>صفحة</div><div><b>${cal}</b>يوماً في التقويم</div></div>
  <p class="note">تنتهي الخطة يوم ${DAYS[end.getDay()]} ${fGreg.format(end)}${fHijri ? ' (' + fHijri.format(end) + ')' : ''}.</p>`;
}
function stats(plan, rows){
  const log = plan.log || {}, done = rows.filter(r => log[r.date] && log[r.date].done);
  const rated = rows.map(r => log[r.date] && log[r.date].rate).filter(x => x != null && x !== '');
  const avg = rated.length ? (rated.reduce((a, b) => a + +b, 0) / rated.length) : null;
  return { done: done.length, avg };
}
function periodOf(d){
  if (view === 'week') { const s = addDays(d, -d.getDay()); return [s, addDays(s, 6)] }
  return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)];
}
function planHTML(plan){
  const c = plan.cfg, s = schedule(c), rows = s.rows, log = plan.log || {};
  if (!anchor) { const t = today(), first = rows.length ? parse(rows[0].date) : t, last = rows.length ? parse(rows[rows.length - 1].date) : t; anchor = t < first ? first : t > last ? last : t }
  const [a, b] = periodOf(anchor), A = iso(a), B = iso(b), T = iso(today());
  const vis = rows.filter(r => r.date >= A && r.date <= B), st = stats(plan, rows), pct = rows.length ? Math.round(st.done / rows.length * 100) : 0;
  const scopeTxt = c.scope === 'all' ? 'المصحف كاملاً' : c.scope === 'juz' ? `من الجزء ${c.from} إلى الجزء ${c.to}` : `من سورة ${SUR[c.from]} إلى سورة ${SUR[c.to]}`;
  const label = view === 'week' ? `الأسبوع: ${fGreg.format(a)} – ${fGreg.format(b)}` : `${fMonth.format(a)}${fHMonth ? ' — ' + fHMonth.format(a) : ''}`;
  const todayRow = rows.find(r => r.date === T);
  let body = vis.length ? vis.map(r => {
    const e = log[r.date] || {}, f = fmtFrom(r.from), t = fmtTo(r.to), d = parse(r.date);
    return `<tr class="${r.date === T ? 'today' : ''} ${e.done ? 'done' : ''}" data-d="${r.date}">
     <td>${DAYS[d.getDay()]}</td>
     <td>${fHijri ? fHijri.format(d) : ''}<small>${fGreg.format(d)}</small></td>
     <td>${esc(f.page)}<small>${esc(f.sur)}</small></td>
     <td>${esc(t.page)}<small>${esc(t.sur)}</small></td>
     <td class="c"><button type="button" class="cnt-btn ${(+e.count || 0) >= c.target ? 'full' : ''}" data-count="${r.date}" aria-label="عداد التكرار، اضغط للتكبير">${+e.count || 0}<small>/${c.target}</small></button></td>
     <td class="c"><input type="checkbox" class="pchk" data-done="${r.date}" ${e.done ? 'checked' : ''} aria-label="تم التنفيذ"></td>
     <td class="c"><select class="prate" data-rate="${r.date}" aria-label="التقييم من 10"><option value="">–</option>${Array.from({ length: 10 }, (_, i) => `<option ${+e.rate === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></td></tr>`;
  }).join('') : `<tr><td colspan="7" class="note" style="text-align:center;padding:18px">لا توجد أوراد في هذه الفترة.</td></tr>`;
  return `<div class="panel">
    <p class="note" style="margin-top:0">${esc(scopeTxt)} — ${c.dir === 'back' ? 'من النهاية إلى البداية' : 'من البداية إلى النهاية'} — الورد اليومي: ${fmtPer(s)} — ${c.days.map(i => DAYS[i]).join('، ')}</p>
    <div class="psum"><div><b>${st.done}/${rows.length}</b>ورد منجز</div><div><b>${pct}%</b>نسبة الإنجاز</div><div><b>${st.avg == null ? '–' : st.avg.toFixed(1)}</b>متوسط التقييم من 10</div><div><b>${rows.length ? fGreg.format(parse(rows[rows.length - 1].date)) : '–'}</b>نهاية الخطة</div></div>
    <div class="prog" style="margin-top:10px"><i style="width:${pct}%"></i></div>
    ${todayRow ? `<p style="margin:12px 0 0"><b>ورد اليوم:</b> ${esc(fmtFrom(todayRow.from).page)} (${esc(fmtFrom(todayRow.from).sur)}) ← ${esc(fmtTo(todayRow.to).page)} (${esc(fmtTo(todayRow.to).sur)})</p>` : ''}
   </div>
   <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
    <div class="tabs"><button data-pview="week" class="${view === 'week' ? 'on' : ''}">أسبوعي</button><button data-pview="month" class="${view === 'month' ? 'on' : ''}">شهري</button></div>
    <div class="row" style="gap:6px"><button class="btn" data-pnav="-1" aria-label="السابق">→</button><button class="btn" data-pnav="0">اليوم</button><button class="btn" data-pnav="1" aria-label="التالي">←</button></div>
   </div>
   <p style="margin:0 0 8px;font-weight:700">${esc(label)}</p>
   <div class="ptable-wrap"><table class="ptable"><thead><tr><th>اليوم</th><th>التاريخ</th><th>بداية ${type === 'hifz' ? 'الحفظ' : 'المراجعة'}</th><th>النهاية</th><th>التكرار</th><th>التنفيذ</th><th>التقييم</th></tr></thead><tbody>${body}</tbody></table></div>
   <div class="row" style="margin-top:16px"><button class="btn" data-pedit>تعديل الخطة</button><button class="btn danger" data-pdel>حذف الخطة</button></div>
   <p class="note">الخطة محفوظة على هذا الجهاز وهذا المتصفح.</p>`;
}

/* ---------- تحديث السجل ---------- */
function setLog(date, patch){
  const st = store(), p = live(st[type]); if (!p) return;
  p.log = p.log || {}; p.log[date] = { ...(p.log[date] || {}), ...patch, t: Date.now() }; savePlans(st);
}
function getLog(date){ const p = live(store()[type]); return (p && p.log && p.log[date]) || {} }

/* ---------- عداد التكرار (ملء الشاشة) ---------- */
let cDate = null;
function openCounter(date){
  cDate = date; const p = live(store()[type]); if (!p) return;
  const r = schedule(p.cfg).rows.find(x => x.date === date);
  $('#cTitle').textContent = r ? `${fmtFrom(r.from).page} (${fmtFrom(r.from).sur}) ← ${fmtTo(r.to).page}` : '';
  paintCounter(); $('#counterOv').hidden = false; document.body.style.overflow = 'hidden';
  const el = document.documentElement; if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
  $('#cTap').focus();
}
function paintCounter(){
  const p = live(store()[type]), n = +getLog(cDate).count || 0, t = p ? p.cfg.target : 0;
  $('#cNum').textContent = n; $('#cTarget').textContent = t ? `الهدف: ${t}` : '';
  $('#counterOv').classList.toggle('full', t && n >= t);
}
function closeCounter(){
  $('#counterOv').hidden = true; document.body.style.overflow = ''; cDate = null;
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  render();
}
function bump(d){
  if (!cDate) return; const p = live(store()[type]), n = Math.max(0, (+getLog(cDate).count || 0) + d);
  setLog(cDate, { count: n }); paintCounter();
  if (d > 0 && navigator.vibrate) navigator.vibrate(p && n === p.cfg.target ? [60, 60, 60] : 15);
}

/* ---------- الأحداث ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  const pt = t.closest('[data-ptype]'); if (pt) { type = pt.dataset.ptype; LS.set('tq-plan-type', type); editing = false; anchor = null; render(); return }
  const go = t.closest('[data-goplan]'); if (go) { type = go.dataset.goplan; LS.set('tq-plan-type', type); editing = false; anchor = null }
  if (t.closest('[data-pcancel]')) { editing = false; render(); return }
  if (t.closest('[data-pedit]')) { editing = true; render(); return }
  const del = t.closest('[data-pdel]');
  if (del) {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'اضغط مرة أخرى للتأكيد'; setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = 'حذف الخطة' } }, 4000); return }
    const st = store(); st[type] = { deleted: true, ct: Date.now() }; savePlans(st); anchor = null; render(); renderHome(); return;
  }
  const pv = t.closest('[data-pview]'); if (pv) { view = pv.dataset.pview; LS.set('tq-plan-view', view); render(); return }
  const nv = t.closest('[data-pnav]');
  if (nv) { const k = +nv.dataset.pnav; anchor = !k ? today() : view === 'week' ? addDays(anchor, 7 * k) : new Date(anchor.getFullYear(), anchor.getMonth() + k, 1); render(); return }
  const cb = t.closest('[data-count]'); if (cb) { openCounter(cb.dataset.count); return }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.done) { setLog(t.dataset.done, { done: t.checked }); render(); renderHome(); return }
  if (t.dataset.rate !== undefined && t.classList.contains('prate')) { setLog(t.dataset.rate, { rate: t.value === '' ? null : +t.value }); render(); return }
  if (t.closest('#planForm')) {
    const f = $('#planForm');
    if (t.name === 'scope') {
      const sur = t.value === 'surah', list = sur ? SUR.map((n, i) => [i, i + '. ' + n]).slice(1) : Array.from({ length: 30 }, (_, i) => [i + 1, 'الجزء ' + (i + 1)]);
      f.from.innerHTML = opts(list, 1); f.to.innerHTML = opts(list, sur ? 114 : 30);
      f.querySelectorAll('[data-rng]').forEach(x => x.hidden = t.value === 'all');
    }
    if (t.name === 'mode') f.querySelectorAll('[data-m]').forEach(x => x.hidden = x.dataset.m !== t.value);
    updatePreview();
  }
});
document.addEventListener('input', e => { if (e.target.closest('#planForm')) updatePreview() });
document.addEventListener('submit', e => {
  if (e.target.id !== 'planForm') return; e.preventDefault();
  const c = readForm(); if (!c.days.length) { updatePreview(); return }
  const st = store(), old = live(st[type]);
  st[type] = { cfg: c, created: old ? old.created : Date.now(), ct: Date.now(), log: old ? old.log || {} : {} };
  savePlans(st); editing = false; anchor = null; render(); renderHome();
});
// العداد
$('#cTap').addEventListener('click', () => bump(1));
$('#cMinus').addEventListener('click', () => bump(-1));
$('#cReset').addEventListener('click', e => { const b = e.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'تأكيد التصفير'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'تصفير' }, 3000); return } b.dataset.armed = ''; b.textContent = 'تصفير'; setLog(cDate, { count: 0 }); paintCounter() });
$('#cClose').addEventListener('click', closeCounter);
document.addEventListener('keydown', e => {
  if ($('#counterOv').hidden) return;
  if (e.key === 'Escape') closeCounter();
  else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') { if (e.target.closest('#cTap') || e.target === document.body) { e.preventDefault(); bump(1) } }
  else if (e.key === 'ArrowDown') bump(-1);
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !$('#counterOv').hidden) {/* يبقى التكبير داخل الصفحة */} });

/* ---------- بطاقات الصفحة الرئيسية ---------- */
function renderHome(){
  ['hifz', 'review'].forEach(k => {
    const el = $('#home-' + k); if (!el) return;
    const p = live(store()[k]);
    if (!p) { el.textContent = 'لم تُنشأ خطة بعد.'; return }
    const s = schedule(p.cfg), T = iso(today()), r = s.rows.find(x => x.date === T), st = stats(p, s.rows);
    el.textContent = (r ? `ورد اليوم: ${fmtFrom(r.from).page} (${fmtFrom(r.from).sur}) ← ${fmtTo(r.to).page}${(p.log || {})[T] && p.log[T].done ? ' ✓' : ''}` : 'لا يوجد ورد اليوم.') + ` — أنجزت ${st.done} من ${s.rows.length}`;
  });
}
view = LS.get('tq-plan-view') === 'month' ? 'month' : 'week';
document.addEventListener('tq:view', e => { if (e.detail === 'plan') { editing = false; render() } if (e.detail === 'home') renderHome() });
renderHome();
if (location.hash === '#plan') render();

/* ---------- دمج نسختين من الخطط (الجهاز والخادم) ---------- */
// الإعدادات والحذف: الأحدث يفوز. سجل الأيام: يُدمج يوماً بيوم، والأحدث يفوز في اليوم نفسه
function mergePlan(a, b){
  if (!a) return b || null; if (!b) return a;
  const ca = a.ct || a.created || 0, cb = b.ct || b.created || 0, top = cb > ca ? b : a;
  if (top.deleted) return { deleted: true, ct: Math.max(ca, cb) };
  const la = a.deleted ? {} : (a.log || {}), lb = b.deleted ? {} : (b.log || {}), log = {};
  new Set([...Object.keys(la), ...Object.keys(lb)]).forEach(d => { const x = la[d], y = lb[d]; log[d] = !x ? y : !y ? x : ((y.t || 0) > (x.t || 0) ? y : x) });
  const created = Math.min(...[a.created, b.created].filter(Boolean), Date.now());
  return { cfg: top.cfg, created, ct: Math.max(ca, cb), log };
}
function merge(local, remote){ const out = {}; ['hifz', 'review'].forEach(k => { const m = mergePlan((local || {})[k], (remote || {})[k]); if (m) out[k] = m }); return out }
function setStore(s){ savePlans(s || {}, true); if (!$('[data-view=plan]').hidden) render(); renderHome() }

/* ---------- ملخص وجدول للعرض فقط (للمشرف) ---------- */
function summary(plan){
  const p = live(plan); if (!p) return null;
  const s = schedule(p.cfg), st = stats(p, s.rows), T = iso(today());
  return { total: s.rows.length, done: st.done, pct: s.rows.length ? Math.round(st.done / s.rows.length * 100) : 0, avg: st.avg, per: fmtPer(s), today: s.rows.find(r => r.date === T) || null, todayDone: !!((p.log || {})[T] || {}).done, end: s.rows.length ? s.rows[s.rows.length - 1].date : null };
}
function readOnlyHTML(plan, t){
  const p = live(plan); if (!p) return '<p class="note">لا توجد خطة.</p>';
  const c = p.cfg, s = schedule(c), log = p.log || {}, T = iso(today()), A = iso(addDays(today(), -14)), B = iso(addDays(today(), 7));
  const scopeTxt = c.scope === 'all' ? 'المصحف كاملاً' : c.scope === 'juz' ? `من الجزء ${c.from} إلى الجزء ${c.to}` : `من سورة ${SUR[c.from]} إلى سورة ${SUR[c.to]}`;
  const rows = s.rows.filter(r => r.date >= A && r.date <= B), sm = summary(p);
  return `<p class="note" style="margin:0 0 8px">${esc(TITLES[t])}: ${esc(scopeTxt)} — الورد اليومي: ${esc(fmtPer(s))} — أنجز ${sm.done} من ${sm.total} (${sm.pct}%)${sm.avg == null ? '' : ' — متوسط التقييم ' + sm.avg.toFixed(1)}</p>
  <div class="ptable-wrap"><table class="ptable"><thead><tr><th>اليوم</th><th>التاريخ</th><th>البداية</th><th>النهاية</th><th>التكرار</th><th>التنفيذ</th><th>التقييم</th></tr></thead><tbody>${rows.length ? rows.map(r => { const e = log[r.date] || {}, d = parse(r.date), f = fmtFrom(r.from), to = fmtTo(r.to);
    return `<tr class="${r.date === T ? 'today' : ''} ${e.done ? 'done' : ''}"><td>${DAYS[d.getDay()]}</td><td>${fGreg.format(d)}</td><td>${esc(f.page)}<small>${esc(f.sur)}</small></td><td>${esc(to.page)}<small>${esc(to.sur)}</small></td><td class="c">${+e.count || 0}/${c.target}</td><td class="c">${e.done ? '✓' : (r.date < T ? '✗' : '')}</td><td class="c">${e.rate ? e.rate + '/10' : '–'}</td></tr>` }).join('') : '<tr><td colspan="7" class="note" style="text-align:center">لا أوراد في الأسبوعين الماضيين ولا الأسبوع القادم.</td></tr>'}</tbody></table></div>
  <p class="note">يعرض الجدول الأسبوعين الماضيين والأسبوع القادم.</p>`;
}
window.TQPlan = { schedule, fmtAmount, pageOrder, merge, getStore: store, setStore, summary, readOnlyHTML, live };
})();
