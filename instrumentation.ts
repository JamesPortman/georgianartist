import type { Instrumentation } from "next";

/**
 * Next calls this for every uncaught error in a page render, route handler,
 * server action or the proxy. Errors are counted in ErrorReport and emailed
 * to the owner once a day per kind (lib/error-report.ts) — the site's answer
 * to error tracking, in the same spirit as the health check: an email when
 * something is wrong, not a dashboard someone has to watch.
 *
 * Only in the Node runtime: the report needs Prisma and Resend.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/error-report");
  await reportError(err, {
    path: request.path,
    kind: context.routeType === "render" ? `render (${context.renderSource ?? "page"})` : context.routeType,
  });
};
