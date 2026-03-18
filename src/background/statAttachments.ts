import OBR, { Image, Item, isImage } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import {
  DIAMETER,
  FULL_BAR_HEIGHT,
  SHORT_BAR_HEIGHT,
  acBackgroundId,
  acTextId,
  addArmorAttachmentsToArray,
  addHealthAttachmentsToArray,
  addNameTagAttachmentsToArray,
  addTempHealthAttachmentsToArray,
  createHealthBar,
  createNameTag,
  createStatBubble,
  hpTextId,
  thpBackgroundId,
  thpTextId,
} from "./compoundItemHelpers";
import { getOriginAndBounds } from "./mathHelpers";
import { getTokenStats } from "../metadataHelpers/itemMetadataHelpers";
import createContextMenuItems from "./contextMenuItems";
import { getName, NAME_METADATA_ID } from "@/metadataHelpers/nameHelpers";
import { Settings } from "@/metadataHelpers/settingMetadataHelpers";
import getGlobalSettings from "./getGlobalSettings";

let itemsLast: Image[] = []; // for item change checks
const addItemsArray: Item[] = []; // for bulk addition or changing of items
const deleteItemsArray: string[] = []; // for bulk deletion of scene items
let settings: Settings = {
  verticalOffset: 0,
  barAtTop: false,
  showBars: false,
  segments: 0,
  nameTags: false,
};
let callbacksStarted = false;
let userRoleLast: "GM" | "PLAYER";
let themeMode: "DARK" | "LIGHT";

/**
 * AD attachment ids (local to this file).
 * We reuse AC ids for PD to avoid touching compoundItemHelpers right now.
 */
function adBackgroundId(itemId: string) {
  return `${itemId}-ad-background`;
}
function adTextId(itemId: string) {
  return `${itemId}-ad-text`;
}
function addAdAttachmentsToArray(arr: string[], itemId: string) {
  arr.push(adBackgroundId(itemId));
  arr.push(adTextId(itemId));
}

/**
 * Optional migration:
 * Copies legacy D&D-style keys into the new DC20 keys if the new ones are missing.
 * Old keys: "health", "max health", "temporary health", "armor class"
 * New keys: "hp", "max hp", "temp hp", "pd"
 */
async function migrateLegacyStatsIfNeeded() {
  const items: Image[] = await OBR.scene.items.getItems(
    (item) =>
      (item.layer === "CHARACTER" || item.layer === "MOUNT") && isImage(item),
  );

  if (items.length === 0) return;

  const metaKey = getPluginId("metadata");

  await OBR.scene.items.updateItems(items, (mutable) => {
    for (const item of mutable) {
      const raw = item.metadata[metaKey];
      const meta =
        typeof raw === "object" && raw !== null
          ? (raw as Record<string, unknown>)
          : {};

      let changed = false;

      // hp
      if (meta["hp"] === undefined && typeof meta["health"] === "number") {
        meta["hp"] = meta["health"];
        changed = true;
      }
      // max hp
      if (
        meta["max hp"] === undefined &&
        typeof meta["max health"] === "number"
      ) {
        meta["max hp"] = meta["max health"];
        changed = true;
      }
      // temp hp
      if (
        meta["temp hp"] === undefined &&
        typeof meta["temporary health"] === "number"
      ) {
        meta["temp hp"] = meta["temporary health"];
        changed = true;
      }
      // pd
      if (meta["pd"] === undefined && typeof meta["armor class"] === "number") {
        meta["pd"] = meta["armor class"];
        changed = true;
      }

      if (changed) {
        item.metadata[metaKey] = meta;
      }
    }
  });
}

export default async function startBackground() {
  const start = async () => {
    // migrate any legacy keys once when the scene starts
    await migrateLegacyStatsIfNeeded();

    settings = (await getGlobalSettings(settings)).settings;
    themeMode = (await OBR.theme.getTheme()).mode;
    createContextMenuItems(settings, themeMode);
    await refreshAllHealthBars();
    await startCallbacks();
  };

  OBR.scene.onReadyChange(async (isReady) => {
    if (isReady) start();
  });

  const isReady = await OBR.scene.isReady();
  if (isReady) start();
}

async function refreshAllHealthBars() {
  const items: Image[] = await OBR.scene.items.getItems(
    (item) =>
      (item.layer === "CHARACTER" || item.layer === "MOUNT") && isImage(item),
  );

  itemsLast = items;

  const role = await OBR.player.getRole();
  const sceneDpi = await OBR.scene.grid.getDpi();
  for (const item of items) {
    createAttachments(item, role, sceneDpi);
  }

  await sendItemsToScene(addItemsArray, deleteItemsArray);

  const itemIds: string[] = [];
  for (const item of items) itemIds.push(item.id);
}

