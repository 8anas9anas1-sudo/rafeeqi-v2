import { useState, useRef, useEffect, useCallback } from "react";

// ==================== CONSTANTS ====================
const BOOKS_URL = "https://www.al-amgaad.com/2021/12/lyiba12-books.html?m=1";

const TRUSTED_SOURCES = [
  { name: "الأمجاد — كتب المنهج الليبي (إعدادي وثانوي)", url: BOOKS_URL, icon: "📚" },
  { name: "وزارة التربية والتعليم الليبية", url: "https://moe.gov.ly", icon: "🏛️" },
  { name: "المركز الوطني لضمان جودة التعليم - ليبيا", url: "https://nqa.gov.ly", icon: "🎯" },
  { name: "منصة عين — التعليم العربي", url: "https://ien.edu.sa", icon: "👁️" },
  { name: "خان أكاديمي بالعربي", url: "https://ar.khanacademy.org", icon: "🎓" },
  { name: "ملتقى المعلم الليبي", url: "https://www.google.com/search?q=ملتقى+المعلم+الليبي+مناهج", icon: "👨‍🏫" },
  { name: "أسئلة امتحانات الشهادة الليبية (بحث)", url: "https://www.google.com/search?q=أسئلة+امتحانات+الشهادة+الثانوية+الليبية+سنوات+سابقة+pdf", icon: "📝" },
  { name: "موسوعة المناهج العربية", url: "https://www.google.com/search?q=منهج+ليبيا+الثانوية+pdf", icon: "🌐" },
];

const STAGES = [
  { id: "middle", label: "الإعدادية", icon: "🏫", grades: ["الأول إعدادي", "الثاني إعدادي", "الثالث إعدادي"] },
  { id: "high", label: "الثانوية", icon: "🎓", grades: ["الأول ثانوي", "الثاني ثانوي", "الثالث ثانوي"] },
];

const TRACKS = ["علمي", "أدبي", "علوم حياة", "علوم رياضية"];

const SUBJECTS = {
  middle: ["رياضيات", "علوم", "لغة عربية", "لغة إنجليزية", "التربية الإسلامية", "علوم اجتماعية", "تكنولوجيا", "فرنسية"],
  high: {
    علمي: ["رياضيات", "فيزياء", "كيمياء", "أحياء", "إحصاء", "لغة عربية", "لغة إنجليزية", "التربية الإسلامية"],
    أدبي: ["لغة عربية", "التاريخ", "الجغرافيا", "الفلسفة وعلم النفس", "التربية الإسلامية", "لغة إنجليزية", "اقتصاد"],
    "علوم حياة": ["أحياء", "كيمياء", "فيزياء", "إحصاء", "رياضيات", "لغة عربية", "لغة إنجليزية"],
    "علوم رياضية": ["رياضيات", "إحصاء", "فيزياء", "كيمياء", "لغة عربية", "لغة إنجليزية"],
  },
};

const SUBJECT_ICONS = {
  رياضيات: "📐", فيزياء: "⚛️", كيمياء: "🧪", أحياء: "🧬", إحصاء: "📊",
  "لغة عربية": "📖", "لغة إنجليزية": "🔤", التاريخ: "🏛️", فرنسية: "🇫🇷",
  الجغرافيا: "🗺️", "الفلسفة وعلم النفس": "🤔", "التربية الإسلامية": "🕌",
  "علوم اجتماعية": "🌍", علوم: "🔬", تكنولوجيا: "💻", اقتصاد: "💰",
};

const MAX_FILE_SIZE_MB = 15;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_HISTORY_MESSAGES = 24; // how many past chat turns we resend as context
const MAX_RECENT_ATTACHMENTS_IN_CONTEXT = 1; // only the newest attachment(s) keep their binary data on resend
const MAX_MESSAGES_IN_MEMORY = 120; // hard cap so a very long single session can't grow the chat array forever
const MAX_MESSAGES_IN_STORAGE = 60; // how many past messages we persist per subject

// ==================== PERSISTENT STORAGE HELPERS ====================
// This app runs as a standalone website (not inside Claude.ai Artifacts), so persistence
// uses the browser's real localStorage. Calls stay async so the rest of the app doesn't care
// where the data actually lives, and everything degrades gracefully to "no persistence"
// instead of crashing if storage is unavailable (e.g. private browsing, quota exceeded).
async function storageGet(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function storageSet(key, value) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // e.g. quota exceeded — fail silently, the app keeps working without persistence
    return false;
  }
}
async function storageDelete(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch {
    // ignore — nothing to clean up if storage isn't available
  }
}

