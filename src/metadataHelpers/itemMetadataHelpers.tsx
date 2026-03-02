import OBR, { isImage, Item } from "@owlbear-rodeo/sdk";

import {
  HP_METADATA_ID,
  MAX_HP_METADATA_ID,
  TEMP_HP_METADATA_ID,
  PD_METADATA_ID,
  AD_METADATA_ID,
  HIDE_METADATA_ID,
  GROUP_METADATA_ID,
  INDEX_METADATA_ID,
} from "./itemMetadataIds";
import Token from "./TokenType";
import {
  getPluginMetadata,
  readBooleanFromObject,
  readNumberFromObject,
} from "./metadataHelpers";

export async function getSelectedItems(selection?: string[]): Promise<Item[]> {
  if (selection === undefined) selection = await OBR.player.getSelection();
  if (selection === undefined) return [];
  const selectedItems = await OBR.scene.items.getItems(selection);
  return selectedItems;
}

export function parseItems(items: Item[]): Token[] {
  const validItems = items.filter((item) => itemFilter(item));

  const Tokens: Token[] = [];
  for (const item of validItems) {
    const metadata = getPluginMetadata(item.metadata);
    Tokens.push(
      tokenFactory(
        item,
        readNumberFromObject(metadata, HP_METADATA_ID),
        readNumberFromObject(metadata, MAX_HP_METADATA_ID),
        readNumberFromObject(metadata, TEMP_HP_METADATA_ID),
        readNumberFromObject(metadata, PD_METADATA_ID),
        readNumberFromObject(metadata, AD_METADATA_ID),
        readBooleanFromObject(metadata, HIDE_METADATA_ID),
        readNumberFromObject(metadata, GROUP_METADATA_ID),
        readNumberFromObject(metadata, INDEX_METADATA_ID, -1),
      ),
    );
  }

  return Tokens;
}

/** Returns true for images on the mount and character layers */
export function itemFilter(item: Item) {
  return (
    isImage(item) && (item.layer === "CHARACTER" || item.layer === "MOUNT")
  );
}

export function getTokenStats(
  item: Item,
): [hp: number, maxHp: number, tempHp: number, pd: number, ad: number, statsVisible: boolean] {
  const metadata = getPluginMetadata(item.metadata);
  return [
    readNumberFromObject(metadata, HP_METADATA_ID),
    readNumberFromObject(metadata, MAX_HP_METADATA_ID),
    readNumberFromObject(metadata, TEMP_HP_METADATA_ID),
    readNumberFromObject(metadata, PD_METADATA_ID),
    readNumberFromObject(metadata, AD_METADATA_ID),
    !readBooleanFromObject(metadata, HIDE_METADATA_ID),
  ];
}

export function tokenFactory(
  item: Item,
  hp: number,
  maxHp: number,
  tempHp: number,
  pd: number,
  ad: number,
  hideStats: boolean,
  group: number,
  index: number,
): Token {
  return {
    item,
    hp,
    maxHp,
    tempHp,
    pd,
    ad,
    hideStats,
    group,
    index,
  };
}
