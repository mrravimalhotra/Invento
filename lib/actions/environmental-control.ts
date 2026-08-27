"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

export async function createEnvironmentalReading(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const area = String(formData.get("area") || "").trim();
  const temperatureRaw = String(formData.get("temperature") || "").trim();
  const humidityRaw = String(formData.get("humidity") || "").trim();

  if (!area) return { error: "Area is required." };

  const temperature = temperatureRaw === "" ? null : Number(temperatureRaw);
  const humidity = humidityRaw === "" ? null : Number(humidityRaw);
  if (temperature !== null && Number.isNaN(temperature)) return { error: "Temperature must be a number." };
  if (humidity !== null && Number.isNaN(humidity)) return { error: "Humidity must be a number." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "environmental_control")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("environmental_control_readings").insert({
    area,
    temperature,
    humidity,
    recorded_by: user!.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/environmental-control");
  redirect("/environmental-control");
}
