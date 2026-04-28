const state = {
  items: [],
  filtered: [],
  activeId: null,
};
const ADMIN_STORAGE_KEY = "museum_items_override_v1";

const itemsList = document.getElementById("itemsList");
const detailsPanel = document.getElementById("detailsPanel");
const searchInput = document.getElementById("searchInput");
const generalClassificationFilter = document.getElementById("generalClassificationFilter");
const sourceRegionFilter = document.getElementById("sourceRegionFilter");
const timePeriodFilter = document.getElementById("timePeriodFilter");
const resultCount = document.getElementById("resultCount");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const BASE_GENERAL_CATEGORIES = [
  "الأسلحة",
  "العينات الصخرية الطبيعية",
  "المخطوطات",
  "الأدوات المنزلية الحجرية",
  "النقود والعملات",
  "الآلات الموسيقية",
  "الأدوات الخشبية والمعمارية",
  "أدوات إعداد القهوة",
  "النقوش العربية والرسوم الصخرية",
  "الأدوات المنزلية التراثية",
  "الملابس والمقتنيات التراثية",
  "الفخاريات",
  "أدوات الإتصال",
  "الحلي والمصوغات",
  "أدوات زراعية",
];
const BASE_SOURCE_REGIONS = [
  "الجزيرة العربية",
  "بلاد الشام",
  "مصر",
  "العراق",
  "اليمن",
  "شمال أفريقيا",
  "الأناضول",
  "أوروبا",
  "غير محدد",
];

