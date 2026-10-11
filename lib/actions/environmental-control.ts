"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";

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
  if (temperature !== null && !Number.isFinite(temperature)) return { error: "Temperature must be a number." };
  if (humidity !== null && !Number.isFinite(humidity)) return { error: "Humidity must be a number." };
  // SCAN-P8-05: a reading needs at least one value, and the value must be physically possible.
  // (Acceptance ranges and excursion flags per area are a separate item, C9.)
  if (temperature === null && humidity === null) return { error: "Enter a temperature, a humidity, or both." };
  if (temperature !== null && (temperature < -50 || temperature > 100)) {
    return { error: "Temperature must be between -50 and 100 °C. Check the value." };
  }
  if (humidity !== null && (humidity < 0 || humidity > 100)) {
    return { error: "Humidity must be between 0 and 100 %RH. Check the value." };
  }

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "environmental_control")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("environmental_control_readings").insert({
    area,
    temperature,
    humidity,
    recorded_by: user!.id,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/environmental-control");
  redirect("/environmental-control?created=1");
}
