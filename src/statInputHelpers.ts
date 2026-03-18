import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";
import {
  AD_METADATA_ID,
  HP_METADATA_ID,
  HIDE_METADATA_ID,
  MAX_HP_METADATA_ID,
  PD_METADATA_ID,
  StatMetadataID,
  TEMP_HP_METADATA_ID,
} from "./metadataHelpers/itemMetadataIds";

export type InputName = "hp" | "maxHp" | "tempHp" | "pd" | "ad" | "hideStats";

const inputNames: InputName[] = ["hp", "maxHp", "tempHp", "pd", "ad", "hideStats"];

export function isInputName(id: string): id is InputName {
  return inputNames.includes(id as InputName);
}

export async function writeTokenValueToItem(
  itemId: string,
  name: InputName,
  value: number | boolean,
) {
  const id = convertInputNameToMetadataId(name);

  await OBR.scene.items.updateItems([itemId], (items) => {
    if (items.length > 1) {
      throw "Selection exceeded max length, expected 1, got: " + items.length;
    }

    for (let item of items) {
      const itemMetadata = item.metadata[getPluginId("metadata")];
      item.metadata[getPluginId("metadata")] = {
        ...(typeof itemMetadata === "object" ? itemMetadata : {}),
        ...{ [id]: value },
      };
    }
  });
}

/**
 * Write multiple stats at once (used for Temp HP spillover into HP).
 */
export async function writeTokenValuesToItem(
  itemId: string,
  updates: Partial<Record<InputName, number | boolean>>,
) {
  const patch: Record<string, number | boolean> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (!isInputName(key)) continue;

    const metaKey = convertInputNameToMetadataId(key);
    patch[metaKey] = value;
  }

  await OBR.scene.items.updateItems([itemId], (items) => {
    if (items.length > 1) {
      throw "Selection exceeded max length, expected 1, got: " + items.length;
    }

    for (let item of items) {
      const itemMetadata = item.metadata[getPluginId("metadata")];
      item.metadata[getPluginId("metadata")] = {
        ...(typeof itemMetadata === "object" ? itemMetadata : {}),
        ...patch,
      };
    }
  });
}

export function getNewStatValue(
  name: InputName,
  inputContent: string,
  previousValue: number,
): number {
  if (name === "hideStats") return previousValue;

  return restrictValueRange(
    convertInputNameToMetadataId(name),
    inlineMath(inputContent, previousValue),
  );
}

/**
 * Temp HP overflow behavior:
 * - If input starts with "-" => damage temp HP first, spill into HP.
 * - Temp HP never goes negative.
 * - If input starts with "+" => add temp HP only.
 * - If input is a plain number => set temp HP only.
 */
export function computeTempHpOverflow(
  inputContent: string,
  prevTempHp: number,
  prevHp: number,
): { newTempHp: number; newHp: number } {
  const s = (inputContent ?? "").trim();
  const raw = parseFloat(s);

  // Invalid entry => do nothing
  if (Number.isNaN(raw)) {
    return { newTempHp: clampTempHp(prevTempHp), newHp: clampHp(prevHp) };
  }

  // Relative (+ / -)
  if (s.startsWith("+") || s.startsWith("-")) {
    const delta = Math.trunc(raw); // raw already includes sign

    // +N => add temp HP only
    if (delta >= 0) {
      return {
        newTempHp: clampTempHp(prevTempHp + delta),
        newHp: clampHp(prevHp),
      };
    }

    // -N => damage with spill
    const damage = Math.abs(delta);

    if (damage <= prevTempHp) {
      return {
        newTempHp: clampTempHp(prevTempHp - damage),
        newHp: clampHp(prevHp),
      };
    }

    const overflow = damage - prevTempHp;
    return {
      newTempHp: 0,
      newHp: clampHp(prevHp - overflow),
    };
  }

  // Absolute set => set temp HP only
  return {
    newTempHp: clampTempHp(Math.trunc(raw)),
    newHp: clampHp(prevHp),
  };
}

function inlineMath(inputContent: string, previousValue: number): number {
  const newValue = parseFloat(inputContent);

  if (Number.isNaN(newValue)) return 0;
  if (inputContent.startsWith("+") || inputContent.startsWith("-")) {
    return Math.trunc(previousValue + Math.trunc(newValue));
  }

  return newValue;
}

function restrictValueRange(id: StatMetadataID, value: number): number {
  switch (id) {
    case HP_METADATA_ID:
    case MAX_HP_METADATA_ID:
      return clampHp(value);

    case TEMP_HP_METADATA_ID:
      return clampTempHp(value);

    case PD_METADATA_ID:
    case AD_METADATA_ID:
      return clampSmall(value);

    default:
      return value;
  }
}

function clampHp(value: number): number {
  if (value > 9999) return 9999;
  if (value < -999) return -999;
  return Math.trunc(value);
}

function clampTempHp(value: number): number {
  if (value > 999) return 999;
  if (value < 0) return 0; // ✅ never negative
  return Math.trunc(value);
}

function clampSmall(value: number): number {
  if (value > 999) return 999;
  if (value < -999) return -999;
  return Math.trunc(value);
}

function convertInputNameToMetadataId(id: InputName): StatMetadataID {
  switch (id) {
    case "hp":
      return HP_METADATA_ID;
    case "maxHp":
      return MAX_HP_METADATA_ID;
    case "tempHp":
      return TEMP_HP_METADATA_ID;
    case "pd":
      return PD_METADATA_ID;
    case "ad":
      return AD_METADATA_ID;
    case "hideStats":
      return HIDE_METADATA_ID;
  }
}
