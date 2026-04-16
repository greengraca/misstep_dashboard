import { NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";

export const GET = withAuthRead(async () => {
  const repo = process.env.EXT_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    return NextResponse.json(
      { error: "Extension download not configured (missing EXT_REPO or GITHUB_TOKEN)" },
      { status: 500 }
    );
  }

  const relRes = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 60 },
    }
  );
  if (!relRes.ok) {
    return NextResponse.json(
      { error: `Upstream release fetch failed: ${relRes.status}` },
      { status: 502 }
    );
  }
  const rel = (await relRes.json()) as {
    tag_name: string;
    assets: { name: string; url: string }[];
  };

  const asset = rel.assets.find((a) => a.name === "misstep-ext.zip");
  if (!asset) {
    return NextResponse.json(
      { error: "Release asset misstep-ext.zip not found in latest release" },
      { status: 502 }
    );
  }

  const zipRes = await fetch(asset.url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/octet-stream",
    },
  });
  if (!zipRes.ok || !zipRes.body) {
    return NextResponse.json(
      { error: `Asset download failed: ${zipRes.status}` },
      { status: 502 }
    );
  }

  const version = rel.tag_name.replace(/^v/, "");
  return new Response(zipRes.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="misstep-ext-${version}.zip"`,
    },
  });
}, "ext-download");
