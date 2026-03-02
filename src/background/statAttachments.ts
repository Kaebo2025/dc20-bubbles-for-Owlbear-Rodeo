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

export default async function startBackground() {
  const start = async () => {
    settings = (await getGlobalSettings(settings)).settings;
    themeMode = (await OBR.theme.getTheme()).mode;
    createContextMenuItems(settings, themeMode);
    await refreshAllHealthBars();
    await startCallbacks();
  };

  // Handle when the scene is either changed or made ready after extension load
  OBR.scene.onReadyChange(async (isReady) => {
    if (isReady) start();
  });

  // Check if the scene is already ready once the extension loads
  const isReady = await OBR.scene.isReady();
  if (isReady) start();
}

async function refreshAllHealthBars() {
  //get shapes from scene
  const items: Image[] = await OBR.scene.items.getItems(
    (item) =>
      (item.layer === "CHARACTER" || item.layer === "MOUNT") && isImage(item),
  );

  //store array of all items currently on the board for change monitoring
  itemsLast = items;

  //draw health bars
  const roll = await OBR.player.getRole();
  const sceneDpi = await OBR.scene.grid.getDpi();
  for (const item of items) {
    createAttachments(item, roll, sceneDpi);
  }

  await sendItemsToScene(addItemsArray, deleteItemsArray);

  //update global item id list for orphaned health bar monitoring
  const itemIds: string[] = [];
  for (const item of items) {
    itemIds.push(item.id);
  }
}

async function startCallbacks() {
  if (!callbacksStarted) {
    // Don't run this again unless the listeners have been unsubscribed
    callbacksStarted = true;

    // Handle theme changes
    const unSubscribeFromTheme = OBR.theme.onChange((theme) => {
      themeMode = theme.mode;
      createContextMenuItems(settings, themeMode);
    });

    // Handle role changes
    userRoleLast = await OBR.player.getRole();
    const unSubscribeFromPlayer = OBR.player.onChange(async () => {
      // Do a refresh if player role change is detected
      const userRole = await OBR.player.getRole();
      if (userRole !== userRoleLast) {
        refreshAllHealthBars();
        userRoleLast = userRole;
      }
    });

    // Handle metadata changes
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

    // Handle item changes (Update bars/bubbles)
    const unsubscribeFromItems = OBR.scene.items.onChange(
      async (itemsFromCallback) => {
        // Filter items for only images from character and mount layers
        const imagesFromCallback: Image[] = [];
        for (const item of itemsFromCallback) {
          if (
            (item.layer === "CHARACTER" || item.layer === "MOUNT") &&
            isImage(item)
          ) {
            imagesFromCallback.push(item);
          }
        }

        //create list of modified and new items, skipping deleted items
        const changedItems: Image[] = getChangedItems(imagesFromCallback);

        //update array of all items currently on the board
        itemsLast = imagesFromCallback;

        //draw bars/bubbles
        const role = await OBR.player.getRole();
        const sceneDpi = await OBR.scene.grid.getDpi();
        for (const item of changedItems) {
          createAttachments(item, role, sceneDpi);
        }

        await sendItemsToScene(addItemsArray, deleteItemsArray);
      },
    );

    // Unsubscribe listeners that rely on the scene if it stops being ready
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
      //check for new items at the end of the list
      changedItems.push(imagesFromCallback[i]);
    } else if (itemsLast[i + s].id !== imagesFromCallback[i].id) {
      s++; // Skip an index in itemsLast
      i--; // Reuse the index item in imagesFromCallback
    } else if (
      //check for scaling changes
      !(
        itemsLast[i + s].scale.x === imagesFromCallback[i].scale.x &&
        itemsLast[i + s].scale.y === imagesFromCallback[i].scale.y &&
        (itemsLast[i + s].name === imagesFromCallback[i].name ||
          !settings.nameTags)
      )
    ) {
      // Attachments must be deleted to prevent ghost selection highlight bug
      deleteItemsArray.push(hpTextId(imagesFromCallback[i].id));
      changedItems.push(imagesFromCallback[i]);
    } else if (
      //check position, visibility, and metadata changes
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
      //update items
      changedItems.push(imagesFromCallback[i]);
    }
  }
  return changedItems;
}

