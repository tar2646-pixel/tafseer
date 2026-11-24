/* العضوية: الدخول والتسجيل وإعادة كلمة المرور، ومزامنة الخطط، ومتابعة المشرف للأعضاء */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS = {
  get(k){ try { return localStorage.getItem(k) } catch(e){ return null } },
  set(k,v){ try { localStorage.setItem(k,v) } catch(e){} }
};
const T = window.TQ || {}, sb = T.sb, P = () => window.TQPlan;
const BASE = location.origin + location.pathname;
const ROLE_TXT = { admin: 'مدير', supervisor: 'مشرف' };
const AUTH_CB = /access_token|refresh_token|error_code|type=recovery/;

let mode = 'login', profile = null, msg = '', msgOk = false, busy = false, ready = !sb;
let sync = { state: '', at: +LS.get('tq-sync-at') || 0 };

/* ---------- رسائل الأخطاء ---------- */
function errText(e){
  const m = String(e && (e.message || e.error_description || e) || '');
  if (/invalid login|invalid credentials/i.test(m)) return 'البريد أو كلمة المرور غير صحيحة.';
  if (/not confirmed/i.test(m)) return 'لم يُؤكَّد البريد بعد. افتح رسالة التأكيد في بريدك (وتحقق من مجلد الرسائل غير المرغوبة).';
  if (/already registered|already exists/i.test(m)) return 'هذا البريد مسجّل من قبل. سجّل الدخول، أو استخدم «نسيت كلمة المرور».';
  if (/rate limit|too many|security purposes/i.test(m)) return 'طلبات كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.';
  if (/password.*(short|least|characters)/i.test(m)) return 'كلمة المرور قصيرة؛ اجعلها 8 أحرف على الأقل.';
  if (/same.*password|different from the old/i.test(m)) return 'اختر كلمة مرور مختلفة عن السابقة.';
  if (/expired|invalid.*(link|token)|otp/i.test(m)) return 'الرابط منتهي أو استُخدم من قبل. اطلب رابطاً جديداً.';
  if (/fetch|network/i.test(m)) return 'تعذّر الاتصال. تحقّق من الإنترنت.';
  return 'حدث خطأ: ' + m;
}
const say = (t, ok) => { msg = t; msgOk = !!ok; render() };

/* ---------- الواجهة ---------- */
const pw = (id, ac, label) => `<div><label class="f" for="${id}">${label}</label><input type="password" id="${id}" name="${id}" autocomplete="${ac}" dir="ltr" minlength="8" class="inp"></div>`;
const em = `<div><label class="f" for="aEmail">البريد الإلكتروني</label><input type="email" id="aEmail" name="aEmail" inputmode="email" autocomplete="username" dir="ltr" class="inp" value="${esc(LS.get('tq-last-email') || '')}"></div>`;
const PERMS = `<details class="src"><summary>الصلاحيات في الموقع</summary><div><table class="bk perm"><thead><tr><th></th><th>زائر</th><th>عضو</th><th>مشرف</th><th>مدير</th></tr></thead><tbody>
  <tr><td>الاختبارات ولوحة الصدارة</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
  <tr><td>خطة الحفظ والمراجعة على الجهاز</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
  <tr><td>حفظ الخطة في الحساب ومزامنتها بين الأجهزة</td><td>–</td><td>✓</td><td>✓</td><td>✓</td></tr>
  <tr><td>إدارة بنوك الأسئلة</td><td>–</td><td>–</td><td>✓</td><td>✓</td></tr>
  <tr><td>متابعة خطط الأعضاء (عرض فقط)</td><td>–</td><td>–</td><td>✓</td><td>✓</td></tr>
  <tr><td>إضافة المشرفين وتصفير لوحة الصدارة</td><td>–</td><td>–</td><td>–</td><td>✓</td></tr>
 </tbody></table></div></details>`;

