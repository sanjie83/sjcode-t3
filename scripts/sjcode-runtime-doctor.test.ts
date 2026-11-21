import { describe, expect, it } from "vite-plus/test";

import {
  getJavaMajorVersion,
  isJavaVersionUnsupported,
  summarizeBuildManifests,
  summarizeProjectTrees,
  type ProjectFileNode,
} from "./sjcode-runtime-doctor.ts";

const node = (name: string, isDir = false, children?: ProjectFileNode[]): ProjectFileNode => ({
  name,
  isDir,
  ...(children ? { children } : {}),
});

describe("getJavaMajorVersion", () => {
  it("parses modern and 1.x version strings", () => {
    expect(getJavaMajorVersion("17.0.2")).toBe(17);
    expect(getJavaMajorVersion("1.8.0_312")).toBe(8);
  });

  it("rejects junk", () => {
    expect(getJavaMajorVersion("not-java")).toBeUndefined();
    expect(getJavaMajorVersion()).toBeUndefined();
  });
});

describe("isJavaVersionUnsupported", () => {
  it("reports an older installed runtime", () => {
    expect(isJavaVersionUnsupported("java version 11.0.1", 17)).toBe(true);
    expect(isJavaVersionUnsupported("java version 21.0.1", 17)).toBe(false);
  });
});

describe("summarizeProjectTrees", () => {
  it("counts Maven and Gradle modules recursively", () => {
    const tree = [
      node(".git", true),
      node("pom.xml"),
      node("services", true, [node("api", true, [node("pom.xml")])]),
      node("build.gradle.kts"),
    ];
    expect(summarizeProjectTrees([tree])).toEqual({
      git: true,
      rust: false,
      node: false,
      mavenModules: 2,
      gradleModules: 1,
    });
  });
});

describe("summarizeBuildManifests", () => {
  it("detects Spring Boot and the max required Java major in pom.xml", () => {
    const pom = `<project>
      <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
      </parent>
      <properties><java.version>17</java.version></properties>
    </project>`;
    expect(summarizeBuildManifests([{ name: "pom.xml", content: pom }])).toEqual({
      springBoot: true,
      requiredJavaMajor: 17,
    });
  });

  it("ignores commented-out markers", () => {
    const pom = `<!-- org.springframework.boot --><project></project>`;
    expect(summarizeBuildManifests([{ name: "pom.xml", content: pom }])).toEqual({
      springBoot: false,
    });
  });
});