async function startCallbacks() {
  if (!callbacksStarted) {
    callbacksStarted = true;

    const unSubscribeFromTheme = OBR.theme.onChange((theme) => {
      themeMode = theme.mode;
      createContextMenuItems(settings, themeMode);
    });

    userRoleLast = await OBR.player.getRole();
    const unSubscribeFromPlayer = OBR.player.onChange(async () => {
      const userRole = await OBR.player.getRole();
      if (userRole !== userRoleLast) {
        refreshAllHealthBars();
        userRoleLast = userRole;
      }
    });

    const unsubscribeFromSceneMetadata = OBR.scene.onMetadataChange(
      async (metadata) => {
        const { settings: newSettings, isChanged: doRefresh } =
          await getGlobalSettings(settings, metadata);
        settings = newSettings;
        if (doRefresh) {
          createContextMenuItems(settings, themeMode);
          refreshAllHealthBars();
        }
      },
    );
    const unsubscribeFromRoomMetadata = OBR.room.onMetadataChange(
      async (metadata) => {
        const { settings: newSettings, isChanged: doRefresh } =
          await getGlobalSettings(settings, undefined, metadata);
        settings = newSettings;
        if (doRefresh) {
          createContextMenuItems(settings, themeMode);
          refreshAllHealthBars();
        }
      },
    );

    const unsubscribeFromItems = OBR.scene.items.onChange(
      async (itemsFromCallback) => {
        const imagesFromCallback: Image[] = [];
        for (const item of itemsFromCallback) {
          if (
            (item.layer === "CHARACTER" || item.layer === "MOUNT") &&
            isImage(item)
          ) {
            imagesFromCallback.push(item);
          }
        }

        const changedItems: Image[] = getChangedItems(imagesFromCallback);
        itemsLast = imagesFromCallback;

        const role = await OBR.player.getRole();
        const sceneDpi = await OBR.scene.grid.getDpi();
        for (const item of changedItems) {
          createAttachments(item, role, sceneDpi);
        }

        await sendItemsToScene(addItemsArray, deleteItemsArray);
      },
    );

    const unsubscribeFromScene = OBR.scene.onReadyChange((isReady) => {
      if (!isReady) {
        unSubscribeFromTheme();
        unSubscribeFromPlayer();
        unsubscribeFromSceneMetadata();
        unsubscribeFromRoomMetadata();
        unsubscribeFromItems();
        unsubscribeFromScene();
        callbacksStarted = false;
      }
    });
  }
}

function getChangedItems(imagesFromCallback: Image[]) {
  const changedItems: Image[] = [];

  let s = 0; // # items skipped in itemsLast array, caused by deleted items
  for (let i = 0; i < imagesFromCallback.length; i++) {
    if (i > itemsLast.length - s - 1) {
      changedItems.push(imagesFromCallback[i]);
    } else if (itemsLast[i + s].id !== imagesFromCallback[i].id) {
      s++;
      i--;
    } else if (
      !(
        itemsLast[i + s].scale.x === imagesFromCallback[i].scale.x &&
        itemsLast[i + s].scale.y === imagesFromCallback[i].scale.y &&
        (itemsLast[i + s].name === imagesFromCallback[i].name ||
          !settings.nameTags)
      )
    ) {
      deleteItemsArray.push(hpTextId(imagesFromCallback[i].id));
      changedItems.push(imagesFromCallback[i]);
    } else if (
      !(
        itemsLast[i + s].position.x === imagesFromCallback[i].position.x &&
        itemsLast[i + s].position.y === imagesFromCallback[i].position.y &&
        itemsLast[i + s].grid.offset.x ===
          imagesFromCallback[i].grid.offset.x &&
        itemsLast[i + s].grid.offset.y ===
          imagesFromCallback[i].grid.offset.y &&
        itemsLast[i + s].grid.dpi === imagesFromCallback[i].grid.dpi &&
        itemsLast[i + s].visible === imagesFromCallback[i].visible &&
        JSON.stringify(itemsLast[i + s].metadata[getPluginId("metadata")]) ===
          JSON.stringify(
            imagesFromCallback[i].metadata[getPluginId("metadata")],
          ) &&
        JSON.stringify(
          itemsLast[i + s].metadata[getPluginId(NAME_METADATA_ID)],
        ) ===
          JSON.stringify(
            imagesFromCallback[i].metadata[getPluginId(NAME_METADATA_ID)],
          )
      )
    ) {
      changedItems.push(imagesFromCallback[i]);
    }
  }
  return changedItems;
}

