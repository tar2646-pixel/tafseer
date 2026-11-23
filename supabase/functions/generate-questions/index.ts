// دالة Supabase: تستخرج أسئلة اختيار من متعدد من نص أو صور صفحات باستخدام Claude API.
// يحتاج سرّاً واحداً في Supabase ← Edge Functions ← Secrets: ANTHROPIC_API_KEY
// (اختياري) ANTHROPIC_MODEL لتغيير النموذج.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const rules = (n: number, title: string) => `أنت معلّم متخصص في تفسير القرآن الكريم. أعدّ ${n} أسئلة اختيار من متعدد لمسابقة مراجعة، من المادة التالية المأخوذة من ملف «${title}».
الشروط:
- لكل سؤال ثلاثة خيارات فقط: واحد صحيح، واثنان خاطئان لكنهما معقولان ومن الموضوع نفسه.
- الأسئلة من المعلومات الواردة في المادة فقط (معاني الكلمات، تفسير الآيات، الفوائد والهدايات، أسباب النزول، الأحكام)، ولا تضف شيئاً من خارجها.
- الحقل "source": انقل المعلومة كاملة كما وردت في المادة حرفياً (الجملة أو الفقرة التي بُني عليها السؤال)، واذكر الآية المفسَّرة إن وردت.
- لا تكرر الأسئلة، وغيّر موضع الإجابة الصحيحة بين 0 و1 و2.
- إن ظهر ترتيب الكلمات في النص معكوساً أو مقطّعاً فأصلحه عند النقل دون تغيير المعنى.
- إن لم تكفِ المادة لهذا العدد فأعد أقل منه، وإن خلت من التفسير فأعد قائمة فارغة.
أعد JSON فقط دون أي كلام آخر، بهذا الشكل:
{"questions":[{"q":"نص السؤال","options":["خيار","خيار","خيار"],"answer":0,"source":"نص المعلومة كاملة"}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    // التحقق من أن المستدعي مدير أو مشرف
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: role, error: roleErr } = await sb.rpc("my_role");
    if (roleErr || !["admin", "supervisor"].includes(role)) return json({ error: "غير مصرح: سجّل الدخول بحساب مشرف" }, 403);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "لم يُضبط ANTHROPIC_API_KEY في أسرار Supabase" }, 500);

    const body = await req.json();
    const n = Math.min(20, Math.max(3, Number(body.n) || 10));
    const title = String(body.title ?? "").slice(0, 120);
    const text = typeof body.text === "string" ? body.text.slice(0, 20000) : "";
    const images = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
    if (!text && !images.length) return json({ error: "لا توجد مادة" }, 400);

    const content: unknown[] = [];
    for (const im of images) {
      if (typeof im?.data !== "string") continue;
      content.push({ type: "image", source: { type: "base64", media_type: im.media_type === "image/png" ? "image/png" : "image/jpeg", data: im.data } });
    }
    content.push({
      type: "text",
      text: rules(n, title) + (text
        ? `\n\nالمادة:\n"""\n${text}\n"""`
        : `\n\nالمادة في الصور المرفقة (صفحات ${(body.pages ?? []).join("، ")}). اقرأ النص العربي منها بدقة وانقل المصدر حرفياً.`),
    });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
        max_tokens: 8000,
        messages: [{ role: "user", content }],
      }),
    });
    if (!r.ok) return json({ error: `Claude API ${r.status}: ${(await r.text()).slice(0, 300)}` }, 502);

    const d = await r.json();
    const out = (d.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    const m = out.match(/\{[\s\S]*\}/);
    let questions: unknown[] = [];
    try { questions = m ? (JSON.parse(m[0]).questions ?? []) : [] } catch { questions = [] }
    return json({ questions });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
