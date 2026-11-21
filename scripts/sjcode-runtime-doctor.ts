// @effect-diagnostics nodeBuiltinImport:off - Standalone read-only diagnostic CLI; plain Node fs/child_process/path keeps it dependency-free.
// SJCode Runtime Doctor — read-only developer-environment diagnosis.
// Ported from the AionUi fork's Runtime Doctor model (PR-07) so the capability
// survives the t3code rebase. It never sends project contents anywhere.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export type ProjectFileNode = {
  name: string;
  fullPath?: string;
  isDir: boolean;
  children?: ProjectFileNode[];
};

export type ProjectStackSummary = {
  git: boolean;
  rust: boolean;
  node: boolean;
  mavenModules: number;
  gradleModules: number;
};

export type ProjectBuildSummary = { springBoot: boolean; requiredJavaMajor?: number };
export type ProjectBuildManifest = { name: string; content: string };
export type ToolProbe = {
  name: string;
  status: "available" | "missing" | "unreachable";
  version?: string;
};

const names = (nodes: ProjectFileNode[]): Set<string> =>
  new Set(nodes.map((node) => node.name.toLowerCase()));

const countModuleManifests = (nodes: ProjectFileNode[], manifests: string[]): number =>
  nodes.reduce((count, node) => {
    if (!node.isDir) return count;
    const children = node.children ?? [];
    return (
      count +
      Number(manifests.some((manifest) => names(children).has(manifest))) +
      countModuleManifests(children, manifests)
    );
  }, 0);

export function summarizeProjectTrees(trees: ProjectFileNode[][]): ProjectStackSummary {
  const summary: ProjectStackSummary = {
    git: false,
    rust: false,
    node: false,
    mavenModules: 0,
    gradleModules: 0,
  };
  for (const tree of trees) {
    const rootNames = names(tree);
    summary.git ||= rootNames.has(".git");
    summary.rust ||= rootNames.has("cargo.toml");
    summary.node ||= rootNames.has("package.json");

    if (rootNames.has("pom.xml")) {
      summary.mavenModules += 1 + countModuleManifests(tree, ["pom.xml"]);
    }
    const gradleRoot = rootNames.has("build.gradle") || rootNames.has("build.gradle.kts");
    if (gradleRoot) {
      summary.gradleModules += 1 + countModuleManifests(tree, ["build.gradle", "build.gradle.kts"]);
    }
  }
  return summary;
}

const javaMajor = (version: string): number | undefined => {
  // Accept both bare versions ("17.0.2") and CLI output ("openjdk version \"1.8.0_422\"").
  const match = /(?:^|[^\d])(\d{1,2})(?:\.(\d{1,2}))?(?:\.|_|$)/.exec(version);
  if (!match) return undefined;
  const major = Number(match[1] === "1" && match[2] ? match[2] : match[1]);
  return Number.isInteger(major) && major > 0 && major <= 99 ? major : undefined;
};

export const getJavaMajorVersion = (version?: string): number | undefined =>
  version ? javaMajor(version) : undefined;

export const isJavaVersionUnsupported = (installed?: string, required?: number): boolean => {
  const major = installed ? javaMajor(installed) : undefined;
  return major !== undefined && required !== undefined && major < required;
};

