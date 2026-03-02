import { Item } from "@owlbear-rodeo/sdk";

type Token = {
  item: Item;
  hp: number;
  maxHp: number;
  pd: number;
  ad: number;
  hideStats: boolean;
  group: number;
  index: number;
};

export default Token;