// ---- MCQ question banks (still illustrative placeholders, clearly tagged) ----
// IMPORTANT: every question below is authored with the CORRECT option written first (ans: 0).
// This is intentional for readability while editing. The real, randomized bank used by the
// app is MCQ_BANK, produced below by shuffleQuestionAnswers() — never read RAW_MCQ_BANK directly.
const RAW_MCQ_BANK = {
  رياضيات: [

    { topic: "المعادلات التربيعية", q: "إذا كانت x² - 5x + 6 = 0، فإن قيم x هي:", opts: ["x = 2, 3", "x = -2, -3", "x = 1, 6", "x = -1, -6"], ans: 0 },
    { topic: "الأعداد المركبة", q: "ناتج (3 + 4i)(3 - 4i) يساوي:", opts: ["25", "7", "0", "9 - 16i²"], ans: 0 },
    { topic: "التفاضل", q: "مشتقة الدالة f(x) = x³ - 3x² هي:", opts: ["3x² - 6x", "3x² + 6x", "x² - 3x", "3x - 6"], ans: 0 },
    { topic: "المتتاليات", q: "مجموع متتالية هندسية حدها الأول 2 وأساسها 3 ولها 4 حدود يساوي:", opts: ["80", "40", "26", "20"], ans: 0 },
    { topic: "حساب المثلثات", q: "إذا كانت sin θ = 0.5 حيث θ زاوية حادة، فإن θ تساوي:", opts: ["30°", "45°", "60°", "90°"], ans: 0 },
    { topic: "النهايات", q: "نهاية الدالة (x²-4)/(x-2) عندما x تؤول إلى 2 تساوي:", opts: ["4", "2", "0", "غير معرّفة"], ans: 0 },
    { topic: "التكامل", q: "تكامل الدالة f(x) = 2x بالنسبة لـ x يساوي:", opts: ["x² + C", "2x² + C", "x²/2 + C", "2 + C"], ans: 0 },
    { topic: "الهندسة التحليلية", q: "ميل المستقيم المار بالنقطتين (1,2) و(3,6) يساوي:", opts: ["2", "1", "4", "0.5"], ans: 0 },
    { topic: "المصفوفات", q: "محدد المصفوفة [[2,1],[3,4]] يساوي:", opts: ["5", "8", "11", "-5"], ans: 0 },
    { topic: "اللوغاريتمات", q: "قيمة log₂8 تساوي:", opts: ["3", "2", "4", "8"], ans: 0 },
    { topic: "الاحتمالات", q: "عند رمي حجر نرد مرة واحدة، احتمال ظهور عدد زوجي يساوي:", opts: ["1/2", "1/3", "1/6", "2/3"], ans: 0 },
    { topic: "المعادلات الأسية", q: "حل المعادلة 2ˣ = 8 هو:", opts: ["x = 3", "x = 2", "x = 4", "x = 8"], ans: 0 },
  ],
  فيزياء: [
    { topic: "قوانين نيوتن", q: "القانون الأول لنيوتن يُعرّف بـ:", opts: ["قانون القصور الذاتي", "قانون التسارع", "قانون الفعل ورد الفعل", "قانون الجذب العام"], ans: 0 },
    { topic: "الوحدات", q: "وحدة قياس القوة في النظام الدولي هي:", opts: ["نيوتن", "جول", "واط", "كيلوغرام"], ans: 0 },
    { topic: "الطاقة", q: "الطاقة الكامنة لجسم كتلته 2kg على ارتفاع 5m (g=10 m/s²) تساوي:", opts: ["100 J", "50 J", "200 J", "10 J"], ans: 0 },
    { topic: "الضوء", q: "سرعة الضوء في الفراغ تقريباً:", opts: ["3×10⁸ م/ث", "3×10⁶ م/ث", "3×10⁵ م/ث", "3×10⁴ م/ث"], ans: 0 },
    { topic: "الكهرباء", q: "قانون أوم ينص على أن:", opts: ["V = IR", "V = I/R", "V = R/I", "I = VR"], ans: 0 },
    { topic: "الحركة", q: "جسم يتحرك بسرعة ثابتة 20 م/ث لمدة 5 ثوان، المسافة المقطوعة:", opts: ["100 m", "25 m", "4 m", "100 m/s"], ans: 0 },
    { topic: "الموجات", q: "العلاقة بين سرعة الموجة وطولها وترددها هي:", opts: ["v = fλ", "v = f/λ", "v = λ/f", "v = f+λ"], ans: 0 },
    { topic: "المغناطيسية", q: "القطبان المتشابهان في المغناطيس:", opts: ["يتنافران", "يتجاذبان", "لا يتأثران", "يتعادلان"], ans: 0 },
    { topic: "الحرارة", q: "وحدة قياس الحرارة في النظام الدولي:", opts: ["كلفن", "سيلسيوس", "فهرنهايت", "جول"], ans: 0 },
    { topic: "الديناميكا", q: "كمية الحركة (الزخم) تُحسب بالعلاقة:", opts: ["p = mv", "p = mv²", "p = m/v", "p = v/m"], ans: 0 },
  ],
  كيمياء: [
    { topic: "الجدول الدوري", q: "العدد الذري للأكسجين هو:", opts: ["8", "6", "16", "12"], ans: 0 },
    { topic: "الصيغ الكيميائية", q: "صيغة ثاني أكسيد الكربون هي:", opts: ["CO₂", "CO", "C₂O", "CO₃"], ans: 0 },
    { topic: "الروابط الكيميائية", q: "الرابطة بين ذرتَي الهيدروجين في جزيء H₂ هي:", opts: ["تساهمية", "أيونية", "تنسيقية", "هيدروجينية"], ans: 0 },
    { topic: "الحموض والقواعد", q: "الرقم الهيدروجيني (pH) للمحلول المتعادل عند 25°C يساوي:", opts: ["7", "0", "14", "7.5"], ans: 0 },
    { topic: "الجدول الدوري", q: "رُتّبت عناصر الجدول الدوري الحديث حسب:", opts: ["العدد الذري", "الكتلة الذرية", "الحالة الفيزيائية", "التكافؤ"], ans: 0 },
    { topic: "المولات", q: "عدد مولات 22 غرام من CO₂ (الكتلة المولية 44) يساوي:", opts: ["0.5 مول", "1 مول", "2 مول", "22 مول"], ans: 0 },
    { topic: "التفاعلات", q: "التفاعل الذي يطلق حرارة يسمى:", opts: ["طارد للحرارة", "ماص للحرارة", "متعادل", "عكسي"], ans: 0 },
    { topic: "الكيمياء العضوية", q: "الصيغة العامة للألكانات هي:", opts: ["CₙH₂ₙ₊₂", "CₙH₂ₙ", "CₙH₂ₙ₋₂", "CₙHₙ"], ans: 0 },
  ],
  أحياء: [
    { topic: "الخلية", q: "العضية المسؤولة عن إنتاج الطاقة في الخلية هي:", opts: ["الميتوكندريا", "النواة", "الريبوسوم", "جهاز جولجي"], ans: 0 },
    { topic: "الوراثة", q: "الحمض النووي DNA يوجد بشكل رئيسي في:", opts: ["النواة", "السيتوبلازم", "الغشاء الخلوي", "الفجوة"], ans: 0 },
    { topic: "البناء الضوئي", q: "ناتج عملية البناء الضوئي يشمل:", opts: ["الجلوكوز والأكسجين", "ثاني أكسيد الكربون والماء فقط", "النيتروجين", "البروتين"], ans: 0 },
    { topic: "جهاز الدوران", q: "عدد حجرات القلب عند الإنسان:", opts: ["4", "2", "3", "6"], ans: 0 },
    { topic: "التكاثر", q: "الانقسام المنصف (Meiosis) ينتج عنه خلايا:", opts: ["أحادية الصبغي", "ثنائية الصبغي", "رباعية الصبغي", "بلا صبغيات"], ans: 0 },
    { topic: "الإنزيمات", q: "الإنزيمات هي بروتينات وظيفتها:", opts: ["تسريع التفاعلات الحيوية", "تخزين الطاقة", "نقل الأكسجين", "بناء الأنسجة"], ans: 0 },
  ],
  إحصاء: [
    { topic: "المقاييس المركزية", q: "وسط القيم 4, 8, 6, 10, 2 (الوسط الحسابي) يساوي:", opts: ["6", "8", "5", "10"], ans: 0 },
    { topic: "الوسيط", q: "وسيط القيم 3, 7, 9, 12, 15 يساوي:", opts: ["9", "7", "12", "8"], ans: 0 },
    { topic: "التشتت", q: "المدى لمجموعة القيم 5, 12, 8, 20, 3 يساوي:", opts: ["17", "20", "12", "15"], ans: 0 },
    { topic: "الاحتمالات", q: "إذا كان احتمال نجاح حدث 0.3، فإن احتمال فشله يساوي:", opts: ["0.7", "0.3", "1", "0.4"], ans: 0 },
    { topic: "التوزيع التكراري", q: "المنوال هو القيمة:", opts: ["الأكثر تكراراً في البيانات", "الوسطى في البيانات", "متوسط البيانات", "أكبر قيمة"], ans: 0 },
    { topic: "الانحراف المعياري", q: "الانحراف المعياري يقيس:", opts: ["مدى تشتت البيانات حول الوسط", "القيمة الوسطى", "أعلى قيمة فقط", "عدد البيانات"], ans: 0 },
    { topic: "العينات", q: "العيّنة العشوائية البسيطة تعني أن:", opts: ["لكل فرد فرصة متساوية للاختيار", "يتم اختيار الأفراد الأقرب فقط", "يتم اختيار فئة عمرية واحدة", "لا داعي للتمثيل العشوائي"], ans: 0 },
  ],
  "لغة عربية": [
    { topic: "النحو", q: "إعراب كلمة (الطالبُ) في جملة: الطالبُ مجتهدٌ هو:", opts: ["مبتدأ مرفوع", "خبر مرفوع", "فاعل مرفوع", "مفعول به منصوب"], ans: 0 },
    { topic: "الأفعال", q: "الفعل المضارع في جملة (لم يذهبْ الطالبُ) حكمه:", opts: ["مجزوم", "مرفوع", "منصوب", "مبني"], ans: 0 },
    { topic: "الصرف", q: "جمع كلمة (كتاب) هو:", opts: ["كُتُب", "كتائب", "أكتاب", "كتبة"], ans: 0 },
    { topic: "البلاغة", q: "أسلوب (يا له من يوم جميل) يُعد من أساليب:", opts: ["التعجب", "الاستفهام", "النداء", "الأمر"], ans: 0 },
    { topic: "العروض", q: "علم العروض يهتم بدراسة:", opts: ["أوزان الشعر وبحوره", "قواعد النحو", "المفردات والمعاني", "علامات الترقيم"], ans: 0 },
  ],
  التاريخ: [
    { topic: "تاريخ ليبيا الحديث", q: "أُعلن استقلال ليبيا في عهد المملكة الليبية المتحدة في عام:", opts: ["1951", "1969", "1942", "1911"], ans: 0 },
    { topic: "التاريخ الإسلامي", q: "الخليفة الراشدي الأول بعد وفاة الرسول ﷺ هو:", opts: ["أبو بكر الصديق", "عمر بن الخطاب", "عثمان بن عفان", "علي بن أبي طالب"], ans: 0 },
    { topic: "التاريخ الإسلامي", q: "الحروب الصليبية كانت بين المسلمين و:", opts: ["الأوروبيين المسيحيين", "الفرس", "الرومان الشرقيين فقط", "المغول"], ans: 0 },
    { topic: "تاريخ ليبيا الحديث", q: "بدأ الاحتلال الإيطالي لليبيا في عام:", opts: ["1911", "1942", "1951", "1969"], ans: 0 },
    { topic: "التاريخ العربي", q: "تأسست الدولة الأموية بعد انتهاء عهد:", opts: ["الخلافة الراشدة", "الدولة العباسية", "الدولة الفاطمية", "الدولة العثمانية"], ans: 0 },
    { topic: "تاريخ ليبيا الحديث", q: "شهدت ليبيا معارك بين قوات الحلفاء ودول المحور خلال:", opts: ["الحرب العالمية الثانية", "الحرب العالمية الأولى", "الحروب الصليبية", "الحرب الباردة فقط"], ans: 0 },
  ],
  الجغرافيا: [
    { topic: "جغرافيا ليبيا", q: "أكبر مدن ليبيا من حيث المساحة الصحراوية تقع في إقليم:", opts: ["فزان", "طرابلس", "برقة", "الجبل الأخضر"], ans: 0 },
    { topic: "المناخ", q: "المناخ السائد في الساحل الليبي هو:", opts: ["البحر المتوسط", "الاستوائي", "القطبي", "الموسمي"], ans: 0 },
    { topic: "جغرافيا ليبيا", q: "يحدّ ليبيا من الشمال:", opts: ["البحر الأبيض المتوسط", "البحر الأحمر", "المحيط الأطلسي", "الخليج العربي"], ans: 0 },
    { topic: "الموارد الطبيعية", q: "يُعد النفط من أهم الموارد الاقتصادية في:", opts: ["ليبيا", "النرويج فقط", "اليابان", "سويسرا"], ans: 0 },
    { topic: "التضاريس", q: "يقع الجبل الأخضر في إقليم:", opts: ["برقة", "فزان", "طرابلس", "الجنوب الليبي فقط"], ans: 0 },
    { topic: "الجغرافيا العامة", q: "أطول نهر في العالم هو:", opts: ["نهر النيل", "نهر الأمازون", "نهر الفرات", "نهر دجلة"], ans: 0 },
  ],
  "لغة إنجليزية": [
    { topic: "Grammar — Present Simple", q: "Choose the correct verb: She ___ to school every day.", opts: ["goes", "go", "going", "gone"], ans: 0 },
    { topic: "Vocabulary", q: "Choose the synonym of 'happy':", opts: ["glad", "sad", "angry", "tired"], ans: 0 },
    { topic: "Grammar — Plurals", q: "What is the plural of 'child'?", opts: ["children", "childs", "childes", "child"], ans: 0 },
    { topic: "Prepositions", q: "Choose the correct preposition: I go ___ school by bus.", opts: ["to", "at", "in", "on"], ans: 0 },
    { topic: "Grammar — Past Simple", q: "What is the past simple of 'go'?", opts: ["went", "goed", "gone", "going"], ans: 0 },
    { topic: "Wh-Questions", q: "Choose the correct question for the answer: 'I am from Tripoli.'", opts: ["Where are you from?", "What is your name?", "How are you?", "Who are you?"], ans: 0 },
  ],
  "التربية الإسلامية": [
    { topic: "أركان الإسلام", q: "عدد أركان الإسلام هو:", opts: ["خمسة", "أربعة", "ستة", "ثلاثة"], ans: 0 },
    { topic: "العقيدة", q: "أول أركان الإيمان هو:", opts: ["الإيمان بالله", "الإيمان بالملائكة", "الإيمان بالكتب", "الإيمان باليوم الآخر"], ans: 0 },
    { topic: "الفقه", q: "عدد الصلوات المفروضة في اليوم والليلة:", opts: ["خمس صلوات", "أربع صلوات", "ست صلوات", "ثلاث صلوات"], ans: 0 },
    { topic: "السيرة النبوية", q: "وُلد الرسول ﷺ في مدينة:", opts: ["مكة المكرمة", "المدينة المنورة", "الطائف", "القدس"], ans: 0 },
    { topic: "القرآن الكريم", q: "أول سورة نزلت من القرآن الكريم هي:", opts: ["العلق", "الفاتحة", "البقرة", "الإخلاص"], ans: 0 },
    { topic: "الأخلاق الإسلامية", q: "من صفات المسلم الواجب التحلي بها:", opts: ["الصدق والأمانة", "الكذب", "الغيبة", "الكسل"], ans: 0 },
  ],
  "علوم اجتماعية": [
    { topic: "الجغرافيا العامة", q: "تقع ليبيا في قارة:", opts: ["أفريقيا", "آسيا", "أوروبا", "أمريكا"], ans: 0 },
    { topic: "تاريخ ليبيا", q: "العاصمة الليبية هي:", opts: ["طرابلس", "بنغازي", "مصراتة", "سبها"], ans: 0 },
    { topic: "المواطنة", q: "من حقوق المواطن الأساسية:", opts: ["التعليم", "التهرب من القانون", "الإضرار بالممتلكات العامة", "مخالفة القوانين"], ans: 0 },
    { topic: "الجغرافيا الطبيعية", q: "أكبر صحراء في العالم هي:", opts: ["الصحراء الكبرى", "صحراء كلهاري", "صحراء غوبي", "الصحراء العربية"], ans: 0 },
    { topic: "التاريخ الإسلامي", q: "فتح المسلمون شمال أفريقيا في عهد:", opts: ["الدولة الأموية", "الدولة العباسية", "الدولة الفاطمية", "الدولة العثمانية"], ans: 0 },
    { topic: "النظم السياسية", q: "السلطة التشريعية مسؤولة بشكل أساسي عن:", opts: ["سنّ القوانين", "تنفيذ القوانين", "الفصل في النزاعات", "جباية الضرائب فقط"], ans: 0 },
  ],
  تكنولوجيا: [
    { topic: "أساسيات الحاسوب", q: "وحدة المعالجة المركزية تُعرف اختصاراً بـ:", opts: ["CPU", "RAM", "USB", "GPU"], ans: 0 },
    { topic: "الشبكات", q: "الاختصار www يعني:", opts: ["World Wide Web", "World Wide Wire", "Wide World Web", "Web World Wide"], ans: 0 },
    { topic: "البرمجيات", q: "نظام التشغيل هو برنامج وظيفته:", opts: ["إدارة موارد الحاسوب", "تصفح الإنترنت فقط", "تحرير الصور فقط", "طباعة المستندات فقط"], ans: 0 },
    { topic: "أمن المعلومات", q: "كلمة المرور القوية يجب أن تحتوي على:", opts: ["أحرف وأرقام ورموز متنوعة", "الاسم الشخصي فقط", "أرقام متتالية فقط", "كلمة بسيطة سهلة التذكر"], ans: 0 },
    { topic: "تخزين البيانات", q: "وحدة قياس سعة التخزين الأكبر من الميغابايت هي:", opts: ["جيجابايت", "بايت", "بت", "هيرتز"], ans: 0 },
    { topic: "الإنترنت", q: "يُستخدم البريد الإلكتروني بشكل أساسي لـ:", opts: ["إرسال واستقبال الرسائل الرقمية", "تصفح الفيديوهات فقط", "تخزين الصور فقط", "الألعاب الإلكترونية"], ans: 0 },
  ],
  فرنسية: [
    { topic: "المفردات الأساسية", q: "كلمة 'Bonjour' تعني بالعربية:", opts: ["مرحباً / صباح الخير", "مساء الخير", "وداعاً", "شكراً"], ans: 0 },
    { topic: "الضمائر", q: "الضمير 'Je' يقابل في العربية:", opts: ["أنا", "أنت", "هو", "نحن"], ans: 0 },
    { topic: "القواعد — فعل être", q: "الصيغة الصحيحة لـ 'Je ___' من الفعل être هي:", opts: ["suis", "es", "est", "sommes"], ans: 0 },
    { topic: "الأرقام", q: "الرقم 'trois' يعني بالعربية:", opts: ["ثلاثة", "اثنان", "أربعة", "واحد"], ans: 0 },
    { topic: "المفردات", q: "كلمة 'Merci' تعني:", opts: ["شكراً", "من فضلك", "عفواً", "نعم"], ans: 0 },
    { topic: "أدوات التعريف", q: "أداة التعريف المؤنثة في الفرنسية هي:", opts: ["la", "le", "les", "un"], ans: 0 },
  ],
  علوم: [
    { topic: "الكائنات الحية", q: "العضو المسؤول عن ضخ الدم في جسم الإنسان هو:", opts: ["القلب", "الكبد", "المعدة", "الرئة"], ans: 0 },
    { topic: "المادة وخواصها", q: "يتجمد الماء عند درجة حرارة:", opts: ["صفر مئوية", "100 مئوية", "50 مئوية", "-10 مئوية"], ans: 0 },
    { topic: "الطاقة", q: "مصدر الطاقة الرئيسي على سطح الأرض هو:", opts: ["الشمس", "القمر", "الرياح فقط", "المحيطات فقط"], ans: 0 },
    { topic: "النباتات", q: "تصنع النباتات الخضراء غذاءها عن طريق:", opts: ["البناء الضوئي", "التنفس فقط", "الامتصاص من الهواء فقط", "التبخر"], ans: 0 },
    { topic: "الأرض والفضاء", q: "الكوكب الأقرب إلى الشمس هو:", opts: ["عطارد", "الأرض", "المريخ", "الزهرة"], ans: 0 },
    { topic: "حالات المادة", q: "الحالات الأساسية للمادة هي:", opts: ["صلبة وسائلة وغازية", "صلبة وسائلة فقط", "غازية فقط", "سائلة وغازية فقط"], ans: 0 },
  ],
  "الفلسفة وعلم النفس": [
    { topic: "مبادئ الفلسفة", q: "تعني كلمة 'فلسفة' في أصلها اليوناني:", opts: ["حب الحكمة", "علم الطبيعة", "علم النفس", "فن الجدل"], ans: 0 },
    { topic: "علم النفس العام", q: "يُعنى علم النفس أساساً بدراسة:", opts: ["السلوك والعمليات العقلية", "تركيب الذرة", "تاريخ الحضارات", "المناخ"], ans: 0 },
    { topic: "المنطق", q: "الاستدلال المنطقي الذي ينتقل من العام إلى الخاص يسمى:", opts: ["الاستنباط", "الاستقراء", "القياس الخاطئ", "التخمين"], ans: 0 },
    { topic: "تاريخ الفلسفة", q: "يُعد سقراط أحد أبرز فلاسفة:", opts: ["اليونان القديمة", "العصر الحديث", "الفلسفة الإسلامية", "الفلسفة الصينية"], ans: 0 },
    { topic: "علم النفس التربوي", q: "يهدف التعزيز الإيجابي في علم النفس التربوي إلى:", opts: ["تشجيع السلوك المرغوب وتكراره", "معاقبة السلوك الخاطئ", "إلغاء كل المكافآت", "تجاهل سلوك الطالب"], ans: 0 },
    { topic: "نظرية المعرفة", q: "يرتبط مفهوم 'المعرفة' في الفلسفة أساساً بالتساؤل عن:", opts: ["كيف نعرف الأشياء ومصادر اليقين", "أنواع النباتات", "قوانين الحركة فقط", "تركيب المادة"], ans: 0 },
  ],
  اقتصاد: [
    { topic: "مبادئ الاقتصاد", q: "يدرس علم الاقتصاد أساساً:", opts: ["كيفية تخصيص الموارد المحدودة لإشباع الحاجات", "تركيب الذرة", "قواعد اللغة", "تاريخ الأمم فقط"], ans: 0 },
    { topic: "العرض والطلب", q: "عندما يزيد الطلب على سلعة مع ثبات العرض، فإن السعر غالباً:", opts: ["يرتفع", "ينخفض", "يبقى ثابتاً دائماً", "يختفي من السوق"], ans: 0 },
    { topic: "المفاهيم الأساسية", q: "تعني الندرة في الاقتصاد:", opts: ["محدودية الموارد مقابل الحاجات غير المحدودة", "وفرة الموارد بلا حدود", "غياب الحاجات الإنسانية", "ثبات الأسعار دائماً"], ans: 0 },
    { topic: "النقود", q: "من الوظائف الأساسية للنقود:", opts: ["وسيط للتبادل ومقياس للقيمة", "الزينة فقط", "تخزين الطعام", "قياس الوقت"], ans: 0 },
    { topic: "الأسواق", q: "السوق الذي يسيطر فيه بائع واحد على عرض السلعة يسمى:", opts: ["احتكار", "منافسة كاملة", "منافسة احتكارية", "سوق حرة بالكامل"], ans: 0 },
    { topic: "التنمية الاقتصادية", q: "يقيس الناتج المحلي الإجمالي (GDP):", opts: ["القيمة الإجمالية للسلع والخدمات المنتجة في بلد خلال فترة معينة", "عدد السكان فقط", "معدل البطالة فقط", "سعر صرف العملة فقط"], ans: 0 },
  ],
};

