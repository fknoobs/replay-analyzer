import { describe, expect, it } from "vitest";
import { parseReplayDate } from "./parse-replay-date";

describe("parseReplayDate", () => {
    it("parses European DMY with dashes (ambiguous month/day)", () => {
        // Filenames confirm: 2026-03-06 and 2026-02-05
        expect(parseReplayDate("6-3-2026 23:43")).toBe("2026-03-06T23:43:00");
        expect(parseReplayDate("5-2-2026 00:40")).toBe("2026-02-05T00:40:00");
        expect(parseReplayDate("23-2-2026 17:55")).toBe("2026-02-23T17:55:00");
        expect(parseReplayDate("28-6-2026 02:38")).toBe("2026-06-28T02:38:00");
    });

    it("parses European DMY with slashes", () => {
        // Filename 2025_12_11 → 11/12/2025 is 11 Dec, not 12 Nov
        expect(parseReplayDate("11/12/2025 16:26")).toBe("2025-12-11T16:26:00");
        expect(parseReplayDate("26/07/2026 19:47")).toBe("2026-07-26T19:47:00");
    });

    it("parses European DMY with dots", () => {
        expect(parseReplayDate("11.12.2025 16:26")).toBe("2025-12-11T16:26:00");
        expect(parseReplayDate("5.2.2026 00:40")).toBe("2026-02-05T00:40:00");
    });

    it("parses Korean Windows dates (yy-MM-dd + weekday + 오전/오후)", () => {
        // Raw from 4_duclair_240827612_gagzjp7i97.rec
        expect(parseReplayDate("24-08-27(화) 오후 6:12")).toBe("2024-08-27T18:12:00");
        expect(parseReplayDate("24-08-27(화) 오전 6:12")).toBe("2024-08-27T06:12:00");
        expect(parseReplayDate("2024-08-27 오후 6:12")).toBe("2024-08-27T18:12:00");
        expect(parseReplayDate("24-08-27 오후 12:00")).toBe("2024-08-27T12:00:00");
        expect(parseReplayDate("24-08-27 오전 12:00")).toBe("2024-08-27T00:00:00");
    });

    it("parses worldwide Windows general short formats", () => {
        expect(parseReplayDate("27/08/2024 06:12 p. m.")).toBe("2024-08-27T18:12:00"); // es-MX
        expect(parseReplayDate("27.8.2024 18.12")).toBe("2024-08-27T18:12:00"); // fi-FI
        expect(parseReplayDate("27. 8. 2024 18:12")).toBe("2024-08-27T18:12:00"); // sk-SK
        expect(parseReplayDate("2024. 08. 27. 18:12")).toBe("2024-08-27T18:12:00"); // hu-HU
        expect(parseReplayDate("27.8.2024 г. 18:12")).toBe("2024-08-27T18:12:00"); // bg-BG
        expect(parseReplayDate("27.8.2024. 18:12")).toBe("2024-08-27T18:12:00"); // hr-HR
        expect(parseReplayDate("27/8/2024 6:12 μμ")).toBe("2024-08-27T18:12:00"); // el-GR
        expect(parseReplayDate("27/08/2024 6:12 CH")).toBe("2024-08-27T18:12:00"); // vi-VN
        expect(parseReplayDate("27/08/2024 6:12 PTG")).toBe("2024-08-27T18:12:00"); // ms-MY
        expect(parseReplayDate("27/08/2024 18.12")).toBe("2024-08-27T18:12:00"); // id-ID
        expect(parseReplayDate("2024/8/27 下午 06:12")).toBe("2024-08-27T18:12:00"); // zh-TW
        expect(parseReplayDate("27/8/2567 18:12")).toBe("2024-08-27T18:12:00"); // th-TH Buddhist
        expect(parseReplayDate("2024年8月27日 下午 6:12")).toBe("2024-08-27T18:12:00");
    });

    it("leaves non-Gregorian calendar dates as raw strings", () => {
        expect(parseReplayDate("23/02/46 06:12 م")).toBe("23/02/46 06:12 م"); // ar-SA Hijri
        expect(parseReplayDate("06/06/1403 06:12 ب.ظ")).toBe("06/06/1403 06:12 ب.ظ"); // fa-IR
    });

    it("parses Japanese/Chinese meridiem markers", () => {
        expect(parseReplayDate("24-08-27(火) 午後 6:12")).toBe("2024-08-27T18:12:00");
        expect(parseReplayDate("2024-08-27 上午 6:12")).toBe("2024-08-27T06:12:00");
        expect(parseReplayDate("2024-08-27 下午 6:12")).toBe("2024-08-27T18:12:00");
    });

    it("parses year-first / ISO-like dates with 12-hour clock", () => {
        expect(parseReplayDate("2026-08-25 2:49 AM")).toBe("2026-08-25T02:49:00");
        expect(parseReplayDate("2026-08-25 2:49 PM")).toBe("2026-08-25T14:49:00");
        expect(parseReplayDate("2025/12/11 16:26")).toBe("2025-12-11T16:26:00");
    });

    it("prefers MDY when AM/PM is present (US short date)", () => {
        expect(parseReplayDate("12/11/2025 4:26 PM")).toBe("2025-12-11T16:26:00");
        expect(parseReplayDate("3/6/2026 11:05 AM")).toBe("2026-03-06T11:05:00");
    });

    it("handles noon/midnight edge cases for AM/PM", () => {
        expect(parseReplayDate("2026-01-01 12:00 AM")).toBe("2026-01-01T00:00:00");
        expect(parseReplayDate("2026-01-01 12:00 PM")).toBe("2026-01-01T12:00:00");
    });

    it("parses optional seconds", () => {
        expect(parseReplayDate("23-2-2026 17:55:31")).toBe("2026-02-23T17:55:31");
        expect(parseReplayDate("2026-08-25 2:49:05 AM")).toBe("2026-08-25T02:49:05");
    });

    it("parses English month-name formats", () => {
        expect(parseReplayDate("December 11, 2025 4:26 PM")).toBe(
            "2025-12-11T16:26:00",
        );
        expect(parseReplayDate("11 December 2025 16:26")).toBe("2025-12-11T16:26:00");
    });

    it("normalizes Unicode spaces and preserves wall-clock time (no UTC shift)", () => {
        expect(parseReplayDate("26/07/2026\u00A019:47")).toBe("2026-07-26T19:47:00");
        // Must not convert local 19:47 → UTC
        expect(parseReplayDate("26/07/2026 19:47")).not.toMatch(/Z$/);
    });

    it("falls back to the original string when unparseable", () => {
        expect(parseReplayDate("not a date")).toBe("not a date");
        expect(parseReplayDate("32/13/2026 99:99")).toBe("32/13/2026 99:99");
    });
});
