import Token from "@/metadataHelpers/TokenType";
import OBR, { Math2, Metadata, Vector2 } from "@owlbear-rodeo/sdk";
import { calculateNewHp, calculateScaledHpDiff } from "./healthCalculations";
import {
  AD_METADATA_ID,
  HP_METADATA_ID,
  MAX_HP_METADATA_ID,
  PD_METADATA_ID,
  StatMetadataID,
  TEMP_HP_METADATA_ID,
} from "@/metadataHelpers/itemMetadataIds";
import { getPluginId } from "@/getPluginId";
import {
  Action,
  BulkEditorState,
  StampedDiceRoll,
  StatOverwriteData,
} from "./types";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";

/* Action Open */

export const COMMAND_INPUT_ID = "commandInput";
export const BROADCAST_CHANNEL = getPluginId("channel");
export const TOGGLE_ACTION_OPEN = "toggleActionOpen";

export function toggleActionOpen(isOpen: boolean) {
  if (isOpen) OBR.action.close();
  else {
    OBR.action.open();
    setTimeout(() => document.getElementById(COMMAND_INPUT_ID)?.focus(), 100);
  }
}

/* Items */

export const DEFAULT_DAMAGE_SCALE = 3;
export const DEFAULT_INCLUDED = false;

export const getDamageScaleOption = (
  key: string,
  map: Map<string, number>,
): number => {
  const value = map.get(key);
  if (typeof value !== "number") return DEFAULT_DAMAGE_SCALE;
  return value;
};

export const getIncluded = (key: string, map: Map<string, boolean>) => {
  const value = map.get(key);
  if (typeof value !== "boolean") return DEFAULT_INCLUDED;
  return value;
};

export async function applyHealthDiffToItems(
  hpDiff: number,
  includedItems: Map<string, boolean>,
  damageScaleSettings: Map<string, number>,
  tokens: Token[],
) {
  await OBR.scene.items.updateItems(
    tokens.map((token) => token.item),
    (items) => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id !== tokens[i].item.id) {
          throw "Error: Item mismatch in Stat Bubbles Damage Tool, could not update token.";
        }

        const included = getIncluded(tokens[i].item.id, includedItems);
        const scaledHpDiff = calculateScaledHpDiff(
          included
            ? getDamageScaleOption(tokens[i].item.id, damageScaleSettings)
            : 0,
          hpDiff,
        );

        // Set new HP and temp HP values
        const [newHp, newTempHp] = calculateNewHp(
          tokens[i].hp.valueOf(),
          tokens[i].maxHp.valueOf(),
          tokens[i].tempHp.valueOf(),
          scaledHpDiff,
        );

        const newMetadata = {
          [HP_METADATA_ID]: newHp,
          [TEMP_HP_METADATA_ID]: newTempHp,
        };

        let retrievedMetadata: any;
        if (items[i].metadata[getPluginId("metadata")]) {
          retrievedMetadata = JSON.parse(
            JSON.stringify(items[i].metadata[getPluginId("metadata")]),
          );
        }

        const combinedMetadata = { ...retrievedMetadata, ...newMetadata };

        items[i].metadata[getPluginId("metadata")] = combinedMetadata;
      }
    },
  );
}

