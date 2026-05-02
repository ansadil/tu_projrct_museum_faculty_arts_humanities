const state = {
  items: [],
  filtered: [],
  activeId: null,
};
const ADMIN_STORAGE_KEY = "museum_items_override_v1";

const itemsList = document.getElementById("itemsList");
const detailsPanel = document.getElementById("detailsPanel");
const browseSection = document.getElementById("browseSection");
const itemsPane = document.getElementById("itemsPane");
const searchInput = document.getElementById("searchInput");
const generalClassificationFilter = document.getElementById("generalClassificationFilter");
const sourceRegionFilter = document.getElementById("sourceRegionFilter");
const timePeriodFilter = document.getElementById("timePeriodFilter");
const resultCount = document.getElementById("resultCount");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const filtersPanel = document.getElementById("filtersPanel");
const mobileFiltersOpenBtn = document.getElementById("mobileFiltersOpenBtn");
const mobileFiltersCloseBtn = document.getElementById("mobileFiltersCloseBtn");
const mobileFiltersBackdrop = document.getElementById("mobileFiltersBackdrop");

const DETAIL_ZOOM_MIN = 1;
const DETAIL_ZOOM_MAX = 3;
const DETAIL_ZOOM_STEP = 0.25;
let detailsImageZoomAbort = null;

function teardownDetailsImageZoom() {
  if (detailsImageZoomAbort) {
    detailsImageZoomAbort.abort();
    detailsImageZoomAbort = null;
  }
}

