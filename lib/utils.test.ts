import { describe, expect, it } from "vitest";
import { elapsedMinutes, normalizeName, parseTime, slugify, timeToMinutes } from "./utils";

describe("transport utilities", () => {
  it("normalizes place names and creates stable slugs", () => {
    expect(normalizeName("  Sulthan-Bathery  ")).toBe("sulthan bathery");
    expect(slugify("Thalapuzha Bus Stand")).toBe("thalapuzha-bus-stand");
  });
  it("parses 12-hour and 24-hour times", () => {
    expect(timeToMinutes("12:15 am")).toBe(15);
    expect(timeToMinutes("12:15 pm")).toBe(735);
    expect(timeToMinutes("18:40")).toBe(1120);
    expect(parseTime("25:99").valid).toBe(false);
  });
  it("handles trips crossing midnight", () => {
    expect(elapsedMinutes("23:50", "00:20")).toBe(30);
    expect(elapsedMinutes("11:50 pm", "12:20 am")).toBe(30);
  });
});
