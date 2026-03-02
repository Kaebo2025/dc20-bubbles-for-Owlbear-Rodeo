export function calculateNewHp(
  hp: number,
  maxHp: number,
  tempHp: number,
  hpDiff: number,
) {
  let newHp: number;
  let newTempHp: number;

  // If HP was less than 0 use 0 instead,
  // displaying negative HP is useful for overflow but not for AOE effects
  if (hp < 0) {
    hp = 0;
  }

  // If temp HP was less than 0 use 0 instead,
  // displaying negative HP is useful for overflow but not for AOE effects
  if (tempHp < 0) {
    tempHp = 0;
  }

  if (hpDiff > 0) {
    // Healing
    const healing = hpDiff;

    newHp = hp + healing;
    newTempHp = tempHp;

    if (newHp > maxHp) {
      newHp = maxHp;
    }
  } else {
    // Damage
    const damage = Math.abs(hpDiff);

    if (tempHp <= 0) {
      // Doesn't have temp HP
      newHp = hp - damage;
      newTempHp = tempHp;
    } else {
      // Has temp HP
      if (tempHp > damage) {
        // Damage only changes temp HP
        newHp = hp;
        newTempHp = tempHp - damage;
      } else {
        // Damage overflows into regular HP
        newHp = hp + tempHp - damage;
        newTempHp = 0;
      }
    }
  }

  // Restrict HP to values within [-999, 9999]
  if (newHp > 9999) {
    newHp = 9999;
  } else if (newHp < -999) {
    newHp = -999;
  }

  // Restrict temp HP to values within [-999, 999]
  if (newTempHp > 999) {
    newTempHp = 999;
  } else if (newTempHp < -999) {
    newTempHp = -999;
  }

  return [newHp, newTempHp];
}

export function scaleHpDiff(
  damageScaleOptions: Map<string, number>,
  hpDiff: number,
  key: string,
) {
  const damageScaleOption = damageScaleOptions.get(key);
  if (!damageScaleOption) throw "Error: Invalid radio button value.";
  return calculateScaledHpDiff(damageScaleOption, hpDiff);
}

export function calculateScaledHpDiff(damageScaleOption: number, hpDiff: number) {
  switch (damageScaleOption) {
    case 0:
      return 0;
    case 1:
      return Math.trunc(Math.trunc(hpDiff * 0.5) * 0.5);
    case 2:
      return Math.trunc(hpDiff * 0.5);
    case 3:
      return Math.trunc(hpDiff);
    case 4:
      return Math.trunc(hpDiff) * 2;
    default:
  }
  throw "Error: Invalid radio button value.";
}
