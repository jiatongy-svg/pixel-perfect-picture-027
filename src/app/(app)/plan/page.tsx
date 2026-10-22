// Old address (one plan per student). Plans now live at /plans.
import { redirect } from "next/navigation";

export default function OldPlanPage() {
  redirect("/plans");
}
