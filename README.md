# مراجعة التفسير

موقع اختبارات ومراجعة في التفسير، وفي حفظ جزء ق (من ق إلى الحديد) وجزء المجادلة (من المجادلة إلى التحريم).

- 30 سؤالاً في كل اختبار، ولكل سؤال ثلاثة خيارات ومصدر المعلومة كاملاً.
- لوحة صدارة مشتركة بأعلى عشرة مشاركين في كل اختبار.
- يُثبَّت على الجوال والحاسوب كتطبيق، ويعمل اختبار الحفظ دون إنترنت بعد أول فتح.
- صفحة إدارة مقفلة للمدير والمشرفين: رفع ملفات PDF واستخراج الأسئلة منها آلياً.

## خطوات التشغيل

### 1) تفعيل GitHub Pages
المستودع ← **Settings** ← **Pages** ← في Source اختر **Deploy from a branch** ← الفرع **main** والمجلد **/ (root)** ← **Save**.
بعد دقيقة يصبح الموقع على: `https://tar2646-pixel.github.io/tafseer/`

### 2) إنشاء مشروع Supabase
1. ادخل [supabase.com](https://supabase.com) ← **New project**.
2. افتح **SQL Editor** ← **New query**، والصق محتوى الملف `supabase/schema.sql`.
   **غيّر البريد في آخر سطر إلى بريدك** ثم اضغط **Run**.
3. من **Project Settings ← API** انسخ **Project URL** والمفتاح **anon public** (أو **Publishable key**)،
   وضعهما في الملف `config.js` في هذا المستودع.
   لا تضع مفتاح `service_role` أبداً.

### 3) حساب المدير
افتح الموقع ← رابط **دخول المشرفين** أسفل الصفحة ← **إنشاء حساب مشرف** بالبريد نفسه الذي وضعته في SQL ← أكّد البريد من الرسالة التي تصلك ← ادخل.
لإضافة مشرفين: من صفحة الإدارة ← «المدير والمشرفون» ← أضف بريده، ثم ينشئ هو حسابه بالطريقة نفسها.

> في Supabase ← **Authentication ← URL Configuration** ضع رابط موقعك في **Site URL** حتى تعود رسائل التأكيد إليه.

### 4) استخراج الأسئلة آلياً من PDF (اختياري)
1. أنشئ مفتاحاً من [console.anthropic.com](https://console.anthropic.com).
2. في Supabase ← **Edge Functions** ← **Secrets** أضف سراً باسم `ANTHROPIC_API_KEY` وقيمته المفتاح.
3. **Edge Functions** ← **Deploy a new function** ← **Via Editor**، اسم الدالة: `generate-questions`،
   والصق محتوى `supabase/functions/generate-questions/index.ts` ← **Deploy**.

بدون هذه الخطوة يمكنك استيراد أسئلة جاهزة بصيغة JSON من صفحة الإدارة.

## الملفات
| الملف | الغرض |
|---|---|
| `index.html` | الصفحة والتصميم |
| `app.js` | منطق الاختبارات ولوحة الصدارة والإدارة |
| `config.js` | بيانات الاتصال بـ Supabase |
| `sw.js`، `manifest.webmanifest`، `icons/` | التثبيت كتطبيق والعمل دون إنترنت |
| `supabase/schema.sql` | الجداول والصلاحيات |
| `supabase/functions/generate-questions/` | دالة استخراج الأسئلة |

نص القرآن الكريم بالرسم العثماني من مشروع [quran-json](https://github.com/risan/quran-json) (مصدره Tanzil).