export async function overwriteStats(
  statOverwrites: StatOverwriteData,
  includedItems: Map<string, boolean>,
  tokens: Token[],
) {
  await OBR.scene.items.updateItems(
    tokens.map((token) => token.item),
    (items) => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id !== tokens[i].item.id) {
          throw "Error: Item mismatch in Stat Bubbles Damage Tool, could not update token.";
        }

        const included = getIncluded(tokens[i].item.id, includedItems);

        if (included) {
          let newMetadata: Record<string, number> = {};

          /**
           * NOTE:
           * The UI/types still call PD "armorClass". We treat it as PD in DC20.
           */
          const stats: [string, StatMetadataID][] = [
            [statOverwrites.hitPoints, HP_METADATA_ID],
            [statOverwrites.maxHitPoints, MAX_HP_METADATA_ID],
            [statOverwrites.tempHitPoints, TEMP_HP_METADATA_ID],
            [statOverwrites.armorClass, PD_METADATA_ID], // armorClass UI field -> PD
            [statOverwrites.ad, AD_METADATA_ID],
          ];

          for (const stat of stats) {
            if (stat[0] !== "") {
              const value = parseFloat(stat[0]);
              if (Number.isFinite(value) && Number.isInteger(value)) {
                newMetadata = { ...newMetadata, [stat[1]]: value };
              }
            }
          }

          let retrievedMetadata: any;
          if (items[i].metadata[getPluginId("metadata")]) {
            retrievedMetadata = JSON.parse(
              JSON.stringify(items[i].metadata[getPluginId("metadata")]),
            );
          }

          const combinedMetadata = { ...retrievedMetadata, ...newMetadata };

          items[i].metadata[getPluginId("metadata")] = combinedMetadata;
        }
      }
    },
  );
}

export function writeTokenSortingToItems(tokens: Token[]) {
  OBR.scene.items.updateItems(
    tokens.map((token) => token.item),
    (items) => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id !== tokens[i].item.id) {
          throw "Error: Item mismatch in Stat Bubbles Damage Tool, could not update token.";
        }

        let newMetadata = {
          index: tokens[i].index,
        };

        let retrievedMetadata: any;
        if (items[i].metadata[getPluginId("metadata")]) {
          retrievedMetadata = JSON.parse(
            JSON.stringify(items[i].metadata[getPluginId("metadata")]),
          );
        }

        const combinedMetadata = { ...retrievedMetadata, ...newMetadata };

        items[i].metadata[getPluginId("metadata")] = combinedMetadata;
      }
    },
  );
}

/* Dice */

const DICE_METADATA_ID = getPluginId("diceRolls");

export async function setSceneRolls(rolls: StampedDiceRoll[]) {
  await OBR.scene.setMetadata({ [DICE_METADATA_ID]: rolls });
}

export async function getRollsFromScene(sceneMetadata?: Metadata) {
  if (sceneMetadata === undefined)
    sceneMetadata = await OBR.scene.getMetadata();
  const diceRolls = sceneMetadata[DICE_METADATA_ID];
  if (diceRolls === undefined) return [];
  if (!isDiceRollArray(diceRolls)) throw "Error: invalid dice roll array";
  return diceRolls;
}

function isDiceRollArray(rolls: unknown): rolls is StampedDiceRoll[] {
  if (!Array.isArray(rolls)) return false;
  for (const roll of rolls) {
    if (typeof roll?.timeStamp !== "number") return false;
    if (typeof roll?.total !== "number") return false;
    if (typeof roll?.roll !== "string") return false;
    if (typeof roll?.playerName !== "string") return false;
    if (typeof roll?.visibility !== "string") return false;
    if (roll.visibility === "PRIVATE") {
      if (
        typeof (roll as any)?.userId !== "string" &&
        typeof (roll as any)?.playerId !== "string"
      )
        return false;
    }
  }
  return true;
}

