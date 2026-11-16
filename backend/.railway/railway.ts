import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "ai-advisor-backend";
export default defineRailway(() => {
  const aiAdvisorBackend = service("ai-advisor-backend", {
    source: github("futureselfdiscover/ai-advisor-futureself", { branch: "main", checkSuites: false, rootDirectory: "/backend" }),
    build: { buildEnvironment: "V3", builder: "RAILPACK", watchPatterns: ["/backend/**"] },
    start: "uvicorn main:app --host 0.0.0.0 --port $PORT",
    healthcheck: "/",
    replicas: { "iad": 1 },
  });

  return project("ai-advisor-backend", {
    variables: { managed: false },
    resources: [aiAdvisorBackend],
  });
});
