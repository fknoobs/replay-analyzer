/**
 * Parse Company of Heroes replay header date strings.
 *
 * Replays store the recorder's local Windows short-date + short-time (`g`),
 * so formats vary by culture. This parser targets Gregorian Windows locales
 * worldwide; non-Gregorian calendars (Hijri, Persian) fall back to the raw
 * string. Thai Buddhist years (>= 2400) are converted to Gregorian.
 *
 * Returns timezone-naive ISO local datetime `YYYY-MM-DDTHH:mm:ss`.
 */
const MONTH_NAMES = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};
/** AM/PM designators seen across Windows cultures (matched case-insensitively where Latin). */
const MERIDIEM_AM = [
    "AM",
    "A.M.",
    "A. M.",
    "A",
    "AM.",
    "오전",
    "午前",
    "上午",
    "SA", // vi-VN
    "PG", // ms-MY
    "πμ", // el-GR
    "ΠΜ",
    "ص", // ar
    "ق.ظ", // fa-IR
    "ap.", // fi-FI
    "ap",
    "de.", // hu-HU
    "de",
];
const MERIDIEM_PM = [
    "PM",
    "P.M.",
    "P. M.",
    "P",
    "PM.",
    "오후",
    "午後",
    "下午",
    "CH", // vi-VN
    "PTG", // ms-MY
    "μμ", // el-GR
    "ΜΜ",
    "م", // ar
    "ب.ظ", // fa-IR
    "ip.", // fi-FI
    "ip",
    "du.", // hu-HU
    "du",
];
const pad = (n) => n.toString().padStart(2, "0");
const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysInMonth = (year, month) => {
    const lengths = [
        31,
        isLeap(year) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    return lengths[month - 1] ?? 0;
};
const isValidParts = (year, month, day, hour, minute, second) => {
    if (year < 1990 || year > 2100)
        return false;
    if (month < 1 || month > 12)
        return false;
    if (day < 1 || day > daysInMonth(year, month))
        return false;
    if (hour < 0 || hour > 23)
        return false;
    if (minute < 0 || minute > 59)
        return false;
    if (second < 0 || second > 59)
        return false;
    return true;
};
const formatIsoLocal = (year, month, day, hour, minute, second) => {
    if (!isValidParts(year, month, day, hour, minute, second))
        return null;
    return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
};
/** Thai Buddhist years appear as 2400+ on Windows th-TH. */
const toGregorianYear = (year) => {
    if (year >= 2400 && year <= 2600)
        return year - 543;
    if (year < 100)
        return 2000 + year;
    return year;
};
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildMeridiemAlternation = (markers) => [...markers]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
const MERIDIEM_AM_RE = buildMeridiemAlternation(MERIDIEM_AM);
const MERIDIEM_PM_RE = buildMeridiemAlternation(MERIDIEM_PM);
const MERIDIEM_ANY_RE = `${MERIDIEM_AM_RE}|${MERIDIEM_PM_RE}`;
const normalizeMeridiem = (raw) => {
    if (!raw)
        return undefined;
    const trimmed = raw.replace(/\u202F/g, " ").replace(/\s+/g, " ").trim();
    const compact = trimmed.replace(/\s/g, "").toUpperCase();
    // Fast Latin paths
    if (/^A\.?M\.?$/.test(compact) || compact === "A")
        return "AM";
    if (/^P\.?M\.?$/.test(compact) || compact === "P")
        return "PM";
    for (const m of MERIDIEM_AM) {
        if (m.toUpperCase() === trimmed.toUpperCase() || m === trimmed)
            return "AM";
        if (m.replace(/\s/g, "").toUpperCase() === compact)
            return "AM";
    }
    for (const m of MERIDIEM_PM) {
        if (m.toUpperCase() === trimmed.toUpperCase() || m === trimmed)
            return "PM";
        if (m.replace(/\s/g, "").toUpperCase() === compact)
            return "PM";
    }
    return undefined;
};
const applyMeridiem = (hour, meridiem) => {
    if (hour < 0 || hour > 23)
        return null;
    const m = normalizeMeridiem(meridiem);
    if (!m)
        return hour;
    if (hour > 12)
        return null;
    if (m === "AM")
        return hour === 12 ? 0 : hour;
    return hour === 12 ? 12 : hour + 12;
};
/**
 * Ambiguous day/month when both <= 12:
 * - Known meridiem + `/` → prefer MDY (en-US). Note: en-AU also uses AM/PM with DMY;
 *   those stay ambiguous when both parts are <= 12.
 * - `.` or `-` separators → prefer DMY (most of Europe / Asia).
 * - Otherwise DMY (majority of Gregorian Windows cultures).
 */
const resolveDayMonth = (a, b, separator, hasMeridiem) => {
    if (a < 1 || b < 1)
        return null;
    if (a > 12 && b > 12)
        return null;
    if (a > 12)
        return b <= 12 ? { day: a, month: b } : null;
    if (b > 12)
        return { day: b, month: a };
    if (hasMeridiem && separator === "/")
        return { day: b, month: a }; // MDY
    return { day: a, month: b }; // DMY
};
const parseTimeAndMeridiem = (timeRaw) => {
    const trimmed = timeRaw.trim();
    // Meridiem before time (ko/zh/ja): "오후 6:12", "下午 06:12"
    const before = trimmed.match(new RegExp(`^(${MERIDIEM_ANY_RE})\\s*(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?$`, "i"));
    if (before && normalizeMeridiem(before[1])) {
        const hour = Number(before[2]);
        const minute = Number(before[3]);
        const second = before[4] ? Number(before[4]) : 0;
        const adjusted = applyMeridiem(hour, before[1]);
        if (adjusted === null || minute > 59 || second > 59)
            return null;
        return { hour: adjusted, minute, second, meridiem: before[1] };
    }
    // Meridiem after time: "6:12 PM", "06:12 p. m.", "6:12 CH", "18.12"
    const after = trimmed.match(new RegExp(`^(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?\\s*(${MERIDIEM_ANY_RE})?$`, "i"));
    if (!after)
        return null;
    const hour = Number(after[1]);
    const minute = Number(after[2]);
    const second = after[3] ? Number(after[3]) : 0;
    const meridiem = after[4];
    const adjusted = applyMeridiem(hour, meridiem);
    if (adjusted === null || minute > 59 || second > 59)
        return null;
    // 24h times must not carry a meridiem we failed to classify
    if (meridiem && !normalizeMeridiem(meridiem))
        return null;
    return { hour: adjusted, minute, second, meridiem };
};
/** Strip parenthesized weekday and culture suffixes like Bulgarian "г." */
const stripDecorations = (raw) => raw
    .replace(/\([^)]*\)/g, " ")
    // bg-BG appends "г." (годina); `\b` does not work with Cyrillic
    .replace(/\s*г\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/**
 * Normalize spaced / trailing-dot Windows patterns:
 * - sk-SK: "27. 8. 2024" → "27.8.2024"
 * - hu-HU: "2024. 08. 27." → "2024.08.27"
 * - hr-HR: "27.8.2024." → "27.8.2024"
 */
const normalizeNumericDatePart = (datePart) => {
    let s = datePart.trim();
    // Collapse "d. M. yyyy" / "yyyy. MM. dd." spacing around dots
    s = s.replace(/\s*\.\s*/g, ".");
    // Trailing dot after final component (hu/hr/sr)
    s = s.replace(/\.$/, "");
    return s;
};
const parseNumericDate = (raw) => {
    const hadWeekday = /\([^)]*\)/.test(raw);
    const cleaned = stripDecorations(raw);
    const timeSep = cleaned.search(new RegExp(`\\s+(?:(?:${MERIDIEM_ANY_RE})\\s*)?\\d{1,2}[:.]\\d{2}`, "i"));
    if (timeSep === -1)
        return null;
    const datePart = normalizeNumericDatePart(cleaned.slice(0, timeSep));
    const timePart = cleaned.slice(timeSep).trim();
    const time = parseTimeAndMeridiem(timePart);
    if (!time)
        return null;
    const hasMeridiem = Boolean(normalizeMeridiem(time.meridiem));
    const meridiemIsCjk = Boolean(time.meridiem && /^(오전|오후|午前|午後|上午|下午)$/.test(time.meridiem));
    // Year-first: 2024-08-27, 24-08-27, 2024/8/27, 2024.08.27
    const yearFirst = datePart.match(/^(\d{2,4})([./\-])(\d{1,2})\2(\d{1,2})$/);
    if (yearFirst) {
        const yearToken = yearFirst[1];
        const monthToken = yearFirst[3];
        const dayToken = yearFirst[4];
        const year = toGregorianYear(Number(yearToken));
        const month = Number(monthToken);
        const day = Number(dayToken);
        const acceptTwoDigitYear = yearToken.length === 4 ||
            hadWeekday ||
            meridiemIsCjk ||
            (monthToken.length === 2 && dayToken.length === 2);
        if (yearToken.length > 2 || acceptTwoDigitYear) {
            const formatted = formatIsoLocal(year, month, day, time.hour, time.minute, time.second);
            if (formatted)
                return formatted;
        }
    }
    // Day/month + year: 27-8-2024, 27/08/2024, 27.8.2567 (Thai)
    const dmyOrMdy = datePart.match(/^(\d{1,2})([./\-])(\d{1,2})\2(\d{2,4})$/);
    if (dmyOrMdy) {
        const yearToken = dmyOrMdy[4];
        // Hijri (ar-SA) uses 2-digit years with ص/م — do not invent a Gregorian year.
        if (yearToken.length <= 2 &&
            time.meridiem &&
            /^(ص|م)$/.test(time.meridiem)) {
            return null;
        }
        const a = Number(dmyOrMdy[1]);
        const separator = dmyOrMdy[2];
        const b = Number(dmyOrMdy[3]);
        const year = toGregorianYear(Number(yearToken));
        const resolved = resolveDayMonth(a, b, separator, hasMeridiem);
        if (!resolved)
            return null;
        return formatIsoLocal(year, resolved.month, resolved.day, time.hour, time.minute, time.second);
    }
    return null;
};
/** CJK explicit markers: 2024年8月27日 [下午] 6:12 */
const parseCjkKanjiDate = (raw) => {
    const match = raw.match(new RegExp(`^(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日\\s*(?:(${MERIDIEM_ANY_RE})\\s*)?(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?$`, "i"));
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const meridiem = match[4];
    const hour = Number(match[5]);
    const minute = Number(match[6]);
    const second = match[7] ? Number(match[7]) : 0;
    const adjusted = applyMeridiem(hour, meridiem);
    if (adjusted === null)
        return null;
    return formatIsoLocal(year, month, day, adjusted, minute, second);
};
const parseMonthNameDate = (raw) => {
    const monthFirst = raw.match(new RegExp(`^([A-Za-z]+)\\s+(\\d{1,2}),?\\s+(\\d{4})\\s+(\\d{1,2}[:.]\\d{2}(?:[:.]\\d{2})?(?:\\s*(?:${MERIDIEM_ANY_RE}))?)$`, "i"));
    if (monthFirst) {
        const month = MONTH_NAMES[monthFirst[1].toLowerCase()];
        if (!month)
            return null;
        const day = Number(monthFirst[2]);
        const year = toGregorianYear(Number(monthFirst[3]));
        const time = parseTimeAndMeridiem(monthFirst[4]);
        if (!time)
            return null;
        return formatIsoLocal(year, month, day, time.hour, time.minute, time.second);
    }
    const dayFirst = raw.match(new RegExp(`^(\\d{1,2})\\s+([A-Za-z]+)\\s+(\\d{4})\\s+(\\d{1,2}[:.]\\d{2}(?:[:.]\\d{2})?(?:\\s*(?:${MERIDIEM_ANY_RE}))?)$`, "i"));
    if (dayFirst) {
        const day = Number(dayFirst[1]);
        const month = MONTH_NAMES[dayFirst[2].toLowerCase()];
        if (!month)
            return null;
        const year = toGregorianYear(Number(dayFirst[3]));
        const time = parseTimeAndMeridiem(dayFirst[4]);
        if (!time)
            return null;
        return formatIsoLocal(year, month, day, time.hour, time.minute, time.second);
    }
    return null;
};
const normalizeDateString = (raw) => raw
    .replace(/[\u00A0\u202F\u2007\u2009\u200A\u2008]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/**
 * Parses a Company of Heroes replay header date string into a timezone-naive
 * ISO local datetime `YYYY-MM-DDTHH:mm:ss`.
 *
 * Replays store the recorder's local Windows short-date + short-time (`g`),
 * so formats vary by culture. This targets Gregorian Windows locales worldwide
 * (DMY / MDY / YMD, CJK meridiems, Thai Buddhist years ≥ 2400 → Gregorian).
 * Non-Gregorian calendars (Hijri, Persian) fall back to the raw string.
 * Ambiguous day/month pairs with `/` + AM/PM prefer MDY (en-US); note en-AU
 * DMY + AM/PM can still be ambiguous when both parts are ≤ 12.
 *
 * Used automatically by the header parser; export for custom tooling.
 *
 * @param raw - Date string as stored in the replay preamble (UTF-16 decoded).
 * @returns Normalized `YYYY-MM-DDTHH:mm:ss`, or the original string when
 *   unrecognized / non-Gregorian.
 *
 * @example
 * parseReplayDate("26/07/2026 19:47"); // "2026-07-26T19:47:00"
 * parseReplayDate("11/12/2025 16:26"); // "2025-12-11T16:26:00" (DMY)
 */
export const parseReplayDate = (raw) => {
    const normalized = normalizeDateString(raw);
    if (!normalized)
        return raw;
    return (parseCjkKanjiDate(normalized) ??
        parseNumericDate(normalized) ??
        parseMonthNameDate(normalized) ??
        normalized);
};