// ---- Deterministic shuffle so the correct answer isn't always option "أ" ----
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffleQuestionAnswers(rawBank) {
  const out = {};
  for (const [subject, list] of Object.entries(rawBank)) {
    out[subject] = list.map((q, i) => {
      const order = seededShuffle([0, 1, 2, 3], hashStr(`${subject}__${i}__${q.q}`));
      return { ...q, opts: order.map((origIdx) => q.opts[origIdx]), ans: order.indexOf(q.ans) };
    });
  }
  return out;
}
const MCQ_BANK = shuffleQuestionAnswers(RAW_MCQ_BANK);

function buildExamQuestions(subject, count = 60) {
  const bank = MCQ_BANK[subject];
  if (!bank || bank.length === 0) return [];
  const questions = [];
  for (let i = 0; i < count; i++) {
    const base = bank[i % bank.length];
    questions.push({
      ...base,
      id: `${subject}-${i}`,
      displayIndex: i + 1,
    });
  }
  return questions;
}

// ==================== AI BACKEND CALL ====================
// The actual provider (Claude / Gemini / DeepSeek / ...) and its API key live ONLY on the
// server (server.js), read from environment variables. The browser never sees the key —
// it just talks to our own /api/chat endpoint, which picks whichever provider is configured
// and normalises the response back to this same { content, stop_reason } shape regardless
// of which provider answered.
async function callAI(messages, systemPrompt, maxTokens = 1536) {
  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: systemPrompt, messages, max_tokens: maxTokens }),
    });
  } catch {
    const e = new Error("تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت وحاول مرة أخرى.");
    e.kind = "network";
    throw e;
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || "";
    } catch {
      // response wasn't JSON — ignore, we'll fall back to a generic message below
    }
    let msg;
    if (res.status === 429) msg = "الخدمة مزدحمة حالياً (تجاوزنا الحد المسموح من الطلبات)، انتظر قليلاً وحاول مرة أخرى.";
    else if (res.status >= 500) msg = "خدمة الذكاء الاصطناعي غير متاحة مؤقتاً من جهتها، حاول بعد قليل.";
    else if (res.status === 401 || res.status === 403) msg = "تعذّر التحقق من الصلاحية للوصول للخدمة.";
    else msg = detail ? `حدث خطأ أثناء معالجة الطلب: ${detail}` : `حدث خطأ غير متوقع (${res.status}).`;
    const e = new Error(msg);
    e.kind = "api";
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!text) {
    const e = new Error("لم يصل رد نصّي من الخدمة، حاول مرة أخرى.");
    e.kind = "empty";
    throw e;
  }
  if (data.stop_reason === "max_tokens") {
    return text + "\n\n⚠️ هذا الرد طويل وتم اقتطاعه عند الحد الأقصى. اكتب \"أكمل\" لمتابعته.";
  }
  return text;
}

