import { describe, it, expect } from "vitest";
import { detectPlatform } from "@/lib/automation/inspector";

describe("detectPlatform", () => {
  const cases: [string, string][] = [
    ["https://www.linkedin.com/jobs/view/123", "linkedin"],
    ["https://boards.greenhouse.io/acme/jobs/1", "greenhouse"],
    ["https://jobs.lever.co/acme/abc", "lever"],
    ["https://acme.wd5.myworkdayjobs.com/en-US/External/job/x", "workday"],
    ["https://www.indeed.com/viewjob?jk=abc", "indeed"],
    ["https://jobs.ashbyhq.com/acme/role", "ashby"],
    ["https://jobs.smartrecruiters.com/Acme/123", "smartrecruiters"],
    ["https://careers.example.com/apply/42", "generic"],
  ];
  it.each(cases)("maps %s -> %s", (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(detectPlatform("HTTPS://WWW.LINKEDIN.COM/jobs/1")).toBe("linkedin");
  });
});
