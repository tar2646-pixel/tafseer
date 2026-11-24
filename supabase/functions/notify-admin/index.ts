// إشعار بريدي للمدير عند كل طلب عضوية جديد.
// يستدعيها Database Webhook عند إضافة صف في جدول profiles.
// الأسرار (تُضاف في Supabase ← Edge Functions ← Secrets، ولا تُكتب هنا):
//   RESEND_API_KEY  مفتاح Resend
//   ADMIN_EMAIL     بريد المدير (ويمكن أكثر من بريد بينها فاصلة)
//   HOOK_SECRET     كلمة سرية تختارها أنت وتضعها أيضاً في ترويسة الـ Webhook
//   SITE_URL        (اختياري) رابط الموقع
//   MAIL_FROM       (اختياري) المرسل، مثل: مراجعة التفسير <noreply@yourdomain.com>

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = env("HOOK_SECRET");
  if (!secret || req.headers.get("x-hook-secret") !== secret) return new Response("forbidden", { status: 403 });

  let body: any;
  try { body = await req.json() } catch { return new Response("bad json", { status: 400 }) }

  const rec = body?.record;
  // نرسل فقط للعضو الجديد المنتظر (المشرفون يُقبلون تلقائياً)
  if (body?.type !== "INSERT" || body?.table !== "profiles" || !rec || rec.status !== "pending") {
    return new Response("skipped", { status: 200 });
  }

  const key = env("RESEND_API_KEY"), to = env("ADMIN_EMAIL").split(",").map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) return new Response("missing RESEND_API_KEY or ADMIN_EMAIL", { status: 500 });

  const site = (env("SITE_URL") || "https://tar2646-pixel.github.io/tafseer/").replace(/#.*$/, "");
  const when = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
  }).format(new Date(rec.created_at || Date.now()));
  const name = rec.name || "بدون اسم";

  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:16px;line-height:1.8;color:#14221f">
  <h2 style="color:#0f3d3e;margin:0 0 12px">طلب عضوية جديد</h2>
  <p style="margin:0">الاسم: <b>${esc(name)}</b><br>البريد: <span dir="ltr">${esc(rec.email)}</span><br>وقت التسجيل: ${esc(when)}</p>
  <p style="margin:20px 0"><a href="${esc(site)}#admin" style="background:#0f3d3e;color:#fff;padding:10px 22px;border-radius:10px;text-decoration:none;display:inline-block">مراجعة الطلب في صفحة الإدارة</a></p>
  <p style="color:#5b6a66;font-size:13px">وصلتك هذه الرسالة لأنك مدير موقع مراجعة التفسير.</p></div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("MAIL_FROM") || "مراجعة التفسير <onboarding@resend.dev>",
      to,
      subject: `طلب عضوية جديد: ${name}`,
      html,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("resend error", r.status, t);
    return new Response("mail failed: " + t, { status: 502 });
  }
  return new Response("sent", { status: 200 });
});
