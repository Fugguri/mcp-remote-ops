import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseEnv, detectDBType, buildConfigs } from "../src/cli/init.js";

describe("init", () => {
  it("parseEnv handles quotes and comments", () => {
    const tmp = path.join(os.tmpdir(), "env-test-" + Date.now());
    fs.writeFileSync(tmp, "# comment\nA=1\nB=\"two\"\nC='three'\n\n");
    expect(parseEnv(tmp)).toEqual({ A: "1", B: "two", C: "three" });
  });

  it("detectDBType respects DB_TYPE", () => {
    expect(detectDBType({ DB_TYPE: "mysql" })).toBe("mysql");
  });

  it("detectDBType picks postgres for port 5432", () => {
    expect(detectDBType({ DB_PORT: "5432", DB_HOST: "x" })).toBe("postgres");
  });

  it("detectDBType picks mariadb for port 3306", () => {
    expect(detectDBType({ DB_PORT: "3306", DB_HOST: "x" })).toBe("mariadb");
  });

  it("detectDBType picks sqlite when DB_PATH only", () => {
    expect(detectDBType({ DB_PATH: "./farm.db" })).toBe("sqlite");
  });

  it("detectDBType picks mariadb for non-standard port", () => {
    expect(detectDBType({ DB_PORT: "49394", DB_HOST: "x" })).toBe("mariadb");
  });

  it("buildConfigs writes mariadb db with separate db_password", () => {
    const env = {
      SERVER_HOST: "1.2.3.4",
      SERVER_USER: "root",
      SSH_PASSWORD: "ssh_pwd",
      DB_HOST: "db.example.com",
      DB_PORT: "3306",
      DB_NAME: "Looker",
      DB_USER: "u",
      DB_PASSWORD: "db_pwd",
    };
    const { project, secrets } = buildConfigs(env);
    expect(project.db?.prod.type).toBe("mariadb");
    expect(project.db?.prod.port).toBe(3306);
    expect(project.db?.prod.user).toBe("u");
    expect(secrets.prod.password).toBe("ssh_pwd");
    expect(secrets.prod.db_password).toBe("db_pwd");
  });

  it("omits db_password when same as ssh", () => {
    const env = {
      SERVER_HOST: "x",
      SSH_PASSWORD: "same",
      DB_HOST: "y",
      DB_PORT: "5432",
      DB_PASSWORD: "same",
    };
    const { secrets } = buildConfigs(env);
    expect(secrets.prod.db_password).toBeUndefined();
  });
});