const MAX_DICE_ROLLS = 100;
export function reducer(
  state: BulkEditorState,
  action: Action,
): BulkEditorState {
  switch (action.type) {
    case "set-operation":
      return {
        ...state,
        operation: action.operation,
        ...(state.operation !== action.operation
          ? {
              damageScaleOptions: new Map<string, number>(),
              includedItems:
                action.operation === "none"
                  ? new Map<string, boolean>()
                  : new Map([
                      ...state.mostRecentSelection.map(
                        (id): [string, boolean] => [id, true],
                      ),
                      ...state.includedItems,
                    ]),
            }
          : {}),
      };
    case "set-rolls":
      return { ...state, rolls: action.rolls };
    case "add-roll":
      const roll = new DiceRoll(action.diceExpression);
      const rolls = [
        action.visibility === "PRIVATE"
          ? {
              timeStamp: Date.now(),
              total: roll.total,
              roll: roll.toString(),
              playerName: action.playerName,
              visibility: action.visibility,
              playerId: action.playerId,
            }
          : {
              timeStamp: Date.now(),
              total: roll.total,
              roll: roll.toString(),
              playerName: action.playerName,
              visibility: action.visibility,
            },
        ...state.rolls.splice(0, MAX_DICE_ROLLS - 1),
      ];
      setSceneRolls(rolls);
      setTimeout(
        () => action.dispatch({ type: "set-animate-roll", animateRoll: false }),
        500,
      );
      return {
        ...state,
        rolls: rolls,
        value: roll.total,
        animateRoll: true,
      };
    case "set-value":
      return { ...state, value: action.value };
    case "set-animate-roll":
      return { ...state, animateRoll: action.animateRoll };
    case "set-stat-overwrites":
      return { ...state, statOverwrites: action.statOverWrites };
    case "clear-stat-overwrites":
      return { ...state, statOverwrites: unsetStatOverwrites() };
    case "set-hit-points-overwrite":
      return {
        ...state,
        statOverwrites: {
          ...state.statOverwrites,
          hitPoints: action.hitPointsOverwrite,
        },
      };
    case "set-max-hit-points-overwrite":
      return {
        ...state,
        statOverwrites: {
          ...state.statOverwrites,
          maxHitPoints: action.maxHitPointsOverwrite,
        },
      };
    case "set-temp-hit-points-overwrite":
      return {
        ...state,
        statOverwrites: {
          ...state.statOverwrites,
          tempHitPoints: action.tempHitPointsOverwrite,
        },
      };
    case "set-armor-class-overwrite":
      // NOTE: treat as PD until UI is fully renamed
      return {
        ...state,
        statOverwrites: {
          ...state.statOverwrites,
          armorClass: action.armorClassOverwrite,
        },
      };
    case "set-ad-overwrite":
      return {
        ...state,
        statOverwrites: {
          ...state.statOverwrites,
          ad: action.adOverwrite,
        },
      };
    case "set-damage-scale-options":
      return {
        ...state,
        damageScaleOptions: new Map(action.damageScaleOptions),
      };
    case "set-included-items":
      return {
        ...state,
        includedItems: new Map(action.includedItems),
      };
    case "set-show-items":
      return { ...state, showItems: action.showItems };
    case "set-most-recent-selection":
      return { ...state, mostRecentSelection: action.mostRecentSelection };
    default:
      console.log("unhandled action");
      return state;
  }
}

export const unsetStatOverwrites = () => {
  return {
    hitPoints: "",
    maxHitPoints: "",
    tempHitPoints: "",
    armorClass: "", // treated as PD for now
    ad: "",
  };
};

export async function handleTokenClicked(itemId: string, replace: boolean) {
  const selectedItems = await OBR.player.getSelection();
  if (selectedItems && selectedItems.includes(itemId))
    OBR.player.deselect([itemId]);
  else OBR.player.select([itemId], replace);
}

async function deselectText() {
  window.getSelection()?.removeAllRanges();
}

export async function focusItem(itemId: string) {
  deselectText();

  await OBR.player.select([itemId]);

  const bounds = await OBR.scene.items.getItemBounds([itemId]);
  const boundsAbsoluteCenter = await OBR.viewport.transformPoint(bounds.center);

  const viewportWidth = await OBR.viewport.getWidth();
  const viewportHeight = await OBR.viewport.getHeight();
  const viewportCenter: Vector2 = {
    x: viewportWidth / 2,
    y: viewportHeight / 2,
  };

  const absoluteCenter = Math2.subtract(boundsAbsoluteCenter, viewportCenter);

  const relativeCenter =
    await OBR.viewport.inverseTransformPoint(absoluteCenter);

  const viewportScale = await OBR.viewport.getScale();
  const viewportPosition = Math2.multiply(relativeCenter, -viewportScale);

  await OBR.viewport.animateTo({
    scale: viewportScale,
    position: viewportPosition,
  });

  OBR.player.select([itemId]);
}