export function summarizeBuildManifests(manifests: ProjectBuildManifest[]): ProjectBuildSummary {
  const summary: ProjectBuildSummary = { springBoot: false };
  const requirements: number[] = [];
  const addVersion = (value: string) => {
    const major = javaMajor(value.trim());
    if (major !== undefined) requirements.push(major);
  };

  for (const manifest of manifests) {
    const isPom = manifest.name.toLowerCase() === "pom.xml";
    const source = isPom
      ? manifest.content.replace(/<!--[\s\S]*?-->/g, "")
      : manifest.content
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split(/\r?\n/)
          .filter((line) => !line.trimStart().startsWith("//"))
          .join("\n");
    summary.springBoot ||= /org\.springframework\.boot|spring-boot-(?:starter|maven-plugin)/i.test(
      source,
    );

    if (isPom) {
      for (const match of source.matchAll(
        /<(java\.version|maven\.compiler\.(?:release|source|target))>\s*([^<]+?)\s*<\/\1>/gi,
      )) {
        addVersion(match[2]!);
      }
      for (const plugin of source.matchAll(
        /<plugin\b[^>]*>[\s\S]*?<artifactId>\s*maven-compiler-plugin\s*<\/artifactId>[\s\S]*?<\/plugin>/gi,
      )) {
        for (const match of plugin[0].matchAll(
          /<(?:release|source|target)>\s*([^<]+?)\s*<\/(?:release|source|target)>/gi,
        )) {
          addVersion(match[1]!);
        }
      }
    } else {
      for (const match of source.matchAll(
        /JavaLanguageVersion\.of\s*\(\s*["']?(\d{1,2})["']?\s*\)/g,
      )) {
        addVersion(match[1]!);
      }
      for (const match of source.matchAll(/JavaVersion\.VERSION_(?:1_)?(\d{1,2})/g))
        addVersion(match[1]!);
      for (const match of source.matchAll(
        /(?:sourceCompatibility|targetCompatibility|(?:options\.)?release)\s*(?:=|\.set\()\s*["']?(\d{1,2}(?:\.\d{1,2})?)["']?/g,
      )) {
        addVersion(match[1]!);
      }
    }
  }

  if (requirements.length > 0) summary.requiredJavaMajor = Math.max(...requirements);
  return summary;
}

const TOOLS: ReadonlyArray<{ name: string; program: string; args: string[] }> = [
  { name: "git", program: "git", args: ["--version"] },
  { name: "node", program: "node", args: ["--version"] },
  { name: "bun", program: "bun", args: ["--version"] },
  { name: "java", program: "java", args: ["-version"] },
  { name: "maven", program: "mvn", args: ["--version"] },
  { name: "gradle", program: "gradle", args: ["--version"] },
  { name: "claude", program: "claude", args: ["--version"] },
  { name: "codex", program: "codex", args: ["--version"] },
];

export function probeTools(): ToolProbe[] {
  return TOOLS.map(({ name, program, args }) => {
    try {
      const result = NodeChildProcess.spawnSync(program, args, {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      });
      if (result.error) {
        return {
          name,
          status: result.error.message.includes("ENOENT") ? "missing" : "unreachable",
        };
      }
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
      const firstLine = output.split(/\r?\n/)[0]?.trim();
      return {
        name,
        status: "available",
        ...(firstLine ? { version: firstLine.slice(0, 200) } : {}),
      };
    } catch {
      return { name, status: "unreachable" };
    }
  });
}

const MAX_MANIFEST_BYTES = 32 * 1024;
const MAX_MANIFESTS = 32;
const MANIFEST_NAMES = new Set(["pom.xml", "build.gradle", "build.gradle.kts"]);

export interface ProjectScan {
  stack: ProjectStackSummary;
  build: ProjectBuildSummary;
  manifestCount: number;
}

export function scanProject(root: string): ProjectScan {
  const manifests: ProjectBuildManifest[] = [];
  const walk = (dir: string) => {
    if (manifests.length >= MAX_MANIFESTS) return;
    let entries: NodeFS.Dirent[];
    try {
      entries = NodeFS.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (manifests.length >= MAX_MANIFESTS) break;
      if (entry.name === "node_modules" || entry.name === "target" || entry.name === ".git")
        continue;
      const full = NodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && MANIFEST_NAMES.has(entry.name.toLowerCase())) {
        try {
          const stat = NodeFS.statSync(full);
          if (stat.size > MAX_MANIFEST_BYTES) continue;
          manifests.push({ name: entry.name, content: NodeFS.readFileSync(full, "utf8") });
        } catch {
          // Unreadable manifests are skipped; the doctor is strictly read-only.
        }
      }
    }
  };
  walk(root);

  const tree: ProjectFileNode[] = NodeFS.existsSync(root)
    ? NodeFS.readdirSync(root, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isDir: entry.isDirectory(),
      }))
    : [];

  return {
    stack: summarizeProjectTrees([tree]),
    build: summarizeBuildManifests(manifests),
    manifestCount: manifests.length,
  };
}

function main(): void {
  const target = process.argv[2] ?? process.cwd();
  const tools = probeTools();
  const project = scanProject(target);
  const java = tools.find((tool) => tool.name === "java");
  const report = {
    target,
    tools,
    project,
    javaUnsupported: isJavaVersionUnsupported(java?.version, project.build.requiredJavaMajor),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url.endsWith(NodePath.basename(process.argv[1]))) main();
