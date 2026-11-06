// src/commands/issue.ts
/**
 * Tycho Forge - Issue, Milestone & Label Commands
 * @license AGPL-3.0-only
 */

import { readFileSync } from "fs";
import type { GitForgeDriver } from "../drivers/driver.interface.ts";

interface RoadmapFile {
  milestones?: { key: string; title: string; description?: string }[];
  labels?: { name: string; color: string }[];
  issues: { title: string; body?: string; milestone?: string; labels?: string[] }[];
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function requireIssueSupport(driver: GitForgeDriver): Required<
  Pick<GitForgeDriver, "issueList" | "issueCreate" | "milestoneList" | "milestoneCreate" | "labelList" | "labelCreate">
> {
  const d = driver as any;
  for (const m of ["issueList", "issueCreate", "milestoneList", "milestoneCreate", "labelList", "labelCreate"]) {
    if (typeof d[m] !== "function") {
      throw new Error(`Issue commands are not supported yet by the ${driver.forgeType} driver.`);
    }
  }
  return {
    issueList: d.issueList.bind(d),
    issueCreate: d.issueCreate.bind(d),
    milestoneList: d.milestoneList.bind(d),
    milestoneCreate: d.milestoneCreate.bind(d),
    labelList: d.labelList.bind(d),
    labelCreate: d.labelCreate.bind(d),
  };
}

export async function handleIssueCommand(driver: GitForgeDriver, args: string[]): Promise<void> {
  const action = args[0] || "list";
  const repo = `${driver.context.owner}/${driver.context.repo}`;

  switch (action) {
    case "list": {
      const api = requireIssueSupport(driver);
      const state = (flag(args, "--state") as "open" | "closed" | "all") || "open";
      const issues = await api.issueList({ state });
      if (!issues.length) {
        console.log(`No ${state} issues on ${repo}.`);
        break;
      }
      for (const i of issues) {
        const meta = [i.milestone, ...i.labels].filter(Boolean).join(", ");
        console.log(`#${String(i.number).padEnd(4)} ${i.title}${meta ? `  \x1b[90m[${meta}]\x1b[0m` : ""}`);
      }
      break;
    }

    case "create": {
      const api = requireIssueSupport(driver);
      const title = flag(args, "--title");
      if (!title) {
        console.error('Usage: tycho forge issue create --title "<title>" [--body "<md>"] [--label a,b] [--milestone "<title>"]');
        process.exit(1);
      }
      const labelNames = (flag(args, "--label") || "").split(",").map((s) => s.trim()).filter(Boolean);
      const labels = new Map((await api.labelList()).map((l) => [l.name, l.id]));
      const missing = labelNames.filter((n) => !labels.has(n));
      if (missing.length) throw new Error(`Unknown label(s): ${missing.join(", ")}`);

      const msTitle = flag(args, "--milestone");
      let milestoneId: number | undefined;
      if (msTitle) {
        milestoneId = (await api.milestoneList()).find((m) => m.title === msTitle)?.id;
        if (milestoneId === undefined) throw new Error(`Unknown milestone: ${msTitle}`);
      }

      const issue = await api.issueCreate({
        title,
        body: flag(args, "--body"),
        labelIds: labelNames.map((n) => labels.get(n)!),
        milestoneId,
      });
      console.log(`\x1b[32m✔\x1b[0m #${issue.number} ${issue.title}\n${issue.url}`);
      break;
    }

    case "import": {
      // Idempotent bulk import: milestones, labels and issues are matched by title/name.
      const file = args[1];
      if (!file) {
        console.error("Usage: tycho forge issue import <roadmap.json> [--dry-run]");
        process.exit(1);
      }
      const dry = args.includes("--dry-run");
      const data = JSON.parse(readFileSync(file, "utf-8")) as RoadmapFile;
      const api = requireIssueSupport(driver);
      console.log(`\x1b[34m[tycho-forge]\x1b[0m Importing ${file} into ${repo}${dry ? " (dry-run)" : ""}...`);

      const milestones = new Map((await api.milestoneList()).map((m) => [m.title, m.id]));
      const msByKey = new Map<string, number | undefined>();
      for (const m of data.milestones || []) {
        if (!milestones.has(m.title)) {
          console.log(`  + milestone ${m.title}`);
          if (!dry) milestones.set(m.title, (await api.milestoneCreate(m.title, m.description)).id);
        }
        msByKey.set(m.key, milestones.get(m.title));
      }

      const labels = new Map((await api.labelList()).map((l) => [l.name, l.id]));
      for (const l of data.labels || []) {
        if (!labels.has(l.name)) {
          console.log(`  + label ${l.name}`);
          if (!dry) labels.set(l.name, (await api.labelCreate(l.name, l.color)).id);
        }
      }

      const existing = new Set((await api.issueList({ state: "all", limit: 200 })).map((i) => i.title));
      let created = 0;
      for (const i of data.issues) {
        if (existing.has(i.title)) {
          console.log(`  = ${i.title}`);
          continue;
        }
        console.log(`  + ${i.milestone ? `[${i.milestone}] ` : ""}${i.title}`);
        if (dry) continue;
        await api.issueCreate({
          title: i.title,
          body: i.body,
          milestoneId: i.milestone ? msByKey.get(i.milestone) ?? milestones.get(i.milestone) : undefined,
          labelIds: (i.labels || []).map((n) => labels.get(n)).filter((id): id is number => id !== undefined),
        });
        created++;
      }
      console.log(`\x1b[32m✔\x1b[0m ${dry ? "Dry-run complete" : `${created} issue(s) created`}.`);
      break;
    }

    default:
      console.log(`
Usage: tycho forge issue <action> [options]

Actions:
  list [--state open|closed|all]                         List issues
  create --title <t> [--body <md>] [--label a,b] [--milestone <title>]
  import <roadmap.json> [--dry-run]                      Idempotent bulk import (milestones, labels, issues)
`);
      break;
  }
}
