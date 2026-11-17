import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
const db = () => getStore("silent");
const PW = () => process.env.ADMIN_PASSWORD || "";
const sign = s => crypto.createHmac("sha256", PW() + "|sh").update(s).digest("hex");
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const NOTE = "Brand ki taraf se verified ingredients list yahan add karein (Admin > Products).";
const mk = (id, name, price, size, img, desc, benefits, usage, extra = {}) => ({ id, slug: id, name, price, size, imgs: img, desc, ingredients: NOTE, benefits, usage, stock: 100, ...extra });
const SEED = [
  mk("anti-hair-fall-serum", "Anti Hair Fall Serum", 1199, "50ml", ["/images/serum.jpg", "/images/poster.jpg"], "Silent Herbal Hair Serum – smooth, protect aur repair ke liye. Silky, shiny aur frizz free baal.", "Smooth • Protect • Repair\nSilky, shiny, frizz free look", "Chand boondein gile ya sukhe baalon ke lengths aur siron par lagayein. Dho kar nahi nikalna."),
  mk("anti-hair-fall-shampoo", "Anti Hair Fall Shampoo", 1199, "225ml", ["/images/shampoo.jpg", "/images/poster.jpg"], "Silent Herbal Herbal Shampoo – cleanse, nourish aur repair. Natural extracts & botanicals ke saath.", "Cleanse • Nourish • Repair\nStronger, shinier aur healthier baal", "Geele baalon par lagayein, scalp par halka massage karein aur achi tarah dho lein."),
  mk("anti-hair-fall-hair-oil", "Anti Hair Fall Hair Oil", 1799, "125ml", ["/images/oil.jpg", "/images/poster.jpg"], "Silent Herbal Hair Oil – 100% natural oils aur herbal extracts ke saath, longer aur stronger baalon ke liye.", "Nourish • Strength • Grow\nLonger, stronger, healthier baal", "Scalp par lagayein, 5 minute massage karein. Behtar nateeje ke liye raat bhar ya kam az kam 1 ghanta rakh kar shampoo karein."),
  mk("complete-hair-care-combo", "SILENT HERBAL Complete Hair Care Combo", 3999, "Serum 50ml + Shampoo 225ml + Oil 125ml", ["/images/combo.jpg", "/images/poster.jpg"], "Complete 3-in-1 hair care set: Anti Hair Fall Serum, Shampoo aur Hair Oil – ek hi box mein.", "Complete care routine\nRs. 198 ki bachat", "Pehle oil lagayein, phir shampoo se dhoyein, aur akhir mein serum se finish karein.", { oldPrice: 4197, combo: true })
];
const DEF = { whatsapp: "923090611950", bank: "Bank: (apna bank likhein)\nAccount Title: \nAccount No / IBAN: \nTransfer ke baad screenshot WhatsApp par bhejein.", policy: "7-day return aur exchange window.\nUnused aur unopened products return ke qabil hain.\nDamaged products ka replacement milega.\nGalat product par free exchange.\nDamaged ya galat parcel ki ittila parcel milne ke 48 ghante ke andar dena lazmi hai.\nKhuli hui personal-care products aam tor par non-returnable hain, siwaye verified quality ya delivery issue ke.", coupons: "WELCOME:5" };
const get = async (k, d) => (await db().get(k, { type: "json" })) ?? d;
const put = (k, v) => db().setJSON(k, v);
const authed = r => { const [e, s] = (r.headers.get("authorization") || "").replace("Bearer ", "").split("."); return PW() && s && s === sign(e) && +e > Date.now(); };
const pct = async c => { const l = (await get("settings", DEF)).coupons || ""; const m = l.split("\n").map(x => x.split(":")).find(x => x[0].trim().toUpperCase() === String(c || "").trim().toUpperCase()); return m ? Math.min(+m[1] || 0, 90) : 0; };
const clean = (s, n = 300) => String(s || "").slice(0, n);

export default async req => {
  const p = new URL(req.url).pathname.replace(/^\/api\//, ""), m = req.method;
  const b = m === "GET" ? {} : await req.json().catch(() => ({}));
  if (p === "public") { const s = await get("settings", DEF); return J({ products: await get("products", SEED), settings: { whatsapp: s.whatsapp, bank: s.bank, policy: s.policy } }); }
  if (p === "coupon") return J({ percent: await pct(b.code) });
  if (p === "login") { if (PW() && b.password === PW()) { const e = Date.now() + 864e5 * 7; return J({ token: e + "." + sign(String(e)) }); } return J({ error: "Wrong password" }, 401); }
  if (p === "order" && m === "POST") {
    const prods = await get("products", SEED); let sub = 0; const items = [];
    for (const i of b.items || []) { const pr = prods.find(x => x.id === i.id), q = Math.max(1, Math.min(20, +i.qty | 0)); if (!pr) continue; if (pr.stock < q) return J({ error: pr.name + " ka stock kam hai" }, 400); items.push({ id: pr.id, name: pr.name, price: pr.price, qty: q }); sub += pr.price * q; pr.stock -= q; }
    const c = b.customer || {};
    if (!items.length || !c.name || !c.phone || !c.address || !c.city) return J({ error: "Zaroori fields poori karein" }, 400);
    const pc = await pct(b.coupon), disc = Math.round(sub * pc / 100);
    const id = "SH-" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
    const o = { id, date: new Date().toISOString(), items, subtotal: sub, discount: disc, coupon: pc ? clean(b.coupon, 20) : "", total: sub - disc, delivery: 0, payment: b.payment === "bank" ? "Bank Transfer" : "Cash on Delivery", status: "Pending", paid: false, courier: "", tracking: "", customer: { name: clean(c.name, 80), phone: clean(c.phone, 20), whatsapp: clean(c.whatsapp, 20), address: clean(c.address, 300), city: clean(c.city, 60), postal: clean(c.postal, 12), notes: clean(c.notes, 400) } };
    await put("order:" + id, o); await put("products", prods); return J({ order: o });
  }
  if (!authed(req)) return J({ error: "unauthorized" }, 401);
  if (p === "admin/orders" && m === "GET") { const { blobs } = await db().list({ prefix: "order:" }); const o = await Promise.all(blobs.map(x => get(x.key, null))); return J(o.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))); }
  if (p === "admin/order" && m === "PUT") { const o = await get("order:" + b.id, null); if (!o) return J({ error: "not found" }, 404); Object.assign(o, { status: b.status, courier: clean(b.courier, 40), tracking: clean(b.tracking, 60), paid: !!b.paid }); await put("order:" + b.id, o); return J(o); }
  if (p === "admin/products" && m === "PUT") { await put("products", b.products); return J({ ok: 1 }); }
  if (p === "admin/settings") { if (m === "GET") return J(await get("settings", DEF)); await put("settings", { ...DEF, ...b }); return J({ ok: 1 }); }
  return J({ error: "not found" }, 404);
};
export const config = { path: "/api/*" };