function buildSystemPrompt(stage, grade, track, subject) {
  return `أنت "رفيقي" — مدرّس افتراضي متخصص حصراً في المنهج الليبي الرسمي للشهادتين الإعدادية والثانوية.

السياق الحالي للطالب:
- المرحلة: ${stage || "غير محددة"}
- الصف: ${grade || "غير محدد"}
- التخصص: ${track || "غير محدد"}
- المادة: ${subject || "غير محددة"}

قواعد ثابتة لا تُخرق:
1. أنت لست مصدر المعلومة من ذاكرتك الحرة — تصرّف دائماً وكأنك معلّم يشرح من نفس الكتاب المدرسي الليبي الرسمي، بنفس المصطلحات والترتيب والطريقة المعتمدة في المنهج، لا بطريقة مستوردة من مناهج أخرى.
2. إذا لم تكن متأكداً من تفصيل دقيق (رقم صفحة، نص حرفي من الكتاب، رقم تمرين بعينه)، فقل ذلك صراحة بدل اختلاق معلومة. إن كان السؤال يحتاج دقة حرفية ولم يُرفق الطالب صورة أو PDF من الكتاب نفسه، اطلب منه إرفاق الصفحة المعنية من تبويب 📎 قبل الإجابة بدقة، بدل تخمين محتوى الكتاب من ذاكرتك.
3. أجب فقط على أسئلة تخص المنهج الدراسي الليبي. أي سؤال خارج هذا النطاق (دردشة عامة، مواضيع شخصية، مناهج دول أخرى) تُرفض بأدب وتُعيد توجيه الطالب للدراسة.
4. اشرح بعمق حقيقي خطوة بخطوة، لا تكتفِ بإجابة سطحية. وضّح "لماذا" الخطوة صحيحة وليس فقط "كيف".
5. كن مختصراً ومباشراً في أول جملة، ثم فصّل. لا تُطل بمقدمات غير ضرورية.
6. إن أرسل الطالب صورة أو PDF من كتابه أو دفتره، اعتبره المصدر الأدق المتاح لك الآن، واقرأه بدقة وأجب بناءً على محتواه الفعلي حرفياً، لا من ذاكرتك العامة، حتى لو اختلف عما تتوقعه.
7. نغمة الحديث: عربية فصيحة سهلة، ودودة، مشجّعة، مناسبة لطالب بين 13 و18 سنة، مع إيموجي قليلة ومناسبة فقط.
8. لا تستخدم رموز Markdown الثقيلة (### أو ** بكثرة) — اكتب بأسلوب طبيعي يشبه شرح المعلم على السبورة.`;
}

function buildExamExplainPrompt(stage, grade, track, subject) {
  return `أنت معلّم ليبي متخصص في مادة ${subject || ""} ضمن المنهج الليبي الرسمي (${stage || ""} - ${grade || ""} ${track || ""}).
مهمتك الوحيدة الآن: شرح سؤال اختيار من متعدد واحد للطالب بعمق ووضوح حقيقيين، خطوة بخطوة، موضحاً سبب صحة الإجابة الصحيحة وسبب خطأ الخيارات الأخرى المهمة.
كن مباشراً: ابدأ الشرح من أول كلمة، بلا مقدمات مثل "بالتأكيد" أو "سأشرح لك". لا تتجاوز 6-8 أسطر. لا تستخدم Markdown ثقيل.`;
}

