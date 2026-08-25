import { parseReplayDate } from "../src/parse-replay-date";

/** Real Windows CultureInfo `g` outputs for 2024-08-27 18:12 (from local dump). */
const windowsGeneral: Array<[string, string, string | null]> = [
    ["en-US", "8/27/2024 6:12 PM", "2024-08-27T18:12:00"],
    ["en-GB", "27/08/2024 18:12", "2024-08-27T18:12:00"],
    ["en-AU", "27/08/2024 6:12 PM", "2024-08-27T18:12:00"],
    ["en-CA", "2024-08-27 6:12 PM", "2024-08-27T18:12:00"],
    ["nl-NL", "27-8-2024 18:12", "2024-08-27T18:12:00"],
    ["de-DE", "27.08.2024 18:12", "2024-08-27T18:12:00"],
    ["fr-FR", "27/08/2024 18:12", "2024-08-27T18:12:00"],
    ["es-MX", "27/08/2024 06:12 p. m.", "2024-08-27T18:12:00"],
    ["fi-FI", "27.8.2024 18.12", "2024-08-27T18:12:00"],
    ["sk-SK", "27. 8. 2024 18:12", "2024-08-27T18:12:00"],
    ["hu-HU", "2024. 08. 27. 18:12", "2024-08-27T18:12:00"],
    ["bg-BG", "27.8.2024 г. 18:12", "2024-08-27T18:12:00"],
    ["hr-HR", "27.8.2024. 18:12", "2024-08-27T18:12:00"],
    ["el-GR", "27/8/2024 6:12 μμ", "2024-08-27T18:12:00"],
    ["vi-VN", "27/08/2024 6:12 CH", "2024-08-27T18:12:00"],
    ["id-ID", "27/08/2024 18.12", "2024-08-27T18:12:00"],
    ["ms-MY", "27/08/2024 6:12 PTG", "2024-08-27T18:12:00"],
    ["ja-JP", "2024/08/27 18:12", "2024-08-27T18:12:00"],
    ["ko-KR", "2024-08-27 오후 6:12", "2024-08-27T18:12:00"],
    ["ko-KR legacy", "24-08-27(화) 오후 6:12", "2024-08-27T18:12:00"],
    ["zh-CN", "2024/8/27 18:12", "2024-08-27T18:12:00"],
    ["zh-TW", "2024/8/27 下午 06:12", "2024-08-27T18:12:00"],
    ["zh-HK", "27/8/2024 18:12", "2024-08-27T18:12:00"],
    ["mn-MN", "2024.08.27 18:12", "2024-08-27T18:12:00"],
    ["th-TH Buddhist", "27/8/2567 18:12", "2024-08-27T18:12:00"],
    ["ja kanji", "2024年8月27日 18:12", "2024-08-27T18:12:00"],
    ["zh kanji", "2024年8月27日 下午 6:12", "2024-08-27T18:12:00"],
    // Non-Gregorian: must fall back to raw (null expected means unchanged)
    ["ar-SA Hijri", "23/02/46 06:12 م", null],
    ["fa-IR Persian", "06/06/1403 06:12 ب.ظ", null],
];

let fail = 0;
for (const [locale, input, expected] of windowsGeneral) {
    const got = parseReplayDate(input);
    const ok = expected === null ? got === input : got === expected;
    if (!ok) fail++;
    console.log(
        `${ok ? "OK  " : "FAIL"} [${locale}] ${JSON.stringify(input)} => ${JSON.stringify(got)}` +
            (expected && !ok ? ` (want ${expected})` : ""),
    );
}
console.log(`\n${windowsGeneral.length - fail}/${windowsGeneral.length} passed`);
process.exit(fail > 0 ? 1 : 0);