function resolveAssetPath(assetPath = "") {
  if (!assetPath) return "";
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  return `./${assetPath.replace(/^\.?\/*/, "")}`;
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function filterItems(query) {
  const selectedGeneralClass = (generalClassificationFilter?.value || "").trim();
  const selectedSourceRegion = (sourceRegionFilter?.value || "").trim();
  const selectedTimePeriod = (timePeriodFilter?.value || "").trim();
  const q = query.trim().toLowerCase();
  return state.items.filter((item) => {
    const itemGeneralClasses = getItemGeneralClassifications(item)
      .map((gc) => normalizeTagValue(gc))
      .filter(Boolean);
    if (selectedGeneralClass && !itemGeneralClasses.includes(selectedGeneralClass)) {
      return false;
    }
    const itemSourceRegions = getItemSourceRegions(item).map((r) => normalizeTagValue(r));
    if (selectedSourceRegion && !itemSourceRegions.includes(selectedSourceRegion)) {
      return false;
    }
    const itemTimeBuckets = getItemTimeBuckets(item).map((x) => normalizeTagValue(x));
    if (selectedTimePeriod && !itemTimeBuckets.includes(selectedTimePeriod)) {
      return false;
    }
    if (!q) {
      return true;
    }
    const haystack = [
      item.title || "",
      item.description || "",
      ...Object.entries(item.fields || {}).flat(),
      ...Object.entries(item.xlsx || {}).flat(),
      ...(item.urls || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function normalizeArabicKey(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[•*]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeTagValue(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[•*]/g, "")
    .replace(/[.,،؛:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTags(textValue = "") {
  return String(textValue)
    .split(/[\/|,،;\n]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}


function getItemGeneralClassifications(item) {
  const values = [];
  const allEntries = [
    ...Object.entries(item.fields || {}),
    ...Object.entries(item.xlsx || {}),
  ];
  
  for (const [key, value] of allEntries) {
 
    const normalizedKey = normalizeArabicKey(key);
   
    // General-class filter must be sourced from "التصنيف" only.
    if (  normalizedKey.includes("تصنيف" ) 
    ) {
     
      const textValue = String(value || "").trim();
      if (textValue) values.push(...splitTags(textValue));
    }
  }
  return dedupeLabelsByNormalized([...values, ...inferGeneralClassificationsByRules(item)]);
}


function inferGeneralClassificationsByRules(item) {
  // console.log("inferGeneralClassificationsByRules");
  // GeneralClass rules should map from "التصنيف" content specifically.
  const classificationText = getRawGeneralClassificationText(item);
  // console.log("classificationText", classificationText);
  const haystack = normalizeTagValue(classificationText);
  if (!haystack) return [];
  const rules = [
    { label: "الفخاريات", keys: ["فخار", "خزف", "فخ"] },
    { label: "أدوات إعداد القهوة", keys: ["قهوة"] },
    { label: "النقود والعملات", keys: ["عملة", "عملات", "نقد", "دينار", "درهم", "ريال"] },
    { label: "النقوش العربية والرسوم الصخرية", keys: ["منقوش", "نقش", "نقوش", "نقشية", "كتابة حجرية"] },
    { label: "المخطوطات", keys: ["مخطوط", "مخطوطات", "وثيقة", "صحيفة", "جريدة"] },
    { label: "الملابس والمقتنيات التراثية", keys: ["ملبوس", "ملابس", "ثوب", "عباءة", "عمامة", "لباس"] },
    { label: "الأدوات المنزلية التراثية", keys: ["أدوات منزلية", "منزل", "هاون", "مهراس", "جرن", "رحى", "طهي"] },
    { label: "الأدوات المنزلية الحجرية", keys: ["أدوات حجرية منزلية"] },
    { label: "الحلي والمصوغات", keys: ["زينة", "حلي", "قلادة", "خاتم", "سوار", "تزيين"] },
    { label: "الأسلحة", keys: ["سلاح", "أسلحة"] },
    { label: "أدوات الإتصال", keys: ["اتصال", "جهاز",] },
    { label: "أدوات زراعية", keys: ["زرع"] },
    { label: "الأدوات الخشبية والمعمارية", keys: [ "معمار"] },
    { label: "الآلات الموسيقية", keys: [ "موسيق", "يقاع"] },
  ];
  const matched = [];
  for (const rule of rules) {
    if (rule.keys.some((k) => haystack.includes(normalizeTagValue(k)))) {
      matched.push(rule.label);
    }
  }
  return dedupeLabelsByNormalized(matched);
}

function getRawGeneralClassificationText(item) {
  const values = [];
  const allEntries = [
    ...Object.entries(item.fields || {}),
    ...Object.entries(item.xlsx || {}),
  ];
  for (const [key, value] of allEntries) {
    const normalizedKey = normalizeArabicKey(key);
    if (normalizedKey.includes("تصنيف") ) {
      const textValue = String(value || "").trim();
      if (textValue) values.push(textValue);
    }
  }
  return values.join(" ");
}

function dedupeLabelsByNormalized(labels = []) {
  const unique = new Map();
  for (const label of labels) {
    const raw = String(label || "").trim();
    if (!raw) continue;
    const normalized = normalizeTagValue(raw);
    if (!normalized) continue;
    if (!unique.has(normalized)) {
      unique.set(normalized, raw);
    }
  }
  return [...unique.values()];
}

function getTimePeriod(item) {
  const allEntries = [
    ...Object.entries(item.fields || {}),
    ...Object.entries(item.xlsx || {}),
  ];
  for (const [key, value] of allEntries) {
    const normalizedKey = normalizeArabicKey(key);
    if (normalizedKey.includes("فترة") ) {
      const textValue = String(value || "").trim();
      if (textValue) return textValue;
    }
  }
  return "";
}

function getItemTimeBuckets(item) {
  const value = getTimePeriod(item);
  const normalized = normalizeTagValue(value);
  if (!normalized) return ["غير ذلك"];

  const buckets = [];
  const asCenturyLabel = (n, era) => `القرن ${n} ${era}`.trim();

  // Direct numeric century mentions: "القرن 14" or "القرن ١٤".
  const directNumericCenturies = value.match(/القرن\s+([0-9٠-٩]{1,2})/g) || [];
  const indicToWestern = (text) =>
    text.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
  const hasHijriHint = /هجري|هـ/.test(value);
  const hasGregorianHint = /ميلادي|م\b/.test(value);
  const pickEra = () => {
    if (hasHijriHint && !hasGregorianHint) return "الهجري";
    if (!hasHijriHint && hasGregorianHint) return "الميلادي";
    // Default for ambiguous direct-century text.
    return "الميلادي";
  };
  for (const m of directNumericCenturies) {
    const rawNum = (m.match(/([0-9٠-٩]{1,2})/) || [])[1];
    if (!rawNum) continue;
    const c = Number(indicToWestern(rawNum));
    if (Number.isFinite(c) && c > 0) buckets.push(asCenturyLabel(c, pickEra()));
  }

  // Numeric years (e.g. 1956) -> century label.
  const westernYears = value.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || [];
  for (const y of westernYears) {
    const year = Number(y);
    if (!Number.isFinite(year) || year <= 0) continue;
    const century = Math.floor((year - 1) / 100) + 1;
    buckets.push(asCenturyLabel(century, "الميلادي"));
  }

  // Arabic-Indic years (e.g. ١٣٦٩) -> century label.
  const indicYears = value.match(/[٠-٩]{3,4}/g) || [];
  for (const iy of indicYears) {
    const western = indicToWestern(iy);
    const year = Number(western);
    if (!Number.isFinite(year) || year <= 0) continue;
    const century = Math.floor((year - 1) / 100) + 1;
    const era = hasHijriHint ? "الهجري" : "الميلادي";
    buckets.push(asCenturyLabel(century, era));
  }

  const unique = [...new Set(buckets.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean))];
  return unique.length ? unique : ["غير ذلك"];
}

function getGeneralClassificationFromTags(tags) {
  return getGeneralClassificationsFromTags(tags)[0] || "";
}

function getGeneralClassificationsFromTags(tags) {
  const output = [];
  for (const tag of tags || []) {
    const base = String(tag)
      .split(/[\/|\\-]/)[0]
      .replace(/[.,،؛:()"]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!base) continue;
    const words = base.split(" ").filter(Boolean);
    if (!words.length) continue;
    // General category should be compact: one or two words max.
    const shortForm = words.slice(0, 2).join(" ");
    if (shortForm) output.push(shortForm);
  }
  return [...new Set(output)];
}

function getCategorySearchText(item, options = {}) {
  const includeFunctionalTags = options.includeFunctionalTags !== false;
  const parts = [
    item.title || "",
    item.description || "",
    ...Object.entries(item.fields || {}).flat().map((x) => String(x || "")),
    ...Object.entries(item.xlsx || {}).flat().map((x) => String(x || "")),
  ];
  
  return normalizeTagValue(parts.join(" "));
}
function getItemSourceRegions(item) {
  const haystack = getCategorySearchText(item);
  const rules = [
    { label: "الجزيرة العربية", keys: ["الجزيرة العربية", "السعودية", "الحجاز", "نجد", "المدينة المنورة", "مكة", "الخليج"] },
    { label: "بلاد الشام", keys: ["بلاد الشام", "الشام", "سوريا", "دمشق", "فلسطين", "الأردن", "لبنان"] },
    { label: "مصر", keys: ["مصر", "القاهرة", "الإسكندرية", "النيل"] },
    { label: "العراق", keys: ["العراق", "بغداد", "البصرة", "الموصل"] },
    { label: "اليمن", keys: ["اليمن", "صنعاء", "عدن", "حضرموت"] },
    { label: "شمال أفريقيا", keys: ["المغرب", "الجزائر", "تونس", "ليبيا", "شمال أفريقيا"] },
    { label: "الأناضول", keys: ["الأناضول", "تركيا", "العثماني"] },
    { label: "أوروبا", keys: ["أوروبا", "بريطانيا", "فرنسا", "ألمانيا", "إيطاليا"] },
  ];
  const matched = [];
  for (const rule of rules) {
    if (rule.keys.some((k) => haystack.includes(normalizeTagValue(k)))) {
      matched.push(rule.label);
    }
  }
  if (!matched.length) {
    matched.push("غير محدد");
  }
  return matched;
}

function populateGeneralClassificationFilter() {
  generalClassificationFilter.innerHTML =
    `<option value="">الكل</option>` +
    BASE_GENERAL_CATEGORIES
      .map((label) => `<option value="${escapeHtml(normalizeTagValue(label))}">${escapeHtml(label)}</option>`)
      .join("");
}

function populateSourceRegionFilter() {
  sourceRegionFilter.innerHTML =
    `<option value="">الكل</option>` +
    BASE_SOURCE_REGIONS.map(
      (label) => `<option value="${escapeHtml(normalizeTagValue(label))}">${escapeHtml(label)}</option>`
    ).join("");
}

function applyFilters() {
  state.filtered = filterItems(searchInput.value);
  state.activeId = state.filtered[0]?.id || null;
  renderList();
  renderDetails();
}

function resetAllFilters() {
  searchInput.value = "";
  generalClassificationFilter.value = "";
  sourceRegionFilter.value = "";
  timePeriodFilter.value = "";
  applyFilters();
}

function populateTimePeriodFilter() {
  const periods = new Map();
  for (const item of state.items) {
    const buckets = getItemTimeBuckets(item);
    for (const bucket of buckets) {
      const normalized = normalizeTagValue(bucket);
      if (!normalized) continue;
      if (!periods.has(normalized)) {
        periods.set(normalized, bucket.trim());
      }
    }
  }

  const sorted = [...periods.entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  timePeriodFilter.innerHTML =
    `<option value="">الكل</option>` +
    sorted
      .map(([normalized, label]) => `<option value="${escapeHtml(normalized)}">${escapeHtml(label)}</option>`)
      .join("");
}

function renderList() {
  if (!state.filtered.length) {
    itemsList.innerHTML =
      "<li class='p-4 text-sm font-medium text-slate-500'>لا توجد نتائج مطابقة للفلاتر الحالية.</li>";
    resultCount.textContent = "0 نتيجة";
    detailsPanel.innerHTML = "<p class='text-slate-500'>لا توجد عناصر مطابقة للبحث.</p>";
    return;
  }

  resultCount.textContent = `${state.filtered.length} نتيجة`;
  itemsList.innerHTML = state.filtered
    .map((item) => {
      const thumb = resolveAssetPath(item.primaryImage);
      const activeClass =
        item.id === state.activeId
          ? "bg-gradient-to-r from-fuchsia-50 to-indigo-50 border-fuchsia-200 shadow-sm"
          : "bg-white border-transparent hover:bg-fuchsia-50/40";
      return `
        <li class="cursor-pointer border-b border-fuchsia-100 p-2.5 sm:p-3 transition ${activeClass}" data-item-id="${escapeHtml(item.id)}">
          ${
            thumb
              ? `<img class="mb-2 h-24 sm:h-28 w-full rounded-xl sm:rounded-2xl border border-fuchsia-200 object-cover shadow-sm" src="${escapeHtml(thumb)}" alt="${escapeHtml(item.title)}" />`
              : `<div class="mb-2 h-24 sm:h-28 w-full rounded-xl sm:rounded-2xl border border-dashed border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50"></div>`
          }
          <div>
            
            <a class="mt-2 inline-block text-xs font-bold text-indigo-600 underline decoration-indigo-300 underline-offset-4 hover:text-fuchsia-600" href="./item.html?id=${encodeURIComponent(item.id)}">
            <h3 class="text-sm font-extrabold leading-5 sm:leading-6 text-slate-800">${escapeHtml(item.title || "بدون عنوان")}</h3>
            </a>
          </div>
        </li>
      `;
    })
    .join("");

  for (const li of itemsList.querySelectorAll("li[data-item-id]")) {
    li.addEventListener("click", () => {
      state.activeId = li.getAttribute("data-item-id");
      renderList();
      renderDetails();
    });
  }
}

async function loadItems() {
  const overrideRaw = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (overrideRaw) {
    try {
      const overridePayload = JSON.parse(overrideRaw);
      if (overridePayload && Array.isArray(overridePayload.items)) {
        return overridePayload.items;
      }
    } catch (error) {
      console.warn("Invalid admin override data in localStorage.", error);
    }
  }

  if (window.__MUSEUM_DB__ && Array.isArray(window.__MUSEUM_DB__.items)) {
    return window.__MUSEUM_DB__.items;
  }

  const response = await fetch("./db/items.json");
  if (!response.ok) {
    throw new Error("Unable to load database JSON.");
  }
  const payload = await response.json();
  return payload.items || [];
}

function renderRows(fieldsObj = {}) {
  const rows = Object.entries(fieldsObj).filter(([key]) => {
    const normalizedKey = String(key).toLowerCase();
    return (
      normalizedKey !== "url" &&
      !normalizedKey.includes("http") &&
      !normalizedKey.includes("رابط")
    );
  });

  if (!rows.length) return "";
  return rows
    .map(
      ([key, value]) => `
      <div class="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-fuchsia-50 p-3 text-wrap">
        <div class="mb-1 text-xs font-extrabold text-indigo-700 text-wrap">${escapeHtml(String(key))}</div>
        <div class="text-sm leading-6 text-slate-600 text-wrap text-pretty">${escapeHtml(String(value))}</div>
      </div>
    `
    )
    .join("");
}

function renderDetails() {
  const item = state.filtered.find((x) => x.id === state.activeId) || state.filtered[0];
  if (!item) {
    detailsPanel.innerHTML = "<p class='text-slate-500'>اختر قطعة من القائمة لعرض التفاصيل.</p>";
    return;
  }
  state.activeId = item.id;

  const mainImage = resolveAssetPath(item.primaryImage);
  const qrImage = resolveAssetPath(item.qr);
  const urls = item.urls || [];

  const description = item.description
    ? `<pre class="whitespace-pre-wrap rounded-xl sm:rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-3 sm:p-4 text-sm leading-6 sm:leading-7 text-slate-700">${escapeHtml(item.description)}</pre>`
    : "<p class='text-sm text-slate-500'>لا يوجد وصف متاح.</p>";

  detailsPanel.innerHTML = `
    
    <div class="mb-3">
      <a class="" href="./item.html?id=${encodeURIComponent(item.id)}">
      <h2 class="mb-3 sm:mb-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 bg-clip-text text-xl sm:text-2xl font-extrabold leading-8 sm:leading-10 text-transparent">${escapeHtml(item.name || item.title || "بدون عنوان")}</h2>
      </a>
    </div>
    ${mainImage ? `<img class="mb-3 sm:mb-4 max-h-[300px] sm:max-h-[420px] w-full rounded-2xl sm:rounded-3xl border border-fuchsia-200 object-contain bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-2 shadow-sm" src="${escapeHtml(mainImage)}" alt="${escapeHtml(item.title)}" />` : ""}

    <h3 class="mb-2 text-lg font-extrabold text-fuchsia-700">الوصف</h3>
    ${description}

    ${
      Object.keys(item.fields || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-extrabold text-indigo-700">معلومات إضافية</h3><div class="grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2">${renderRows(item.fields)}</div>`
        : ""
    }

    ${
      Object.keys(item.xlsx || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-extrabold text-cyan-700">بيانات من ملف Excel</h3><div class="grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2">${renderRows(item.xlsx)}</div>`
        : ""
    }

    <div class="mt-5">
      <h3 class="mb-2 text-lg font-extrabold text-emerald-700">الروابط</h3>
      ${
        urls.length
          ? urls
              .map(
                (url) =>
                  `<p class="mb-2"><a class="break-all text-sm font-bold text-indigo-600 underline decoration-indigo-300 underline-offset-4 hover:text-fuchsia-600" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>`
              )
              .join("")
          : "<p class='text-sm text-slate-500'>لا توجد روابط.</p>"
      }
      ${
        qrImage
          ? `<div class="mt-4 inline-block rounded-xl sm:rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-2.5 sm:p-3 shadow-sm">
               <p class="mb-2 text-xs font-bold text-emerald-700">QR</p>
               <img class="h-32 w-32 sm:h-40 sm:w-40 rounded-lg" src="${escapeHtml(qrImage)}" alt="QR ${escapeHtml(item.title)}" />
             </div>`
          : ""
      }
    </div>
  `;
}

async function init() {
  state.items = await loadItems();
  populateGeneralClassificationFilter();
  populateSourceRegionFilter();
  populateTimePeriodFilter();
  state.filtered = [...state.items];
  state.activeId = state.filtered[0]?.id || null;

  renderList();
  renderDetails();

  searchInput.addEventListener("input", applyFilters);
  generalClassificationFilter.addEventListener("change", applyFilters);
  sourceRegionFilter.addEventListener("change", applyFilters);
  timePeriodFilter.addEventListener("change", applyFilters);
  resetFiltersBtn.addEventListener("click", resetAllFilters);
}

init().catch((error) => {
  console.error(error);
  detailsPanel.innerHTML =
    "<p class='text-sm text-red-600'>فشل تحميل البيانات. نفّذ أمر الاستخراج أولاً ثم أعد تحميل الصفحة.</p>";
});