// ==================== COMPONENTS ====================

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
      <div style={{ display: "flex", gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%", background: "#4F9DFF",
            animation: `bounce 1.1s ease-in-out ${i * 0.15}s infinite`,
          }} />
        ))}
      </div>
      {label && <span style={{ color: "#64748b", fontSize: 12 }}>{label}</span>}
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Shared validation + conversion for one or more files: checks type and size before reading,
// and caps how many attachments can go into a single message. Returns the accepted attachments.
async function processFiles(fileList, existingCount = 0) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    alert(`يمكن إرفاق ${MAX_ATTACHMENTS_PER_MESSAGE} ملفات كحد أقصى في الرسالة الواحدة.`);
    return [];
  }
  const accepted = [];
  for (const file of files) {
    // Some browsers/OS combinations leave file.type empty for valid PDFs/images
    // (e.g. certain PDF exports). Fall back to the file extension in that case
    // instead of rejecting a perfectly valid file.
    const lowerName = (file.name || "").toLowerCase();
    const isPDF = file.type === "application/pdf" || (!file.type && lowerName.endsWith(".pdf"));
    const isImage = file.type.startsWith("image/") || (!file.type && /\.(png|jpe?g|gif|webp|bmp|heic)$/.test(lowerName));
    const mediaType = file.type || (isPDF ? "application/pdf" : isImage ? `image/${lowerName.split(".").pop().replace("jpg", "jpeg")}` : "");
    if (!isPDF && !isImage) {
      alert(`نوع الملف "${file.name}" غير مدعوم. الرجاء رفع PDF أو صورة (jpg, png) فقط.`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`الملف "${file.name}" حجمه أكبر من ${MAX_FILE_SIZE_MB} ميغابايت. الرجاء رفع ملف أصغر أو تقسيمه.`);
      continue;
    }
    try {
      const data = await fileToBase64(file);
      accepted.push({ name: file.name, type: isPDF ? "pdf" : "image", mediaType, data });
    } catch {
      alert(`تعذّرت قراءة الملف "${file.name}"، حاول مرة أخرى.`);
    }
  }
  return accepted;
}

function AttachmentUploader({ onAttach }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const handleFiles = async (fileList) => {
    const accepted = await processFiles(fileList, 0);
    if (accepted.length) onAttach(accepted);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => fileRef.current.click()}
      style={{
        border: `2px dashed ${dragging ? "#4F9DFF" : "#334155"}`,
        borderRadius: 12, padding: "22px 16px", textAlign: "center",
        cursor: "pointer", background: dragging ? "#1e3a5f22" : "#0f172a",
        transition: "all 0.2s", color: "#94a3b8",
      }}
    >
      <input ref={fileRef} type="file" accept=".pdf,image/*" multiple style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)} />
      <div style={{ fontSize: 30 }}>📎</div>
      <div style={{ marginTop: 6, fontSize: 13 }}>اسحب صورة أو PDF هنا أو اضغط للرفع (يمكن اختيار أكثر من ملف)</div>
      <div style={{ marginTop: 4, fontSize: 11, color: "#475569" }}>صور الكتاب، الدفتر، أو ملف PDF كامل • حتى {MAX_FILE_SIZE_MB} ميغابايت لكل ملف</div>
    </div>
  );
}