function createAttachments(item: Image, role: "PLAYER" | "GM", dpi: number) {
  const { origin, bounds } = getOriginAndBounds(settings, item, dpi);

  // Create stats
  const [hp, maxHp, tempHp, pd, ad, statsVisible] = getTokenStats(item);

  if (role === "PLAYER" && !statsVisible && !settings.showBars) {
    // Display nothing, explicitly remove all attachments
    addHealthAttachmentsToArray(deleteItemsArray, item.id);
    addArmorAttachmentsToArray(deleteItemsArray, item.id); // reused for PD
    addTempHealthAttachmentsToArray(deleteItemsArray, item.id);
    addAdAttachmentsToArray(deleteItemsArray, item.id);
  } else if (role === "PLAYER" && !statsVisible && settings.showBars) {
    // Display limited stats depending on GM configuration
    createLimitedHealthBar();
  } else {
    // Display full stats
    const hasHealthBar = createFullHealthBar();
    const hasPdBubble = createPD(hasHealthBar);
    const hasAdBubble = createAD(hasHealthBar, hasPdBubble);
    createTempHp(hasHealthBar, hasPdBubble, hasAdBubble);
  }

  // Create name tag
  const plainText = getName(item);
  if (settings.nameTags && plainText !== "") {
    const nameTagPosition = {
      x: origin.x,
      y: origin.y,
    };
    if (settings.barAtTop) {
      if (maxHp <= 0 || (role === "PLAYER" && !statsVisible && !settings.showBars)) {
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
    // Clear other attachments
    deleteItemsArray.push(hpTextId(item.id));
    addArmorAttachmentsToArray(deleteItemsArray, item.id); // reused for PD
    addTempHealthAttachmentsToArray(deleteItemsArray, item.id);
    addAdAttachmentsToArray(deleteItemsArray, item.id);

    // return early if health bar shouldn't be created
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

  /**
   * Create a health bar.
   * @returns True if a health bar was created.
   */
  function createFullHealthBar() {
    // return early if health bar shouldn't be created
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
   * Create the PD bubble (reuses old AC attachment IDs and deletion helpers).
   * @returns True if PD bubble was created.
   */
  function createPD(hasHealthBar: boolean) {
    if (pd <= 0) {
      addArmorAttachmentsToArray(deleteItemsArray, item.id);
      return false;
    }

    const pdPosition = {
      x: origin.x + bounds.width / 2 - DIAMETER / 2 - 2,
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
        acBackgroundId(item.id), // reuse old AC ids
        acTextId(item.id),
      ),
    );

    return true;
  }

  /**
   * Create the AD bubble.
   * @returns True if AD bubble was created.
   */
  function createAD(hasHealthBar: boolean, hasPdBubble: boolean) {
    if (ad <= 0) {
      addAdAttachmentsToArray(deleteItemsArray, item.id);
      return false;
    }

    const adPosition = {
      x:
        origin.x +
        bounds.width / 2 -
        DIAMETER * (hasPdBubble ? 2.5 : 1.5) -
        6,
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
   * Create the temp HP bubble.
   */
  function createTempHp(
    hasHealthBar: boolean,
    hasPdBubble: boolean,
    hasAdBubble: boolean,
  ) {
    if (tempHp <= 0) {
      addTempHealthAttachmentsToArray(deleteItemsArray, item.id);
      return;
    }

    const tempHpPosition = {
      x:
        origin.x +
        bounds.width / 2 -
        DIAMETER * (hasPdBubble ? 1.5 : 0.5) -
        4,
      y: origin.y - DIAMETER / 2 - 4 - (hasHealthBar ? FULL_BAR_HEIGHT : 0),
    };

    // If AD exists, shift Temp HP left so bubbles don't overlap.
    if (hasAdBubble) {
      tempHpPosition.x =
        origin.x +
        bounds.width / 2 -
        DIAMETER * (hasPdBubble ? 3.5 : 2.5) -
        8;
    }

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

async function sendItemsToScene(
  addItemsArray: Item[],
  deleteItemsArray: string[],
) {
  await OBR.scene.local.deleteItems(deleteItemsArray);
  await OBR.scene.local.addItems(addItemsArray);
  deleteItemsArray.length = 0;
  addItemsArray.length = 0;
}