const BASE_GENERAL_CATEGORIES = [
  "الأسلحة",
  "الملابس والمقتنيات التراثية",
  "الأدوات الخشبية والمعمارية",
  "الآلات الموسيقية",
  "الأدوات المنزلية التراثية",
  "أدوات الإتصال",
  "الأدوات المنزلية الحجرية",
  "النقوش العربية والرسوم الصخرية",
  "الفخاريات",
  "العينات الصخرية الطبيعية",
  "أدوات زراعية",
  "أدوات إعداد القهوة",
  "الحلي والمصوغات",
  "النقود والعملات",
  "المخطوطات",

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
    if (  normalizedKey.includes("تسجيل") || normalizedKey.includes("تصنيف")
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
    { label: "الفخاريات", keys: ["فخار", "خزف", "فخ","TU-MUS-26-PO"] },
    { label: "العينات الصخرية الطبيعية", keys: ["عينة", "صخور ", "أحجار",,"TU-MUS-26-NR"] },
    { label: "أدوات إعداد القهوة", keys: ["قهوة","TU-MUS-26-SC"] },
    { label: "النقود والعملات", keys: ["عملة", "عملات", "نقد", "دينار", "درهم", "ريال","TU-MUS-26-MC"] },
    { label: "النقوش العربية والرسوم الصخرية", keys: ["منقوش", "نقش", "نقوش", "نقشية", "كتابة حجرية","TU-MUS-26-IN"] },
    { label: "المخطوطات", keys: ["مخطوط", "مخطوطات", "وثيقة", "صحيفة", "جريدة",'TU-MUS-26-MA'] },
    { label: "الملابس والمقتنيات التراثية", keys: ["ملبوس", "ملابس", "ثوب", "عباءة", "عمامة", "لباس","TU-MUS-26-CL"] },
    { label: "الأدوات المنزلية التراثية", keys: ["أدوات منزلية", "منزل", "هاون", "مهراس", "جرن", "رحى", "طهي","TU-MUS-26-ST"] },
    { label: "الأدوات المنزلية الحجرية", keys: ["أدوات حجرية منزلية","TU-MUS-26-ST"] },
    { label: "الحلي والمصوغات", keys: ["زينة", "حلي", "قلادة", "خاتم", "سوار", "تزيين","TU-MUS-26-JE"] },
    { label: "الأسلحة", keys: ["سلاح", "أسلحة", "ولاعة","بنادق","ذخيرة",'حرب',"عسكر",'TU-MUS-26-WE'] },
    { label: "أدوات الإتصال", keys: ["اتصال", "جهاز","TU-MUS-26-TE"] },
    { label: "أدوات زراعية", keys: ["زرع","TU-MUS-26-AG"] },
    { label: "الأدوات الخشبية والمعمارية", keys: [ "TU-MUS-26-WO"] },
    { label: "الآلات الموسيقية", keys: [ "موسيق", "يقاع","TU-MUS-26-MU"] },
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
    if (normalizedKey.includes("تسجيل") || normalizedKey.includes("تصنيف") ) {
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

function readItemIdFromSearch() {
  return new URLSearchParams(window.location.search).get("id");
}

function updateBrowseLayout() {
  const detailOpen = state.activeId != null;
  const isSmallScreen = window.matchMedia("(max-width: 639px)").matches;
  if (browseSection) {
    browseSection.classList.toggle("xl:grid-cols-1", !detailOpen);
    browseSection.classList.toggle("xl:grid-cols-[minmax(380px,28vw)_minmax(0,1fr)]", detailOpen);
  }
  if (itemsPane) {
    // On small screens, show either list or details (not both) after selecting an item.
    itemsPane.classList.toggle("hidden", detailOpen && isSmallScreen);
  }
  if (detailsPanel) {
    detailsPanel.classList.toggle("hidden", !detailOpen);
  }
  // Items grid: 4/3/2/1 when browsing only; 3/2/1 when a detail is open (narrower sidebar).
  if (itemsList) {
    itemsList.classList.toggle("xl:grid-cols-4", !detailOpen);
  }
}

function writeItemIdToUrl(id, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (id != null && id !== "") {
    url.searchParams.set("id", String(id));
  } else {
    url.searchParams.delete("id");
  }
  const method = replace ? "replaceState" : "pushState";
  history[method]({ itemId: id != null ? String(id) : "" }, "", url);
}

function setupMobileFiltersDrawer() {
  if (!filtersPanel || !mobileFiltersOpenBtn || !mobileFiltersBackdrop) return;

  const setOpenState = (isOpen) => {
    filtersPanel.classList.toggle("translate-x-full", !isOpen);
    filtersPanel.classList.toggle("translate-x-0", isOpen);
    mobileFiltersBackdrop.classList.toggle("hidden", !isOpen);
    document.body.classList.toggle("overflow-hidden", isOpen);
    mobileFiltersOpenBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  const closeDrawer = () => setOpenState(false);
  const openDrawer = () => setOpenState(true);

  mobileFiltersOpenBtn.addEventListener("click", openDrawer);
  mobileFiltersBackdrop.addEventListener("click", closeDrawer);
  if (mobileFiltersCloseBtn) {
    mobileFiltersCloseBtn.addEventListener("click", closeDrawer);
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 640) closeDrawer();
  });
}

function applyFilters() {
  state.filtered = filterItems(searchInput.value);
  const stillActive =
    state.activeId != null &&
    state.filtered.some((x) => String(x.id) === String(state.activeId));
  if (!stillActive) {
    state.activeId = null;
    writeItemIdToUrl(null, { replace: true });
  }
  renderList({ preserveScroll: false });
  renderDetails();
}

/** After detail panel + grid reflow, re-apply list scroll (see renderList preserveScroll). */
function restoreItemsListScrollAfterLayout() {
  if (!itemsList || itemsList.dataset.pendingScroll == null) return;
  const y = Number(itemsList.dataset.pendingScroll);
  delete itemsList.dataset.pendingScroll;
  const apply = () => {
    if (itemsList) itemsList.scrollTop = y;
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

function setActiveItem(id, { replaceHistory = false } = {}) {
  if (String(state.activeId) === String(id)) return;
  state.activeId = id;
  writeItemIdToUrl(id, { replace: replaceHistory });
  renderList({ preserveScroll: true });
  renderDetails();
  restoreItemsListScrollAfterLayout();
}

function resetAllFilters() {
  searchInput.value = "";
  generalClassificationFilter.value = "";
  sourceRegionFilter.value = "";
  timePeriodFilter.value = "";
  state.activeId = null;
  writeItemIdToUrl(null, { replace: true });
  applyFilters();
}

function shouldShowCategoryOverview() {
  if (state.activeId != null) return false;
  if (searchInput.value.trim()) return false;
  if ((generalClassificationFilter?.value || "").trim()) return false;
  if ((sourceRegionFilter?.value || "").trim()) return false;
  if ((timePeriodFilter?.value || "").trim()) return false;
  return true;
}

function getFirstItemsForGeneralCategory(categoryLabel, limit = 4) {
  const target = normalizeTagValue(categoryLabel);
  if (!target) return [];
  const out = [];
  for (const item of state.items) {
    const classes = getItemGeneralClassifications(item).map((c) => normalizeTagValue(c));
    if (classes.includes(target)) {
      out.push(item);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function countItemsForGeneralCategory(categoryLabel) {
  const target = normalizeTagValue(categoryLabel);
  if (!target) return 0;
  let n = 0;
  for (const item of state.items) {
    const classes = getItemGeneralClassifications(item).map((c) => normalizeTagValue(c));
    if (classes.includes(target)) n += 1;
  }
  return n;
}

function renderCategoryOverviewList() {
  resultCount.textContent = `${BASE_GENERAL_CATEGORIES.length} تصنيف`;
  itemsList.innerHTML = BASE_GENERAL_CATEGORIES.map((cat) => {
    const count = countItemsForGeneralCategory(cat);
    const previewItems = getFirstItemsForGeneralCategory(cat, 4);
    const filterVal = normalizeTagValue(cat);
    const activeClass = "border-violet-200 bg-white hover:bg-violet-200/90";
    const fourCells = [0, 1, 2, 3]
      .map((i) => {
        const piece = previewItems[i];
        if (!piece) {
          return `<div class="aspect-square w-full rounded-md border border-dashed border-violet-200/70 bg-violet-50/60"></div>`;
        }
        const thumb = resolveAssetPath(piece.primaryImage);
        if (thumb) {
          return `<img class="aspect-square h-full w-full rounded-md border border-fuchsia-200/90 object-cover shadow-sm" src="${escapeHtml(thumb)}" alt="" draggable="false" />`;
        }
        return `<div class="aspect-square w-full rounded-md border border-dashed border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50"></div>`;
      })
      .join("");
    return `
        <li class="flex min-w-0 cursor-pointer select-none flex-col rounded-xl border p-2 transition ${activeClass}" data-category-filter="${escapeHtml(filterVal)}">
          <div class="mb-1.5 mt-3 mb-3 text-center text-lg font-extrabold leading-tight text-violet-800">${escapeHtml(cat)} (${count})</div>
          <div class="grid w-full grid-cols-2 gap-1.5">${fourCells}</div>
        </li>
      `;
  }).join("");

  for (const li of itemsList.querySelectorAll("li[data-category-filter]")) {
    li.addEventListener("click", () => {
      generalClassificationFilter.value = li.getAttribute("data-category-filter") || "";
      applyFilters();
    });
  }
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

function renderList(options = {}) {
  const preserveScroll = options.preserveScroll === true;
  const showCategoryOverview = shouldShowCategoryOverview();
  const scrollBefore =
    preserveScroll && itemsList && !showCategoryOverview && state.filtered.length
      ? itemsList.scrollTop
      : null;

  if (showCategoryOverview) {
    renderCategoryOverviewList();
    return;
  }

  if (!state.filtered.length) {
    itemsList.innerHTML =
      "<li class='col-span-full p-4 text-sm font-medium text-slate-500'>لا توجد نتائج مطابقة للفلاتر الحالية.</li>";
    resultCount.textContent = "0 نتيجة";
    const fallbackItem =
      state.activeId != null ? state.items.find((x) => String(x.id) === String(state.activeId)) : null;
    if (fallbackItem) {
      renderDetails();
    } else {
      detailsPanel.innerHTML = "";
      updateBrowseLayout();
    }
    return;
  }

  resultCount.textContent = `${state.filtered.length} نتيجة`;
  itemsList.innerHTML = state.filtered
    .map((item) => {
      const thumb = resolveAssetPath(item.primaryImage);
      const activeClass =
        String(item.id) === String(state.activeId)
          ? "bg-gradient-to-r from-fuchsia-50 to-indigo-50 border-fuchsia-200 shadow-sm"
          : "bg-white border-transparent hover:bg-fuchsia-50/40";
      return `
        <li class="flex min-w-0 cursor-pointer select-none flex-col rounded-xl border border-fuchsia-100 p-2 transition ${activeClass}" data-item-id="${escapeHtml(item.id)}">
          ${
            thumb
              ? `<img class="mb-1.5 aspect-square h-auto w-full rounded-lg border border-fuchsia-200 object-cover shadow-sm" src="${escapeHtml(thumb)}" alt="${escapeHtml(item.title)}" draggable="false" />`
              : `<div class="mb-1.5 aspect-square w-full rounded-lg border border-dashed border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50"></div>`
          }
          <div class="min-w-0">
            <h3 class="line-clamp-2 text-[11px] font-extrabold leading-snug text-slate-800 sm:text-xs">${escapeHtml(item.title || "بدون عنوان")}</h3>
          </div>
        </li>
      `;
    })
    .join("");

  for (const li of itemsList.querySelectorAll("li[data-item-id]")) {
    li.addEventListener("click", () => {
      setActiveItem(li.getAttribute("data-item-id"), { replaceHistory: false });
    });
  }

  if (scrollBefore !== null && itemsList) {
    itemsList.dataset.pendingScroll = String(scrollBefore);
    itemsList.scrollTop = scrollBefore;
    requestAnimationFrame(() => {
      if (itemsList) itemsList.scrollTop = scrollBefore;
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

function clampDetailZoom(value) {
  return Math.min(DETAIL_ZOOM_MAX, Math.max(DETAIL_ZOOM_MIN, value));
}

function setupDetailsImageZoom() {
  detailsImageZoomAbort = new AbortController();
  const { signal } = detailsImageZoomAbort;

  const zoomableImage = document.getElementById("detailMainImage");
  if (!zoomableImage) return;

  const zoomInButton = document.getElementById("detailZoomInButton");
  const zoomOutButton = document.getElementById("detailZoomOutButton");
  const zoomResetButton = document.getElementById("detailZoomResetButton");
  const zoomLabel = document.getElementById("detailZoomLevelLabel");

  if (!zoomInButton || !zoomOutButton || !zoomResetButton || !zoomLabel) return;

  zoomableImage.style.willChange = "transform";

  let currentZoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  /** When set, pointer events for this id are handling zoom-pan (avoids window-level touchmove). */
  let activePanPointerId = null;

  const releasePanPointer = () => {
    if (activePanPointerId == null) return;
    try {
      zoomableImage.releasePointerCapture(activePanPointerId);
    } catch (_) {
      /* already released */
    }
    activePanPointerId = null;
  };

  const updateTransform = () => {
    zoomableImage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${currentZoom})`;
    zoomableImage.style.transformOrigin = "center center";
  };

  const setPanMode = () => {
    if (currentZoom > DETAIL_ZOOM_MIN) {
      zoomableImage.classList.add("cursor-grab");
      zoomableImage.classList.remove("cursor-default");
      // Own panning when zoomed; block native touch-scroll on the image.
      zoomableImage.classList.remove("touch-pan-y");
      zoomableImage.classList.add("touch-none");
    } else {
      zoomableImage.classList.remove("cursor-grab", "cursor-grabbing");
      zoomableImage.classList.add("cursor-default");
      // Let vertical scroll pass through to #detailsPanel (touch-none blocks ancestor scroll).
      zoomableImage.classList.remove("touch-none");
      zoomableImage.classList.add("touch-pan-y");
    }
  };

  const applyZoom = (nextZoom) => {
    currentZoom = clampDetailZoom(nextZoom);
    if (currentZoom <= DETAIL_ZOOM_MIN) {
      offsetX = 0;
      offsetY = 0;
      isDragging = false;
      releasePanPointer();
    }
    updateTransform();
    setPanMode();
    zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
    zoomOutButton.disabled = currentZoom <= DETAIL_ZOOM_MIN;
    zoomInButton.disabled = currentZoom >= DETAIL_ZOOM_MAX;
    zoomOutButton.classList.toggle("opacity-50", zoomOutButton.disabled);
    zoomOutButton.classList.toggle("cursor-not-allowed", zoomOutButton.disabled);
    zoomInButton.classList.toggle("opacity-50", zoomInButton.disabled);
    zoomInButton.classList.toggle("cursor-not-allowed", zoomInButton.disabled);
  };

  zoomInButton.addEventListener("click", () => applyZoom(currentZoom + DETAIL_ZOOM_STEP), { signal });
  zoomOutButton.addEventListener("click", () => applyZoom(currentZoom - DETAIL_ZOOM_STEP), { signal });
  zoomResetButton.addEventListener("click", () => applyZoom(1), { signal });

  const startDrag = (clientX, clientY) => {
    if (currentZoom <= DETAIL_ZOOM_MIN) return;
    isDragging = true;
    dragStartX = clientX - offsetX;
    dragStartY = clientY - offsetY;
    zoomableImage.classList.remove("cursor-grab");
    zoomableImage.classList.add("cursor-grabbing");
  };

  const dragMove = (clientX, clientY) => {
    if (!isDragging) return;
    offsetX = clientX - dragStartX;
    offsetY = clientY - dragStartY;
    updateTransform();
  };

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    zoomableImage.classList.remove("cursor-grabbing");
    if (currentZoom > DETAIL_ZOOM_MIN) {
      zoomableImage.classList.add("cursor-grab");
    }
  };

  zoomableImage.draggable = false;

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (currentZoom <= DETAIL_ZOOM_MIN) return;
    event.preventDefault();
    try {
      zoomableImage.setPointerCapture(event.pointerId);
    } catch (_) {
      /* setPointerCapture unsupported or failed */
    }
    activePanPointerId = event.pointerId;
    startDrag(event.clientX, event.clientY);
  };

  const onPointerMove = (event) => {
    if (activePanPointerId != null && event.pointerId !== activePanPointerId) return;
    if (!isDragging) return;
    event.preventDefault();
    dragMove(event.clientX, event.clientY);
  };

  const onPointerUp = (event) => {
    if (activePanPointerId != null && event.pointerId !== activePanPointerId) return;
    releasePanPointer();
    endDrag();
  };

  zoomableImage.addEventListener("pointerdown", onPointerDown, { signal });
  zoomableImage.addEventListener("pointermove", onPointerMove, { passive: false, signal });
  zoomableImage.addEventListener("pointerup", onPointerUp, { signal });
  zoomableImage.addEventListener("pointercancel", onPointerUp, { signal });
  zoomableImage.addEventListener("lostpointercapture", () => {
    activePanPointerId = null;
    endDrag();
  }, { signal });

  applyZoom(1);
}

function renderDetails() {
  teardownDetailsImageZoom();
  if (state.activeId == null) {
    detailsPanel.innerHTML = "";
    updateBrowseLayout();
    return;
  }
  const fromFiltered = state.filtered.find((x) => String(x.id) === String(state.activeId));
  const fromAll = state.items.find((x) => String(x.id) === String(state.activeId));
  const item = fromFiltered || fromAll;
  if (!item) {
    detailsPanel.innerHTML = "<p class='text-slate-500'>لم يتم العثور على القطعة المحددة.</p>";
    detailsPanel.scrollTop = 0;
    updateBrowseLayout();
    return;
  }
  state.activeId = item.id;

  const mainImage = resolveAssetPath(item.primaryImage);
  const urls = item.urls || [];
  const itemPageUrl = new URL(`./index.html?id=${encodeURIComponent(item.id)}`, window.location.href).href;

  const description = item.description
    ? `<pre class="whitespace-pre-wrap rounded-xl sm:rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-3 sm:p-4 text-sm leading-6 sm:leading-7 text-slate-700">${escapeHtml(item.description)}</pre>`
    : "<p class='text-sm text-slate-500'>لا يوجد وصف متاح.</p>";

  detailsPanel.innerHTML = `
    <button id="mobileBackToListBtn" type="button" class="mb-3 inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-sm sm:hidden">
      العودة إلى القائمة
    </button>
    <div class="mb-3">
      <h2 class="mb-3 sm:mb-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 bg-clip-text text-xl sm:text-2xl font-extrabold leading-8 sm:leading-10 text-transparent">${escapeHtml(item.name || item.title || "بدون عنوان")}</h2>
    </div>
    ${
      mainImage
        ? `<div class="mb-4">
             <div class="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fuchsia-200 bg-white/90 p-2 shadow-sm">
               <span class="text-xs font-bold text-slate-600">تكبير الصورة</span>
               <div class="flex items-center gap-2">
                 <button id="detailZoomInButton" type="button" class="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100">+</button>
                 <button id="detailZoomOutButton" type="button" class="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100">-</button>
                 <button id="detailZoomResetButton" type="button" class="rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-700 transition hover:bg-fuchsia-100">إعادة</button>
                 <span id="detailZoomLevelLabel" class="min-w-12 text-center text-xs font-bold text-slate-500">100%</span>
               </div>
             </div>
             <div class="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-2 shadow-sm">
               <img id="detailMainImage" class="mx-auto block w-full max-h-[min(420px,50vh)] cursor-default select-none object-contain touch-pan-y sm:max-h-[min(480px,55vh)]" src="${escapeHtml(mainImage)}" alt="${escapeHtml(item.title)}" />
               <div class="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[9.5rem] rounded-lg border border-emerald-200/95 bg-white/95 p-2 shadow-lg backdrop-blur-sm sm:bottom-3 sm:left-3">
                 <p class="mb-1.5 text-[10px] font-bold leading-tight text-emerald-700">QR — رابط الصفحة</p>
                 <div id="itemDetailQr" class="rounded-md bg-white leading-none" aria-hidden="true"></div>
                 <p id="itemDetailQrCaption" class="mt-1.5 max-w-full truncate text-center text-[9px] font-semibold text-emerald-800" title=""></p>
               </div>
             </div>
           </div>`
        : ""
    }
    

    ${
      Object.keys(item.fields || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-extrabold text-indigo-700">معلومات القطعة</h3><div class="grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2">${renderRows(item.fields)}</div>`
        : ""
    }

    ${
      Object.keys(item.xlsx || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-extrabold text-cyan-700">بيانات من ملف Excel</h3><div class="grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2">${renderRows(item.xlsx)}</div>`
        : ""
    }

    
  `;

  const qrSize = mainImage ? { width: 96, height: 96, colorDark: "#065f46" } : { width: 144, height: 144, colorDark: "#065f46" };
  mountQrCode("itemDetailQr", itemPageUrl, qrSize);
  const detailQrCaption = document.getElementById("itemDetailQrCaption");
  if (detailQrCaption) {
    detailQrCaption.setAttribute("title", itemPageUrl);
  }
  const mobileBackToListBtn = document.getElementById("mobileBackToListBtn");
  if (mobileBackToListBtn) {
    mobileBackToListBtn.addEventListener("click", () => {
      state.activeId = null;
      writeItemIdToUrl(null);
      renderList({ preserveScroll: true });
      renderDetails();
      restoreItemsListScrollAfterLayout();
    });
  }
  if (mainImage) {
    setupDetailsImageZoom();
  }
  updateBrowseLayout();
  const scrollDetailsToTop = () => {
    if (detailsPanel) detailsPanel.scrollTop = 0;
  };
  scrollDetailsToTop();
  requestAnimationFrame(() => {
    scrollDetailsToTop();
    requestAnimationFrame(scrollDetailsToTop);
  });
}

async function init() {
  setupMobileFiltersDrawer();
  state.items = await loadItems();
  populateGeneralClassificationFilter();
  populateSourceRegionFilter();
  populateTimePeriodFilter();
  state.filtered = filterItems(searchInput.value);

  const routeId = readItemIdFromSearch();
  if (routeId && state.items.some((x) => String(x.id) === String(routeId))) {
    state.activeId = routeId;
  } else {
    state.activeId = null;
  }

  writeItemIdToUrl(state.activeId, { replace: true });

  renderList({ preserveScroll: false });
  renderDetails();

  window.addEventListener("popstate", () => {
    const id = readItemIdFromSearch();
    if (id && state.items.some((x) => String(x.id) === String(id))) {
      state.activeId = id;
    } else {
      state.activeId = null;
    }
    renderList({ preserveScroll: true });
    renderDetails();
    restoreItemsListScrollAfterLayout();
  });
  window.addEventListener("resize", updateBrowseLayout);

  searchInput.addEventListener("input", applyFilters);
  generalClassificationFilter.addEventListener("change", applyFilters);
  sourceRegionFilter.addEventListener("change", applyFilters);
  timePeriodFilter.addEventListener("change", applyFilters);
  resetFiltersBtn.addEventListener("click", resetAllFilters);
}

init().catch((error) => {
  console.error(error);
  detailsPanel.classList.remove("hidden");
  detailsPanel.innerHTML =
    "<p class='text-sm text-red-600'>فشل تحميل البيانات. نفّذ أمر الاستخراج أولاً ثم أعد تحميل الصفحة.</p>";
});