function render(){
  const r = $('#accountRoot'); if (!r) return;
  const nav = $('#navAccount'); if (nav) nav.textContent = T.session ? 'حسابي' : 'دخول';
  const note = msg ? `<p class="amsg ${msgOk ? 'ok' : 'no'}" role="status">${esc(msg)}</p>` : '';
  if (!sb) { r.innerHTML = '<div class="empty">العضوية غير مفعّلة: لم يُربط الموقع بقاعدة البيانات.</div>'; return }
  if (!ready) { r.innerHTML = '<div class="empty">جارٍ التحقق من الدخول…</div>'; return }
  if (mode === 'recovery') {
    r.innerHTML = `<form class="panel aform" data-a="newpass"><h2>تعيين كلمة مرور جديدة</h2>${pw('aPass', 'new-password', 'كلمة المرور الجديدة (8 أحرف على الأقل)')}${pw('aPass2', 'new-password', 'أعد كتابة كلمة المرور')}
      <button class="btn pri" type="submit" ${busy ? 'disabled' : ''}>حفظ كلمة المرور</button>${note}</form>`;
    return;
  }
  const s = T.session;
  if (!s) {
    const tabs = `<div class="tabs" style="margin-bottom:14px"><button type="button" data-amode="login" class="${mode === 'login' ? 'on' : ''}">تسجيل الدخول</button><button type="button" data-amode="signup" class="${mode === 'signup' ? 'on' : ''}">عضوية جديدة</button></div>`;
    let f;
    if (mode === 'forgot') f = `<form class="panel aform" data-a="forgot"><h2>نسيت كلمة المرور</h2><p class="note" style="margin-top:0">اكتب بريدك، وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.</p>${em}
      <div class="row"><button class="btn pri" type="submit" ${busy ? 'disabled' : ''}>إرسال الرابط</button><button class="btn ghost" type="button" data-amode="login">رجوع</button></div>${note}</form>`;
    else if (mode === 'signup') f = `${tabs}<form class="panel aform" data-a="signup"><h2>عضوية جديدة</h2>
      <div><label class="f" for="aName">الاسم</label><input type="text" id="aName" name="aName" maxlength="60" autocomplete="name" class="inp"></div>${em}${pw('aPass', 'new-password', 'كلمة المرور (8 أحرف على الأقل)')}
      <button class="btn pri" type="submit" ${busy ? 'disabled' : ''}>إنشاء العضوية</button>${note}
      <p class="note">العضوية تحفظ خطتك في حسابك، فتظهر كما وضعتها على أي جهاز تدخل منه.</p></form>`;
    else f = `${tabs}<form class="panel aform" data-a="login"><h2>تسجيل الدخول</h2>${em}${pw('aPass', 'current-password', 'كلمة المرور')}
      <div class="row" style="justify-content:space-between;align-items:center"><button class="btn pri" type="submit" ${busy ? 'disabled' : ''}>دخول</button><button class="btn ghost" type="button" data-amode="forgot">نسيت كلمة المرور؟</button></div>${note}</form>`;
    r.innerHTML = f + PERMS;
    return;
  }
  const role = T.role, roleTxt = ROLE_TXT[role] || 'عضو';
  const syncTxt = !navigator.onLine ? 'غير متصل — ستُزامن خطتك عند عودة الاتصال.' : sync.state === 'busy' ? 'جارٍ المزامنة…' : sync.state === 'err' ? 'تعذّرت المزامنة الآن؛ سنعيد المحاولة.' : sync.at ? 'آخر مزامنة: ' + new Date(sync.at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : 'لم تتم مزامنة بعد.';
  const plans = P() ? P().getStore() : {}, line = k => { const sm = P() && P().summary(plans[k]); return sm ? `${sm.done} من ${sm.total} ورداً (${sm.pct}%)` : 'لا توجد خطة' };
  r.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">مرحباً${profile && profile.name ? '، ' + esc(profile.name) : ''}</h2><span class="rolebadge ${esc(role || 'member')}">${roleTxt}</span></div>
     <p class="note" dir="ltr" style="text-align:end;margin:6px 0 0">${esc(s.user.email)}</p></div>
   <div class="panel"><h2>خططي</h2>
     <p style="margin:0">خطة الحفظ: <b>${line('hifz')}</b><br>خطة المراجعة: <b>${line('review')}</b></p>
     <p class="note">${esc(syncTxt)}</p>
     <div class="row"><a class="btn pri" href="#plan" data-goplan="hifz" style="text-decoration:none;display:inline-flex;align-items:center">خطة الحفظ</a><a class="btn" href="#plan" data-goplan="review" style="color:inherit;text-decoration:none;display:inline-flex;align-items:center">خطة المراجعة</a><button class="btn ghost" type="button" data-async>مزامنة الآن</button></div></div>
   ${role ? `<div class="panel"><h2>صلاحيات ${roleTxt}</h2><p style="margin-top:0">لديك صلاحية ${role === 'admin' ? 'إدارة الموقع كاملاً: بنوك الأسئلة، ومتابعة الأعضاء، وإضافة المشرفين.' : 'إدارة بنوك الأسئلة ومتابعة خطط الأعضاء.'}</p><a class="btn pri" href="#admin" style="text-decoration:none;display:inline-flex;align-items:center">صفحة الإدارة</a></div>` : ''}
   <form class="panel aform" data-a="profile"><h2>الاسم</h2><div><label class="f" for="aName">الاسم الظاهر</label><input type="text" id="aName" name="aName" maxlength="60" value="${esc(profile ? profile.name : '')}" class="inp"></div><button class="btn" type="submit">حفظ الاسم</button></form>
   <form class="panel aform" data-a="changepass"><h2>تغيير كلمة المرور</h2>${pw('aPass', 'new-password', 'كلمة المرور الجديدة')}${pw('aPass2', 'new-password', 'أعد كتابتها')}<button class="btn" type="submit" ${busy ? 'disabled' : ''}>تغيير كلمة المرور</button></form>
   ${note}
   <div class="row"><button class="btn danger" type="button" data-asignout>تسجيل الخروج</button></div>
   ${PERMS}`;
}

/* ---------- الإجراءات ---------- */
async function act(kind, f){
  const v = n => (f.elements[n] ? f.elements[n].value : '').trim(), pass = f.elements.aPass ? f.elements.aPass.value : '';
  const email = v('aEmail').toLowerCase();
  if (email) LS.set('tq-last-email', email);
  busy = true; msg = ''; render();
  try {
    if (kind === 'login') {
      if (!email || !pass) throw { message: '' , ui: 'اكتب البريد وكلمة المرور.' };
      const { error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error;
      msg = '';
    } else if (kind === 'signup') {
      const name = v('aName').slice(0, 60);
      if (!name) throw { ui: 'اكتب اسمك.' };
      if (!email || pass.length < 8) throw { ui: 'اكتب البريد وكلمة مرور من 8 أحرف على الأقل.' };
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name }, emailRedirectTo: BASE + '#account' } }); if (error) throw error;
      if (data && data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw { ui: 'هذا البريد مسجّل من قبل. سجّل الدخول، أو استخدم «نسيت كلمة المرور».' };
      if (!data.session) { mode = 'login'; busy = false; say('أُنشئت العضوية. افتح رسالة التأكيد في بريدك ثم سجّل الدخول (تحقّق من مجلد الرسائل غير المرغوبة).', true); return }
    } else if (kind === 'forgot') {
      if (!email) throw { ui: 'اكتب بريدك.' };
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: BASE + '#account' }); if (error) throw error;
      busy = false; say('إن كان البريد مسجّلاً فستصلك رسالة فيها رابط تعيين كلمة المرور. افتحها من هذا الجهاز (وتحقّق من مجلد الرسائل غير المرغوبة).', true); return;
    } else if (kind === 'newpass' || kind === 'changepass') {
      const p2 = f.elements.aPass2 ? f.elements.aPass2.value : '';
      if (pass.length < 8) throw { ui: 'كلمة المرور 8 أحرف على الأقل.' };
      if (pass !== p2) throw { ui: 'كلمتا المرور غير متطابقتين.' };
      const { error } = await sb.auth.updateUser({ password: pass }); if (error) throw error;
      mode = 'login'; busy = false; say('تم تغيير كلمة المرور.', true); return;
    } else if (kind === 'profile') {
      const name = v('aName').slice(0, 60); if (!name) throw { ui: 'اكتب اسماً.' };
      const { error } = await sb.from('profiles').update({ name }).eq('id', T.session.user.id); if (error) throw error;
      profile = { ...(profile || {}), name }; busy = false; say('حُفظ الاسم.', true); return;
    }
  } catch (e) { busy = false; say(e && e.ui ? e.ui : errText(e)); return }
  busy = false; render();
}
async function signOut(){
  try { await syncNow() } catch (e) {}
  await sb.auth.signOut();
}

/* ---------- المزامنة ---------- */
// ترتيب ثابت للمفاتيح حتى تكون المقارنة صحيحة مع jsonb
const canon = x => Array.isArray(x) ? '[' + x.map(canon).join(',') + ']' : x && typeof x === 'object' ? '{' + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}' : JSON.stringify(x);
let syncing = false, again = false, timer = null;
async function syncNow(){
  const s = T.session;
  if (!sb || !s || !P() || !navigator.onLine) { render(); return }
  if (syncing) { again = true; return }
  syncing = true; sync.state = 'busy'; render();
  try {
    const uid = s.user.id;
    const { data, error } = await sb.from('plans').select('type,data').eq('user_id', uid); if (error) throw error;
    const remote = {}; (data || []).forEach(r => remote[r.type] = r.data);
    const merged = P().merge(P().getStore(), remote);
    if (canon(merged) !== canon(P().getStore())) P().setStore(merged);
    const ups = Object.keys(merged).filter(k => canon(merged[k]) !== canon(remote[k])).map(k => ({ user_id: uid, type: k, data: merged[k], updated_at: new Date().toISOString() }));
    if (ups.length) { const { error: e2 } = await sb.from('plans').upsert(ups); if (e2) throw e2 }
    sync = { state: 'ok', at: Date.now() }; LS.set('tq-sync-at', String(sync.at));
  } catch (e) { sync.state = 'err' }
  finally { syncing = false; render(); if (again) { again = false; syncNow() } }
}
const syncSoon = () => { clearTimeout(timer); timer = setTimeout(syncNow, 1200) };

async function loadProfile(){
  const s = T.session; if (!s) { profile = null; return }
  const { data } = await sb.from('profiles').select('name,email').eq('id', s.user.id).maybeSingle();
  profile = data || { name: (s.user.user_metadata && s.user.user_metadata.name) || '' };
  // الاسم الافتراضي في الاختبارات = اسم العضو
  if (profile.name && !LS.get('tq-name')) { LS.set('tq-name', profile.name); const n = $('#name'); if (n && !n.value) n.value = profile.name }
  render();
}

/* ---------- متابعة الأعضاء (للمدير والمشرف) ---------- */
let members = null, mFilter = '', mOpen = null;
async function loadMembers(){
  const el = $('#membersPanel'); if (!el) return;
  if (!T.role || !sb) { el.hidden = true; return }
  el.hidden = false; el.innerHTML = '<h2>الأعضاء ومتابعة الخطط</h2><p class="note">جارٍ التحميل…</p>';
  const [p, pl] = await Promise.all([sb.from('profiles').select('id,name,email,created_at').order('created_at'), sb.from('plans').select('user_id,type,data,updated_at')]);
  if (p.error || pl.error) { el.innerHTML = '<h2>الأعضاء ومتابعة الخطط</h2><p class="note">تعذّر تحميل الأعضاء. تأكد من تشغيل ملف migrate-3.sql في Supabase.</p>'; return }
  const byU = {}; (pl.data || []).forEach(r => { (byU[r.user_id] = byU[r.user_id] || {})[r.type] = r.data; byU[r.user_id]._at = Math.max(byU[r.user_id]._at || 0, Date.parse(r.updated_at) || 0) });
  members = (p.data || []).map(m => ({ ...m, plans: byU[m.id] || {} }));
  renderMembers();
}
function renderMembers(){
  const el = $('#membersPanel'); if (!el || !members) return;
  const q = mFilter.trim().toLowerCase(), list = members.filter(m => !q || (m.name || '').toLowerCase().includes(q) || (m.email || '').includes(q));
  const cell = (pl) => { const sm = P().summary(pl); if (!sm) return '<span class="note">—</span>'; return `<b>${sm.pct}%</b> <span class="note">(${sm.done}/${sm.total}${sm.avg == null ? '' : '، تقييم ' + sm.avg.toFixed(1)})</span>${sm.today ? `<br><span class="note">اليوم: ${sm.todayDone ? '✓ منجز' : 'لم يُنجز بعد'}</span>` : ''}` };
  el.innerHTML = `<h2>الأعضاء ومتابعة الخطط <span class="note">(${members.length})</span></h2>
   <div class="row" style="margin-bottom:10px"><input type="text" data-mfilter placeholder="ابحث بالاسم أو البريد" value="${esc(mFilter)}" style="max-width:320px"><button class="btn" type="button" data-mreload>تحديث</button></div>
   ${list.length ? `<div class="ptable-wrap"><table class="bk"><thead><tr><th>العضو</th><th>خطة الحفظ</th><th>خطة المراجعة</th><th>آخر مزامنة</th><th></th></tr></thead><tbody>${list.map(m => `
    <tr><td>${esc(m.name || 'بدون اسم')}<br><span class="note" dir="ltr">${esc(m.email || '')}</span></td><td>${cell(m.plans.hifz)}</td><td>${cell(m.plans.review)}</td><td class="note">${m.plans._at ? new Date(m.plans._at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn') : '—'}</td>
    <td class="n">${(P().live(m.plans.hifz) || P().live(m.plans.review)) ? `<button class="btn" type="button" data-mview="${esc(m.id)}">${mOpen === m.id ? 'إخفاء' : 'عرض'}</button>` : ''}</td></tr>
    ${mOpen === m.id ? `<tr><td colspan="5">${P().readOnlyHTML(m.plans.hifz, 'hifz')}${P().readOnlyHTML(m.plans.review, 'review')}</td></tr>` : ''}`).join('')}</tbody></table></div>` : '<div class="empty">لا يوجد أعضاء بعد.</div>'}
   <p class="note">العرض للمتابعة فقط؛ لا يستطيع المشرف تعديل خطة العضو.</p>`;
}

/* ---------- الأحداث ---------- */
document.addEventListener('submit', e => { const f = e.target.closest('form.aform'); if (!f) return; e.preventDefault(); act(f.dataset.a, f) });
document.addEventListener('click', e => {
  const t = e.target;
  const m = t.closest('[data-amode]'); if (m) { mode = m.dataset.amode; msg = ''; render(); return }
  if (t.closest('[data-asignout]')) { signOut(); return }
  if (t.closest('[data-async]')) { syncNow(); return }
  if (t.closest('[data-mreload]')) { loadMembers(); return }
  const mv = t.closest('[data-mview]'); if (mv) { mOpen = mOpen === mv.dataset.mview ? null : mv.dataset.mview; renderMembers() }
});
document.addEventListener('input', e => { if (e.target.matches('[data-mfilter]')) { mFilter = e.target.value; const pos = e.target.selectionStart; renderMembers(); const i = $('[data-mfilter]'); if (i) { i.focus(); i.setSelectionRange(pos, pos) } } });

function onAuth(ev){
  const s = T.session;
  ready = true;
  if (AUTH_CB.test(location.hash)) {
    // رابط البريد: خطأ (رابط منتهي) أو نجاح؛ ننظف العنوان في الحالتين
    const err = /error_description=([^&]+)/.exec(location.hash);
    history.replaceState(null, '', '#account');
    if (err && ev !== 'PASSWORD_RECOVERY') { msg = errText(decodeURIComponent(err[1].replace(/\+/g, ' '))); msgOk = false }
    else if (ev !== 'PASSWORD_RECOVERY' && s) { msg = 'تم تأكيد الدخول. مرحباً بك!'; msgOk = true }
  }
  if (ev === 'PASSWORD_RECOVERY') { mode = 'recovery'; msg = ''; if (location.hash !== '#account') location.hash = '#account' }
  if (s) {
    const uid = s.user.id, owner = LS.get('tq-plans-owner');
    // خطط حساب آخر على هذا الجهاز لا تُدمج في حسابك؛ أما خطط الزائر فتُضاف إلى حسابك عند أول دخول
    if (owner && owner !== uid && P()) P().setStore({});
    LS.set('tq-plans-owner', uid);
    if (mode !== 'recovery') mode = 'login';
    loadProfile(); syncNow();
  } else if (ev === 'SIGNED_OUT') {
    if (P()) P().setStore({}); LS.set('tq-plans-owner', ''); profile = null; sync = { state: '', at: 0 }; LS.set('tq-sync-at', '');
    if (mode === 'recovery') mode = 'login';
  }
  render();
  if (location.hash === '#admin') loadMembers();
}
document.addEventListener('tq:auth', e => onAuth(e.detail.ev));
document.addEventListener('tq:plans-changed', () => { if (T.session) syncSoon() });
document.addEventListener('tq:view', e => { if (e.detail === 'account') { if (T.session) loadProfile(); render() } if (e.detail === 'admin') loadMembers() });
window.addEventListener('online', () => { if (T.session) syncNow(); render() });
window.addEventListener('offline', render);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && T.session) syncSoon() });

window.TQAccount = { signOut, syncNow };
render();
// إن كان التحقق من الدخول قد انتهى قبل تحميل هذا الملف
if (T.authReady) onAuth('INITIAL');
})();
