# မြန်မာလုပ်ငန်းကူ AI (Myanmar Work AI) — MVP

ဆိုင်/ရုံးသုံး အသေးစားလုပ်ငန်းများအတွက် offline-first PWA။
HTML/CSS/Vanilla JS + IndexedDB ဖြင့် ဆောက်ထားပြီး Internet မလိုပဲ အသုံးပြုနိုင်ပါသည်။

## ဖွင့်နည်း (Run locally)

Browser တွေက `file://` ကနေ Service Worker + IndexedDB ကို ကန့်သတ်ထားလို့
local server တစ်ခုကနေ ဖွင့်ရပါမယ်:

```bash
cd myanmar-work-ai
python3 -m http.server 8080
# ဒါမှမဟုတ်
npx serve .
```

ပြီးရင် browser မှာ `http://localhost:8080` ဖွင့်ပါ။ Chrome/Edge ရဲ့
address bar က install icon (⊕) နှိပ်ပြီး "install" လုပ်ရင် ဖုန်း/ကွန်ပျူတာမှာ
app အနေနဲ့ တင်ထားနိုင်ပါတယ်။

## Folder Structure

```
myanmar-work-ai/
  index.html          — splash → dashboard.html သို့ redirect
  dashboard.html       — ပင်မစာမျက်နှာ (ဒေါ့ရှ်ဘုတ်)
  sales.html            — ရောင်းအားထည့်ခြင်း/မှတ်တမ်း/ဘောင်ချာ
  inventory.html        — ပစ္စည်းစာရင်း + stock in/out
  credit.html            — ရရန်/ပေးရန် အကြွေးစာရင်း
  reports.html            — နေ့/အပတ်/လ report + PDF/Excel export
  ai.html                  — AI chat + voice command
  css/style.css, responsive.css
  js/db.js       — IndexedDB wrapper (offline database)
  js/utils.js    — format helpers, toast, shared nav/topbar, theme
  js/app.js, sales.js, inventory.js, credit.js, reports.js, ai.js
  manifest.json, service-worker.js, icons/
```

## လုပ်ဆောင်ပြီးသား features (MVP)

- ရောင်းအားထည့်ခြင်း → stock အလိုအလျောက် နုတ်ယူခြင်း
- ပစ္စည်းစာရင်း CRUD + stock နည်းရင် သတိပေးခြင်း
- Customer/Supplier အကြွေး + partial ပေးချေမှတ်တမ်း
- နေ့/အပတ်/လ report + CSV (Excel) export + Print (PDF) export
- AI assistant — Myanmar rule-based command parser (ဥပမာ command
  ၄ ခုအတိုင်း အလုပ်လုပ်ပါသည်) + အသံဖြင့် ရိုက်ထည့်ခြင်း (Web Speech API,
  browser support ပေါ်မူတည်ပါသည်)
- Dark mode, installable PWA, IndexedDB offline storage

## နောက်ထပ် တိုးချဲ့နိုင်သည့် အဆင့်များ

1. **AI ပိုမိုစမတ်ကျအောင်** — လက်ရှိက keyword/regex-based parser ဖြစ်ပါသည်။
   ပိုပြီး ပြောင်းလွယ်ပြင်လွယ် language understanding လိုအပ်ရင် Claude API
   (claude-sonnet) ကို server-side proxy တစ်ခုတည်ဆောက်ပြီး ချိတ်ဆက်နိုင်ပါသည်
   (`ANTHROPIC_API_KEY` ကို client-side မှာ မထည့်ရပါ — proxy backend လိုအပ်ပါသည်)။
2. **Firebase sync** — `js/db.js` ရှိ `DB` object ကို interface အဖြစ်
   ထားပေးထားလို့၊ device အများနှင့် sync ချင်ရင် Firestore backend ထည့်ပြီး
   `DB.put/getAll` တွေကို Firestore calls တွေနဲ့ mirror လုပ်ပေးနိုင်ပါသည်.
3. **ယနေ့အသုံးစရိတ် (expense) tracking** — လက်ရှိ MVP က ဝယ်ဈေး (COGS) ကို
   ကုန်ကျစရိတ်အဖြစ် သုံးထားပါသည်။ ဆိုင်ငှားခ၊ လျှပ်စစ်ခ စသည့် expense
   အမျိုးအစားခွဲပြီး မှတ်ချင်ရင် `expenses` object store အသစ် ထည့်ရုံပါပဲ။
4. **Real PDF generation** — လက်ရှိက browser Print → Save as PDF ကို
   သုံးထားပါသည်။ Library-based PDF (jsPDF) ချိတ်ဆက်ရင် layout ပိုကောင်းအောင်
   customize လုပ်နိုင်ပါသည်။
5. **APK conversion** — Play Store အတွက် Trusted Web Activity (TWA) သို့မဟုတ်
   Capacitor ဖြင့် ဒီ PWA ကို APK ပြောင်းနိုင်ပါသည် (`manifest.json` +
   `service-worker.js` ရှိပြီးသားမို့ TWA-ready ဖြစ်ပါသည်)။