function createAttachments(item: Image, role: "PLAYER" | "GM", dpi: number) {
  const { origin, bounds } = getOriginAndBounds(settings, item, dpi);

  // DC20 stats: hp, maxHp, tempHp, pd, ad
  const [hp, maxHp, tempHp, pd, ad, statsVisible] = getTokenStats(item);

  if (role === "PLAYER" && !statsVisible && !settings.showBars) {
    addHealthAttachmentsToArray(deleteItemsArray, item.id);
    addArmorAttachmentsToArray(deleteItemsArray, item.id); // PD uses AC ids
    addTempHealthAttachmentsToArray(deleteItemsArray, item.id);
    addAdAttachmentsToArray(deleteItemsArray, item.id);
  } else if (role === "PLAYER" && !statsVisible && settings.showBars) {
    createLimitedHealthBar();
  } else {
    const hasHealthBar = createFullHealthBar();

    // ✅ Desired layout:
    // Temp HP far LEFT, PD then AD far RIGHT.
    const hasAdBubble = createAD(hasHealthBar);
    const hasPdBubble = createPD(hasHealthBar, hasAdBubble);
    createTempHp(hasHealthBar);
  }

  const plainText = getName(item);
  if (settings.nameTags && plainText !== "") {
    const nameTagPosition = { x: origin.x, y: origin.y };
    if (settings.barAtTop) {
      if (
        maxHp <= 0 ||
        (role === "PLAYER" && !statsVisible && !settings.showBars)
      ) {
        nameTagPosition.y = origin.y - 4;
      } else if (role === "PLAYER" && !statsVisible && settings.showBars) {
        nameTagPosition.y = origin.y - SHORT_BAR_HEIGHT - 4;
      } else {
        nameTagPosition.y = origin.y - FULL_BAR_HEIGHT - 4;
      }
    }
    addItemsArray.push(
      ...createNameTag(
        item,
        dpi,
        plainText,
        nameTagPosition,
        settings.barAtTop ? "DOWN" : "UP",
      ),
    );
  } else {
    addNameTagAttachmentsToArray(deleteItemsArray, item.id);
  }

  function createLimitedHealthBar() {
    deleteItemsArray.push(hpTextId(item.id));
    addArmorAttachmentsToArray(deleteItemsArray, item.id);
    addTempHealthAttachmentsToArray(deleteItemsArray, item.id);
    addAdAttachmentsToArray(deleteItemsArray, item.id);

    if (maxHp <= 0) {
      addHealthAttachmentsToArray(deleteItemsArray, item.id);
      return;
    }

    deleteItemsArray.push(`${item.id}health-label`);
    addItemsArray.push(
      ...createHealthBar(
        item,
        bounds,
        hp,
        maxHp,
        statsVisible,
        origin,
        "short",
        settings.segments,
      ),
    );
  }

  function createFullHealthBar() {
    if (maxHp <= 0) {
      addHealthAttachmentsToArray(deleteItemsArray, item.id);
      return false;
    }

    addItemsArray.push(
      ...createHealthBar(item, bounds, hp, maxHp, statsVisible, origin),
    );
    return true;
  }

  /**
   * PD bubble: on the right side, just LEFT of AD (if AD exists).
   */
  function createPD(hasHealthBar: boolean, hasAdBubble: boolean) {
    if (pd <= 0) {
      addArmorAttachmentsToArray(deleteItemsArray, item.id);
      return false;
    }

    const rightEdgeX = origin.x + bounds.width / 2 - DIAMETER / 2 - 2;

    const pdPosition = {
      x: rightEdgeX - (hasAdBubble ? DIAMETER + 4 : 0),
      y: origin.y - DIAMETER / 2 - 4 - (hasHealthBar ? FULL_BAR_HEIGHT : 0),
    };

    if (settings.barAtTop) {
      pdPosition.y = origin.y + DIAMETER / 2;
    }

    addItemsArray.push(
      ...createStatBubble(
        item,
        pd,
        "cornflowerblue",
        pdPosition,
        acBackgroundId(item.id),
        acTextId(item.id),
      ),
    );

    return true;
  }

  /**
   * AD bubble: far RIGHT.
   */
  function createAD(hasHealthBar: boolean) {
    if (ad <= 0) {
      addAdAttachmentsToArray(deleteItemsArray, item.id);
      return false;
    }

    const rightEdgeX = origin.x + bounds.width / 2 - DIAMETER / 2 - 2;

    const adPosition = {
      x: rightEdgeX,
      y: origin.y - DIAMETER / 2 - 4 - (hasHealthBar ? FULL_BAR_HEIGHT : 0),
    };

    if (settings.barAtTop) {
      adPosition.y = origin.y + DIAMETER / 2;
    }

    addItemsArray.push(
      ...createStatBubble(
        item,
        ad,
        "seagreen",
        adPosition,
        adBackgroundId(item.id),
        adTextId(item.id),
      ),
    );

    return true;
  }

  /**
   * Temp HP bubble: far LEFT.
   */
  function createTempHp(hasHealthBar: boolean) {
    if (tempHp <= 0) {
      addTempHealthAttachmentsToArray(deleteItemsArray, item.id);
      return;
    }

    const leftEdgeX = origin.x - bounds.width / 2 + DIAMETER / 2 + 2;

    const tempHpPosition = {
      x: leftEdgeX,
      y: origin.y - DIAMETER / 2 - 4 - (hasHealthBar ? FULL_BAR_HEIGHT : 0),
    };

    if (settings.barAtTop) {
      tempHpPosition.y = origin.y + DIAMETER / 2;
    }

    addItemsArray.push(
      ...createStatBubble(
        item,
        tempHp,
        "gold",
        tempHpPosition,
        thpBackgroundId(item.id),
        thpTextId(item.id),
      ),
    );
  }
}

async function sendItemsToScene(addItemsArray: Item[], deleteItemsArray: string[]) {
  await OBR.scene.local.deleteItems(deleteItemsArray);
  await OBR.scene.local.addItems(addItemsArray);
  deleteItemsArray.length = 0;
  addItemsArray.length = 0;
}
