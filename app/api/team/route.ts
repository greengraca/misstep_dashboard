import { NextResponse } from "next/server";
import { withAuth, withAuthRead } from "@/lib/api-helpers";
import {
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  removeTeamMember,
} from "@/lib/team";

export const GET = withAuthRead(async () => {
  const data = await getTeamMembers();
  return { data };
}, "team-list");

export const POST = withAuth(async (request, session) => {
  const body = await request.json();
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const actor = session.user?.name || "unknown";
  const member = await createTeamMember(body, actor);
  return { data: member };
}, "team-create");

export const PATCH = withAuth(async (request, session) => {
  const body = await request.json();
  if (!body._id) {
    return NextResponse.json({ error: "_id required" }, { status: 400 });
  }
  const actor = session.user?.name || "unknown";
  await updateTeamMember(body._id, body, actor);
  return { data: { success: true } };
}, "team-update");

export const DELETE = withAuth(async (request, session) => {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const actor = session.user?.name || "unknown";
  await removeTeamMember(id, actor);
  return { data: { success: true } };
}, "team-delete");