function ExamExplainBox({ question, subject, stage, grade, track }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchExplain = async () => {
    setOpen(true);
    if (text) return;
    setLoading(true);
    setError("");
    try {
      const sys = buildExamExplainPrompt(stage, grade, track, subject);
      const prompt = `السؤال: ${question.q}\nالخيارات: ${question.opts.map((o, i) => `${["أ", "ب", "ج", "د"][i]}) ${o}`).join(" — ")}\nالإجابة الصحيحة: ${["أ", "ب", "ج", "د"][question.ans]}) ${question.opts[question.ans]}\nاشرح لماذا هذه الإجابة صحيحة وبيّن أين الخطأ في أبرز خيار خاطئ شائع.`;
      const reply = await callAI([{ role: "user", content: prompt }], sys, 1024);
      setText(reply);
    } catch (e) {
      setError(e?.message || "تعذّر تحميل الشرح.");
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button onClick={fetchExplain} style={{
          background: "#1e1b3a", border: "1px solid #4c3a8e", borderRadius: 10,
          padding: "8px 14px", cursor: "pointer", color: "#c4b5fd",
          fontFamily: "inherit", fontSize: 13, fontWeight: 600,
        }}>
          🧠 شرح معمّق بالذكاء الاصطناعي
        </button>
      ) : (
        <div style={{ background: "#0c0a1e", border: "1px solid #4c3a8e", borderRadius: 12, padding: 14, marginTop: 8 }}>
          {loading ? (
            <Spinner label="جاري إعداد الشرح..." />
          ) : error ? (
            <div style={{ color: "#fca5a5", fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              ⚠️ {error}
              <button onClick={fetchExplain} style={{ background: "transparent", border: "1px solid #fca5a5", borderRadius: 8, color: "#fca5a5", padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>إعادة المحاولة</button>
            </div>
          ) : (
            <div style={{ color: "#e9d5ff", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{text}</div>
          )}
        </div>
      )}
    </div>
  );
}

function MCQExam({ subject, stage, grade, track, onClose }) {
  const [questions] = useState(() => buildExamQuestions(subject, 60));
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90 * 60);
  const [restored, setRestored] = useState(false);
  const [pastAttempts, setPastAttempts] = useState([]);
  const progressKey = `rafeeqi:exam-progress:${subject}`;
  const historyKey = `rafeeqi:exam-history:${subject}`;
  const timeLeftRef = useRef(timeLeft);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  // Restore an in-progress attempt for this subject, if one exists, so refreshing the page
  // (or accidentally closing) doesn't wipe answers and the timer from under the student.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageGet(progressKey);
      if (!cancelled && saved && saved.questionCount === questions.length) {
        if (saved.answers) setAnswers(saved.answers);
        if (typeof saved.timeLeft === "number" && saved.timeLeft > 0) setTimeLeft(saved.timeLeft);
      }
      if (!cancelled) setRestored(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Save immediately whenever an answer changes, and also on a slow interval so the
  // remaining time stays reasonably fresh even if the student never touches another question.
  useEffect(() => {
    if (!restored || submitted) return;
    storageSet(progressKey, { answers, timeLeft: timeLeftRef.current, questionCount: questions.length, savedAt: Date.now() });
  }, [answers, restored, submitted]);

  useEffect(() => {
    if (!restored || submitted) return;
    const t = setInterval(() => {
      storageSet(progressKey, { answers, timeLeft: timeLeftRef.current, questionCount: questions.length, savedAt: Date.now() });
    }, 15000);
    return () => clearInterval(t);
  }, [restored, submitted, answers]);

  useEffect(() => {
    if (submitted || questions.length === 0 || !restored) return;
    const t = setInterval(() => setTimeLeft((p) => { if (p <= 1) { setSubmitted(true); return 0; } return p - 1; }), 1000);
    return () => clearInterval(t);
  }, [submitted, questions.length, restored]);

  // On submission: log the attempt to this subject's history and clear the in-progress save.
  useEffect(() => {
    if (!submitted || questions.length === 0) return;
    const finalScore = questions.filter((q) => answers[q.id] === q.ans).length;
    const finalPct = Math.round((finalScore / questions.length) * 100);
    (async () => {
      const history = (await storageGet(historyKey)) || [];
      history.push({ date: new Date().toISOString(), score: finalScore, total: questions.length, pct: finalPct });
      const trimmed = history.slice(-10);
      await storageSet(historyKey, trimmed);
      await storageDelete(progressKey);
      setPastAttempts([...trimmed].reverse());
    })();
  }, [submitted]);

  const mins = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  const score = submitted ? questions.filter((q) => answers[q.id] === q.ans).length : 0;
  const pct = submitted && questions.length ? Math.round((score / questions.length) * 100) : 0;
  const answeredCount = Object.keys(answers).length;
  const uniqueQuestionCount = MCQ_BANK[subject]?.length || 0;

  const handleClose = () => {
    if (!submitted && answeredCount > 0) {
      const ok = window.confirm(`لديك ${answeredCount} إجابة مسجّلة في هذا الامتحان. تم حفظ تقدّمك تلقائياً وستجده عند فتح الامتحان مرة أخرى. هل تريد الإغلاق الآن؟`);
      if (!ok) return;
    }
    onClose();
  };

  if (questions.length === 0) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#030712", zIndex: 1000,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, fontFamily: "inherit", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 44 }}>🚧</div>
        <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>بنك أسئلة {subject} قيد الإعداد</div>
        <div style={{ color: "#94a3b8", fontSize: 14, maxWidth: 360, lineHeight: 1.7 }}>
          لم نُضِف بعد أسئلة كافية لهذه المادة، ولن نعرض لك أسئلة مادة أخرى باسمها. جرّب مادة أخرى أو راجع لاحقاً.
        </div>
        <button onClick={onClose} style={{
          background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 24px",
          cursor: "pointer", color: "#fff", fontFamily: "inherit", fontWeight: 600,
        }}>رجوع</button>
      </div>
    );
  }

  if (!restored) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#030712", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
      }}>
        <Spinner label="جاري استرجاع تقدّمك السابق إن وُجد..." />
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#030712", zIndex: 1000,
      display: "flex", flexDirection: "column", fontFamily: "inherit",
    }}>
      <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={handleClose} style={{ background: "#ef4444", border: "none", borderRadius: 8, color: "#fff", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>✕ إغلاق</button>
          <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}>📝 امتحان {subject} — {questions.length} سؤال</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "#94a3b8", fontSize: 13 }}>{answeredCount}/{questions.length} مجاب</span>
          <div style={{ color: timeLeft < 600 ? "#ef4444" : "#4ade80", fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
            ⏱ {mins}:{secs}
          </div>
          {!submitted && (
            <button onClick={() => setSubmitted(true)} style={{ background: "#4F9DFF", border: "none", borderRadius: 8, color: "#fff", padding: "6px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              تسليم الاختبار
            </button>
          )}
        </div>
      </div>

      {uniqueQuestionCount < 15 && !submitted && (
        <div style={{ background: "#1e1b3a", borderBottom: "1px solid #4c3a8e", color: "#c4b5fd", fontSize: 12, padding: "8px 16px", textAlign: "center" }}>
          ℹ️ بنك هذه المادة يحتوي حالياً على {uniqueQuestionCount} سؤال أساسي يتكرر للوصول إلى {questions.length} سؤال، ونعمل على توسيعه.
        </div>
      )}

      {submitted ? (
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 20, padding: 28, maxWidth: 480, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 52 }}>{pct >= 80 ? "🏆" : pct >= 60 ? "✅" : "📚"}</div>
            <div style={{ color: "#f1f5f9", fontSize: 26, fontWeight: 700, margin: "10px 0 4px" }}>{score} / {questions.length}</div>
            <div style={{ color: pct >= 80 ? "#4ade80" : pct >= 60 ? "#facc15" : "#ef4444", fontSize: 19, fontWeight: 700 }}>{pct}%</div>
            <div style={{ color: "#94a3b8", marginTop: 6 }}>
              {pct >= 80 ? "ممتاز! أداء رائع 🎉" : pct >= 60 ? "جيد، واصل المراجعة 💪" : "لا تستسلم، راجع المادة من جديد 📖"}
            </div>
          </div>

          {pastAttempts.length > 1 && (
            <div style={{ maxWidth: 480, width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: 18 }}>
              <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📊 محاولاتك السابقة في {subject}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pastAttempts.slice(0, 6).map((a, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: i === 0 ? "#4F9DFF" : "#94a3b8" }}>
                    <span>{new Date(a.date).toLocaleDateString("ar")}{i === 0 ? " (الآن)" : ""}</span>
                    <span>{a.score}/{a.total} — {a.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxWidth: 680, width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            {questions.map((q) => {
              const correct = answers[q.id] === q.ans;
              const wasAnswered = answers[q.id] !== undefined;
              return (
                <div key={q.id} style={{
                  background: "#0f172a", border: `1px solid ${!wasAnswered ? "#334155" : correct ? "#166534" : "#7f1d1d"}`,
                  borderRadius: 12, padding: 14,
                }}>
                  <div style={{ color: "#f1f5f9", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                    {q.displayIndex}. {q.q}
                    <span style={{ marginRight: 8, fontSize: 11, color: "#64748b" }}>[{q.topic}]</span>
                  </div>
                  {q.opts.map((o, oi) => (
                    <div key={oi} style={{
                      padding: "5px 12px", borderRadius: 8, marginBottom: 4,
                      background: oi === q.ans ? "#14532d" : (answers[q.id] === oi && !correct) ? "#7f1d1d" : "#1e293b",
                      color: oi === q.ans ? "#4ade80" : (answers[q.id] === oi && !correct) ? "#fca5a5" : "#94a3b8",
                      fontSize: 13,
                    }}>
                      {["أ", "ب", "ج", "د"][oi]}) {o} {oi === q.ans && "✓"}
                    </div>
                  ))}
                  {!correct && <ExamExplainBox question={q} subject={subject} stage={stage} grade={grade} track={track} />}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {questions.map((q) => (
              <div key={q.id} style={{
                background: "#0f172a", border: `1px solid ${answers[q.id] !== undefined ? "#4F9DFF44" : "#1e293b"}`,
                borderRadius: 14, padding: 14,
              }}>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>
                  السؤال {q.displayIndex} • {q.topic}
                </div>
                <div style={{ color: "#f1f5f9", marginBottom: 10, fontWeight: 500, lineHeight: 1.6, fontSize: 14 }}>{q.q}</div>
                {q.opts.map((o, oi) => (
                  <button key={oi} onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))} style={{
                    display: "block", width: "100%", textAlign: "right", padding: "7px 12px",
                    marginBottom: 5, borderRadius: 8, border: "1px solid",
                    borderColor: answers[q.id] === oi ? "#4F9DFF" : "#334155",
                    background: answers[q.id] === oi ? "#1e3a5f" : "#0f172a",
                    color: answers[q.id] === oi ? "#4F9DFF" : "#94a3b8",
                    cursor: "pointer", fontFamily: "inherit", fontSize: 13, transition: "all 0.15s",
                  }}>
                    {["أ", "ب", "ج", "د"][oi]}) {o}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Hard-cap how many messages we keep in memory during a single long session, so an
// extended chat can't grow the array (and the DOM list rendering it) without bound.
// Always keeps the very first message (the welcome/intro) plus the most recent ones.
function capMessages(msgs) {
  if (msgs.length <= MAX_MESSAGES_IN_MEMORY) return msgs;
  return [msgs[0], ...msgs.slice(-(MAX_MESSAGES_IN_MEMORY - 1))];
}

// Strip the heavy base64 `data` field from attachments before persisting chat history —
// keeping only the small metadata (name/type) needed to render the 📎 chip in the UI.
// Full attachments are already 15MB-capped each; storing several of those verbatim in
// localStorage quickly hits the browser's per-origin storage quota and silently fails.
function sanitizeMessagesForStorage(msgs) {
  return msgs.slice(-MAX_MESSAGES_IN_STORAGE).map((m) => {
    if (!m.attachments && !m.attachment) return m;
    const atts = (m.attachments || (m.attachment ? [m.attachment] : [])).map(
      ({ name, type, mediaType }) => ({ name, type, mediaType })
    );
    const { attachment, ...rest } = m;
    return { ...rest, attachments: atts };
  });
}


//      1. Keep only the last MAX_HISTORY_MESSAGES turns so the context doesn't blow up.
//      2. Strip binary attachment data from all but the most recent MAX_RECENT_ATTACHMENTS_IN_CONTEXT
//         messages so we don't re-send megabytes of image/PDF data on every message.
function buildApiMessages(msgs) {
  const trimmed = msgs.slice(-MAX_HISTORY_MESSAGES);
  return trimmed.map((m, idx) => {
    if (m.role !== "user") return { role: "assistant", content: m.content };
    const isRecent = idx >= trimmed.length - MAX_RECENT_ATTACHMENTS_IN_CONTEXT;
    const atts = (m.attachments || (m.attachment ? [m.attachment] : [])).filter((a) => a && a.data);
    if (!atts.length || !isRecent) {
      return { role: "user", content: m.content };
    }
    const blocks = atts.map((att) =>
      att.type === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: att.data } }
        : { type: "image", source: { type: "base64", media_type: att.mediaType, data: att.data } }
    );
    return { role: "user", content: [...blocks, { type: "text", text: m.content }] };
  });
}

// ==================== MAIN APP ====================
export default function Rafeeqi() {
  const [stage, setStage] = useState(null);
  const [grade, setGrade] = useState(null);
  const [track, setTrack] = useState(null);
  const [subject, setSubject] = useState(null);
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "أهلاً بك في رفيقي 👋 اختر مرحلتك الدراسية والمادة من القائمة لنبدأ. أنا هنا لأشرح لك مباشرة من المنهج الليبي، خطوة بخطوة.",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [showExam, setShowExam] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [aiStatus, setAiStatus] = useState(null); // { ok, provider, label } from /api/status
  const chatRef = useRef();

  // ---- Check once which AI provider the server is actually configured to use ----
  // (reads only public info — never the key itself — so we can show a clear status/error
  // instead of letting every chat attempt fail silently if no key is set on the server).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAiStatus(d); })
      .catch(() => { if (!cancelled) setAiStatus({ ok: false }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  // ---- Persistence: restore last stage/grade/track/subject once on first load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageGet("rafeeqi:selection");
      if (!cancelled && saved) {
        const st = STAGES.find((s) => s.id === saved.stageId) || null;
        if (st) setStage(st);
        if (saved.grade) setGrade(saved.grade);
        if (saved.track) setTrack(saved.track);
        if (saved.subject) setSubject(saved.subject);
      }
      if (!cancelled) setSelectionLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Persistence: save selection whenever it changes (after the initial restore) ----
  useEffect(() => {
    if (!selectionLoaded) return;
    storageSet("rafeeqi:selection", {
      stageId: stage?.id || null, grade: grade || null, track: track || null, subject: subject || null,
    });
  }, [selectionLoaded, stage, grade, track, subject]);

  // ---- Persistence: load this subject's saved chat whenever the active subject changes ----
  useEffect(() => {
    if (!selectionLoaded) return;
    if (!subject) { setChatLoaded(true); return; }
    setChatLoaded(false);
    let cancelled = false;
    (async () => {
      const saved = await storageGet(`rafeeqi:chat:${subject}`);
      if (!cancelled) {
        if (saved && Array.isArray(saved) && saved.length) setMessages(saved);
        else setMessages([{ role: "assistant", content: `أهلاً بك في رفيقي 👋 أنا هنا لأشرح لك مادة ${subject} مباشرة من المنهج الليبي، خطوة بخطوة. اسألني أي شيء!` }]);
        setChatLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [subject, selectionLoaded]);

  // ---- Persistence: save chat messages for the active subject whenever they change ----
  useEffect(() => {
    if (!chatLoaded || !subject) return;
    storageSet(`rafeeqi:chat:${subject}`, sanitizeMessagesForStorage(messages));
  }, [messages, chatLoaded, subject]);

  const currentSubjects = stage?.id === "middle" ? SUBJECTS.middle : track ? SUBJECTS.high[track] : null;

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const userText = input.trim() || "اشرح لي محتوى هذه المرفقات من فضلك.";
    const userMsg = { role: "user", content: userText, attachments };
    const newMsgs = [...messages, userMsg];
    setMessages(capMessages(newMsgs));
    setInput("");
    setAttachments([]);
    setLoading(true);

    const apiMessages = buildApiMessages(newMsgs);

    try {
      const sys = buildSystemPrompt(stage?.label, grade, track, subject);
      const reply = await callAI(apiMessages, sys, 1536);
      setMessages((prev) => capMessages([...prev, { role: "assistant", content: reply }]));
    } catch (e) {
      setMessages((prev) => capMessages([...prev, { role: "assistant", content: `⚠️ ${e?.message || "حدث خطأ في الاتصال، حاول مرة أخرى."}` }]));
    }
    setLoading(false);
  }, [input, loading, messages, attachments, stage, grade, track, subject]);

  const loadSummary = useCallback(async () => {
    if (!subject) return;
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const sys = buildSystemPrompt(stage?.label, grade, track, subject);
      const reply = await callAI(
        [{ role: "user", content: `اعطني ملخصاً شاملاً ومنظماً لمادة ${subject} ${grade ? `للصف ${grade}` : ""} حسب المنهج الليبي. اشمل أهم المفاهيم والقوانين والتعريفات مع أمثلة قصيرة موضحة. نظّم الملخص بعناوين قصيرة وفقرات مرتبة دون رموز Markdown ثقيلة.` }],
        sys,
        3000
      );
      setSummary(reply);
    } catch (e) {
      setSummaryError(e?.message || "تعذّر إنشاء الملخص، حاول مرة أخرى.");
    }
    setSummaryLoading(false);
  }, [subject, stage, grade, track]);

  useEffect(() => {
    if (tab === "summary" && !summary && !summaryLoading && subject) loadSummary();
  }, [tab, summary, summaryLoading, subject, loadSummary]);

  useEffect(() => { setSummary(null); setSummaryError(""); }, [subject, grade, stage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const stageData = STAGES.find((s) => s.id === stage?.id);

  return (
    <div dir="rtl" style={{
      minHeight: "100vh", background: "#030712",
      fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
      color: "#f1f5f9", display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        textarea:focus, input:focus { outline: none; }
        button:active { transform: scale(0.97); }
      `}</style>

      {showExam && subject && <MCQExam subject={subject} stage={stage?.label} grade={grade} track={track} onClose={() => setShowExam(false)} />}

      <div style={{
        background: "#0f172a", borderBottom: "1px solid #1e293b",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 14,
        position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 26 }}>🎓</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 19, color: "#fff", letterSpacing: "-0.5px" }}>رفيقي</div>
          <div style={{ fontSize: 11, color: "#4F9DFF", fontWeight: 500 }}>مساعد دراسي يتبع المنهج الليبي فقط — لا يؤلف من نفسه</div>
        </div>
        <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {aiStatus && (
            aiStatus.ok ? (
              <span title={`النموذج: ${aiStatus.model || ""}`} style={{
                background: "#052e1a", border: "1px solid #14532d", borderRadius: 20,
                padding: "4px 12px", fontSize: 11, color: "#4ade80", whiteSpace: "nowrap",
              }}>
                ● متصل عبر {aiStatus.label || aiStatus.provider}
              </span>
            ) : (
              <span title="لم يتم العثور على مفتاح API صالح في متغيرات البيئة على الخادم" style={{
                background: "#3a0d0d", border: "1px solid #7f1d1d", borderRadius: 20,
                padding: "4px 12px", fontSize: 11, color: "#fca5a5", whiteSpace: "nowrap",
              }}>
                ⚠️ لم يتم ضبط أي مفتاح API بعد
              </span>
            )
          )}
          {subject && (
            <>
              <span style={{ background: "#1e293b", borderRadius: 20, padding: "4px 14px", fontSize: 13, color: "#94a3b8" }}>
                {SUBJECT_ICONS[subject]} {subject} • {grade}
              </span>
              <button onClick={() => { setSubject(null); setGrade(null); setTrack(null); setStage(null); setAttachments([]); setSummary(null); }}
                style={{ background: "transparent", border: "1px solid #334155", borderRadius: 8, color: "#64748b", padding: "4px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                ↩ تغيير
              </button>
            </>
          )}
        </div>
      </div>

      {!subject ? (
        <div style={{ flex: 1, padding: 24, maxWidth: 700, margin: "0 auto", width: "100%" }}>
          {!stage && (
            <div>
              <div style={{ color: "#94a3b8", marginBottom: 20, textAlign: "center" }}>اختر مرحلتك الدراسية</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {STAGES.map((s) => (
                  <button key={s.id} onClick={() => setStage(s)} style={{
                    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16,
                    padding: "28px 20px", cursor: "pointer", color: "#f1f5f9",
                    fontFamily: "inherit", fontSize: 18, fontWeight: 700,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4F9DFF"; e.currentTarget.style.background = "#0c1f3a"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.background = "#0f172a"; }}>
                    <span style={{ fontSize: 38 }}>{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stage && !grade && (
            <div>
              <div style={{ color: "#94a3b8", marginBottom: 20, textAlign: "center" }}>اختر الصف — {stage.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stageData?.grades.map((g) => (
                  <button key={g} onClick={() => setGrade(g)} style={{
                    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
                    padding: "16px 20px", cursor: "pointer", color: "#f1f5f9",
                    fontFamily: "inherit", fontSize: 16, fontWeight: 600, textAlign: "right",
                    transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4F9DFF"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; }}>
                    📚 {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stage?.id === "high" && grade && !track && (
            <div>
              <div style={{ color: "#94a3b8", marginBottom: 20, textAlign: "center" }}>اختر التخصص</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {TRACKS.map((t) => (
                  <button key={t} onClick={() => setTrack(t)} style={{
                    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
                    padding: "20px 16px", cursor: "pointer", color: "#f1f5f9",
                    fontFamily: "inherit", fontSize: 15, fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4F9DFF"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; }}>
                    {t === "علمي" ? "⚗️" : t === "أدبي" ? "📖" : t === "علوم حياة" ? "🧬" : "📐"} {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {grade && (stage?.id === "middle" || track) && !subject && (
            <div>
              <div style={{ color: "#94a3b8", marginBottom: 20, textAlign: "center" }}>اختر المادة</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                {currentSubjects?.map((s) => (
                  <button key={s} onClick={() => setSubject(s)} style={{
                    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
                    padding: "16px 12px", cursor: "pointer", color: "#f1f5f9",
                    fontFamily: "inherit", fontSize: 14, fontWeight: 600,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4F9DFF"; e.currentTarget.style.background = "#0c1f3a"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.background = "#0f172a"; }}>
                    <span style={{ fontSize: 26 }}>{SUBJECT_ICONS[s] || "📘"}</span>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 32, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 16 }}>
            <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 10, fontWeight: 600 }}>📚 كتب المنهج الليبي</div>
            <a href={BOOKS_URL} target="_blank" rel="noreferrer" style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#1e293b", borderRadius: 10, padding: "10px 14px",
              color: "#4F9DFF", textDecoration: "none", fontSize: 14, fontWeight: 600,
            }}>
              🔗 الأمجاد — كتب الثانوية أدبي وعلمي (PDF)
            </a>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 860, margin: "0 auto", width: "100%" }}>

          <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#0f172a", overflowX: "auto" }}>
            {[
              { id: "chat", label: "💬 المساعد" },
              { id: "summary", label: "📄 الملخص" },
              { id: "exam", label: "✍️ امتحان 60 سؤال" },
              { id: "attach", label: "📎 رفع صورة/PDF" },
              { id: "sources", label: "🌐 مصادر" },
            ].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "12px 18px", border: "none", background: "transparent",
                color: tab === t.id ? "#4F9DFF" : "#64748b",
                borderBottom: `2px solid ${tab === t.id ? "#4F9DFF" : "transparent"}`,
                cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600,
                whiteSpace: "nowrap", transition: "all 0.2s",
              }}>{t.label}</button>
            ))}
          </div>

          {tab === "chat" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
              <div style={{ padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid #1e293b", flexWrap: "wrap" }}>
                {["اشرح لي القانون الأساسي", "حل مسألة نموذجية", "أهم ما سيأتي في الاختبار", "ملخص سريع للوحدة"].map((q) => (
                  <button key={q} onClick={() => setInput(q)} style={{
                    background: "#1e293b", border: "1px solid #334155", borderRadius: 20,
                    padding: "4px 10px", cursor: "pointer", color: "#94a3b8",
                    fontSize: 12, fontFamily: "inherit", transition: "all 0.15s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4F9DFF"; e.currentTarget.style.color = "#4F9DFF"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.color = "#94a3b8"; }}>
                    {q}
                  </button>
                ))}
              </div>

              <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: m.role === "user" ? "flex-start" : "flex-end",
                    alignItems: "flex-start", gap: 10,
                  }}>
                    {m.role === "assistant" && (
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎓</div>
                    )}
                    <div style={{
                      maxWidth: "78%", padding: "12px 16px", borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                      background: m.role === "user" ? "#1e3a5f" : "#0f172a",
                      border: `1px solid ${m.role === "user" ? "#2563eb44" : "#1e293b"}`,
                      color: "#f1f5f9", fontSize: 15, lineHeight: 1.7,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {(m.attachments || (m.attachment ? [m.attachment] : [])).map((att, ai) => (
                        <div key={ai} style={{ marginBottom: 4, fontSize: 12, color: "#4F9DFF", display: "flex", alignItems: "center", gap: 6 }}>
                          {att.type === "pdf" ? "📄" : "🖼️"} {att.name}
                        </div>
                      ))}
                      {m.content}
                    </div>
                    {m.role === "user" && (
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>👤</div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎓</div>
                    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "4px 16px 16px 16px", padding: "12px 16px" }}>
                      <Spinner label="رفيقي يكتب الشرح..." />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: 16, borderTop: "1px solid #1e293b", background: "#0f172a" }}>
                {attachments.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {attachments.map((att, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 10, padding: "5px 10px" }}>
                        <span style={{ fontSize: 12, color: "#4ade80" }}>{att.type === "pdf" ? "📄" : "🖼️"} {att.name}</span>
                        <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <label title={`إرفاق ملف (حتى ${MAX_ATTACHMENTS_PER_MESSAGE} ملفات)`} style={{
                    background: attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE ? "#0f172a" : "#1e293b",
                    border: "1px solid #334155", borderRadius: 12,
                    padding: "12px 14px", cursor: attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE ? "not-allowed" : "pointer",
                    color: attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE ? "#475569" : "#94a3b8", fontSize: 18,
                  }}>
                    📎
                    <input type="file" accept=".pdf,image/*" multiple style={{ display: "none" }}
                      disabled={attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                      onChange={async (e) => {
                        const newAtts = await processFiles(e.target.files, attachments.length);
                        if (newAtts.length) setAttachments((prev) => [...prev, ...newAtts].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
                        e.target.value = "";
                      }} />
                  </label>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`اسأل رفيقي عن ${subject}...`}
                    rows={2}
                    style={{
                      flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 12,
                      padding: "10px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 15,
                      resize: "none", lineHeight: 1.5,
                    }}
                  />
                  <button onClick={sendMessage} disabled={loading || (!input.trim() && attachments.length === 0)} style={{
                    background: loading || (!input.trim() && attachments.length === 0) ? "#1e293b" : "#2563eb",
                    border: "none", borderRadius: 12, padding: "12px 18px", cursor: "pointer",
                    color: "#fff", fontSize: 18, transition: "all 0.2s",
                  }}>
                    ←
                  </button>
                </div>
                <div style={{ color: "#475569", fontSize: 11, marginTop: 6, textAlign: "center" }}>
                  Enter للإرسال • Shift+Enter لسطر جديد • 📎 لإرفاق حتى {MAX_ATTACHMENTS_PER_MESSAGE} صور أو ملفات PDF من كتابك
                </div>
              </div>
            </div>
          )}

          {tab === "summary" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {summaryLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                  <Spinner label="جاري إنشاء الملخص..." />
                </div>
              ) : summaryError ? (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <div style={{ color: "#fca5a5", marginBottom: 14 }}>⚠️ {summaryError}</div>
                  <button onClick={loadSummary} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 22px", cursor: "pointer", color: "#fff", fontFamily: "inherit", fontWeight: 600 }}>إعادة المحاولة</button>
                </div>
              ) : summary ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ margin: 0, color: "#f1f5f9", fontSize: 18 }}>📄 ملخص {subject} — {grade}</h2>
                    <button onClick={() => { setSummary(null); loadSummary(); }} style={{
                      background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
                      padding: "6px 14px", cursor: "pointer", color: "#94a3b8", fontFamily: "inherit", fontSize: 13,
                    }}>🔄 تحديث</button>
                  </div>
                  <div style={{
                    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16,
                    padding: 24, color: "#f1f5f9", lineHeight: 1.9, fontSize: 15, whiteSpace: "pre-wrap",
                  }}>{summary}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <button onClick={loadSummary} style={{
                    background: "#2563eb", border: "none", borderRadius: 12,
                    padding: "14px 28px", cursor: "pointer", color: "#fff",
                    fontFamily: "inherit", fontSize: 16, fontWeight: 700,
                  }}>📄 إنشاء ملخص {subject}</button>
                </div>
              )}
            </div>
          )}

          {tab === "exam" && (
            <div style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 20, padding: 32, maxWidth: 500, width: "100%", textAlign: "center" }}>
                <div style={{ fontSize: 52 }}>✍️</div>
                <h2 style={{ color: "#f1f5f9", margin: "12px 0 8px" }}>امتحان {subject}</h2>
                <div style={{ color: "#94a3b8", marginBottom: 18, lineHeight: 1.7, fontSize: 14 }}>
                  60 سؤال اختيار من متعدد على نمط الامتحان الرسمي، تغطي أهم مواضيع المادة<br />
                  ⏱ المدة: 90 دقيقة • مع شرح معمّق لكل خطأ
                </div>
                {MCQ_BANK[subject] && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 20 }}>
                    {[...new Set(MCQ_BANK[subject].map((q) => q.topic))].slice(0, 8).map((t) => (
                      <span key={t} style={{ background: "#1e293b", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#4F9DFF" }}>{t}</span>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowExam(true)} style={{
                  background: "#2563eb", border: "none", borderRadius: 14,
                  padding: "14px 32px", cursor: "pointer", color: "#fff",
                  fontFamily: "inherit", fontSize: 17, fontWeight: 700, width: "100%",
                }}>
                  🚀 ابدأ الامتحان
                </button>
              </div>
            </div>
          )}

          {tab === "attach" && (
            <div style={{ flex: 1, padding: 24, maxWidth: 600, margin: "0 auto", width: "100%" }}>
              <h3 style={{ color: "#f1f5f9", marginBottom: 16 }}>📎 رفع صورة أو ملف PDF</h3>
              <AttachmentUploader onAttach={(atts) => { setAttachments((prev) => [...prev, ...atts].slice(0, MAX_ATTACHMENTS_PER_MESSAGE)); setTab("chat"); }} />
              <div style={{ marginTop: 20, color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
                💡 يمكنك إرفاق:
                <br />• صورة لمسألة في كتابك أو دفترك ليتم شرحها
                <br />• صفحة من الكتاب المدرسي للسؤال عنها
                <br />• ملف PDF كامل لفصل أو وحدة
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 10 }}>🔗 رابط مباشر للكتب:</div>
                <a href={BOOKS_URL} target="_blank" rel="noreferrer" style={{
                  display: "flex", alignItems: "center", gap: 10, background: "#0f172a",
                  border: "1px solid #1e293b", borderRadius: 12, padding: "12px 16px",
                  color: "#4F9DFF", textDecoration: "none", fontSize: 14, fontWeight: 600,
                }}>
                  📚 كتب الثانوية الليبية (أدبي وعلمي) — الأمجاد
                </a>
              </div>
            </div>
          )}

          {tab === "sources" && (
            <div style={{ flex: 1, padding: 24 }}>
              <h3 style={{ color: "#f1f5f9", marginBottom: 8 }}>🌐 مصادر موثوقة للمنهج الليبي</h3>
              <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20, lineHeight: 1.7 }}>
                رفيقي لا يؤلف الإجابات من ذاكرته الخاصة — بل يستند إلى كتب المنهج الرسمية وهذه المصادر الموثوقة.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {TRUSTED_SOURCES.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer" style={{
                    display: "flex", alignItems: "center", gap: 14,
                    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14,
                    padding: "14px 18px", textDecoration: "none", transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4F9DFF"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; }}>
                    <span style={{ fontSize: 26 }}>{s.icon}</span>
                    <div>
                      <div style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                      <div style={{ color: "#4F9DFF", fontSize: 11, marginTop: 2 }}>{s.url}</div>
                    </div>
                    <span style={{ marginRight: "auto", color: "#4F9DFF", fontSize: 18 }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
