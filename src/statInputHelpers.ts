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
    // Throw error if more than one token selected
    if (items.length > 1) {
      throw "Selection exceeded max length, expected 1, got: " + items.length;
    }

    // Modify item
    for (let item of items) {
      const itemMetadata = item.metadata[getPluginId("metadata")];
      item.metadata[getPluginId("metadata")] = {
        ...(typeof itemMetadata === "object" ? itemMetadata : {}),
        ...{ [id]: value },
      };
    }
  });
}

export function getNewStatValue(
  name: InputName,
  inputContent: string,
  previousValue: number,
): number {
  // hideStats is a boolean toggle; it shouldn't ever come through here,
  // but if it does, keep it safe.
  if (name === "hideStats") return previousValue;

  return restrictValueRange(
    convertInputNameToMetadataId(name),
    inlineMath(inputContent, previousValue),
  );
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
      if (value > 9999) value = 9999;
      else if (value < -999) value = -999;
      break;

    case TEMP_HP_METADATA_ID:
    case PD_METADATA_ID:
    case AD_METADATA_ID:
      if (value > 999) value = 999;
      else if (value < -999) value = -999;
      break;

    default:
      break;
  }
  return value;
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
